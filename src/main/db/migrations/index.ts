import { sql as m0001 } from './0001_init'

export interface Migration {
  version: number
  name: string
  sql: string
}

export const migrations: Migration[] = [{ version: 1, name: '0001_init', sql: m0001 }]
