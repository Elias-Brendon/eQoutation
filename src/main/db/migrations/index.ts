import { sql as m0001 } from './0001_init'
import { sql as m0002 } from './0002_slds_file_and_soft_delete'
import { sql as m0003 } from './0003_annotations'

export interface Migration {
  version: number
  name: string
  sql: string
}

export const migrations: Migration[] = [
  { version: 1, name: '0001_init', sql: m0001 },
  { version: 2, name: '0002_slds_file_and_soft_delete', sql: m0002 },
  { version: 3, name: '0003_annotations', sql: m0003 }
]
