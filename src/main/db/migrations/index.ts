import { sql as m0001 } from './0001_init'
import { sql as m0002 } from './0002_slds_file_and_soft_delete'
import { sql as m0003 } from './0003_annotations'
import { sql as m0004 } from './0004_catalog'
import { sql as m0005 } from './0005_extractions'
import { sql as m0006 } from './0006_quotations'
import { sql as m0007 } from './0007_flags_comments'

export interface Migration {
  version: number
  name: string
  sql: string
}

export const migrations: Migration[] = [
  { version: 1, name: '0001_init', sql: m0001 },
  { version: 2, name: '0002_slds_file_and_soft_delete', sql: m0002 },
  { version: 3, name: '0003_annotations', sql: m0003 },
  { version: 4, name: '0004_catalog', sql: m0004 },
  { version: 5, name: '0005_extractions', sql: m0005 },
  { version: 6, name: '0006_quotations', sql: m0006 },
  { version: 7, name: '0007_flags_comments', sql: m0007 }
]
