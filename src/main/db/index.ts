import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { migrations } from './migrations'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    db = openDb()
  }
  return db
}

// Test-only: closes and clears the cached connection so the next getDb()
// call opens a fresh one. Used between tests to get an isolated :memory: DB
// per test rather than sharing state across the whole test file.
export function closeDb(): void {
  db?.close()
  db = null
}

function openDb(): Database.Database {
  // EQOUTATION_DB_PATH lets tests point at an isolated (e.g. ':memory:')
  // database instead of the user's real eqoutation.sqlite. Only ever set by
  // test setup — never set in the packaged app.
  const dbPath = process.env.EQOUTATION_DB_PATH ?? join(app.getPath('userData'), 'eqoutation.sqlite')
  const instance = new Database(dbPath)
  instance.pragma('journal_mode = WAL')
  instance.pragma('foreign_keys = ON')
  runMigrations(instance)
  return instance
}

function runMigrations(instance: Database.Database): void {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)

  const appliedVersions = new Set(
    instance
      .prepare('SELECT version FROM schema_version')
      .all()
      .map((row) => (row as { version: number }).version)
  )

  const pending = migrations
    .filter((migration) => !appliedVersions.has(migration.version))
    .sort((a, b) => a.version - b.version)

  for (const migration of pending) {
    const apply = instance.transaction(() => {
      instance.exec(migration.sql)
      instance
        .prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString())
    })
    apply()
  }
}
