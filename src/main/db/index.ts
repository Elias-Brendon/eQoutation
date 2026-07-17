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

function openDb(): Database.Database {
  const dbPath = join(app.getPath('userData'), 'eqoutation.sqlite')
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
