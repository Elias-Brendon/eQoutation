import { sql as m0001 } from './0001_init'
import { sql as m0002 } from './0002_slds_file_and_soft_delete'
import { sql as m0003 } from './0003_annotations'
import { sql as m0004 } from './0004_catalog'
import { sql as m0005 } from './0005_extractions'
import { sql as m0006 } from './0006_quotations'
import { sql as m0007 } from './0007_flags_comments'
import { sql as m0008 } from './0008_auth'
import { sql as m0009 } from './0009_password_recovery'
import { sql as m0010 } from './0010_annotation_shapes'
import { sql as m0011 } from './0011_confidence_feedback'
import { sql as m0012 } from './0012_panel_name'
import { sql as m0013 } from './0013_project_currency'
import { sql as m0014 } from './0014_quotation_line_sku'
import { sql as m0015 } from './0015_project_currency_iso'
import { sql as m0016 } from './0016_fx_rate_cache'
import { sql as m0017 } from './0017_quotation_line_component_type'
import { sql as m0018 } from './0018_catalog_items_sku_unique'
import { sql as m0019 } from './0019_extraction_token_usage'
import { sql as m0020 } from './0020_annotation_ai_metadata'
import { sql as m0021 } from './0021_feedback_log_flag_support'

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
  { version: 7, name: '0007_flags_comments', sql: m0007 },
  { version: 8, name: '0008_auth', sql: m0008 },
  { version: 9, name: '0009_password_recovery', sql: m0009 },
  { version: 10, name: '0010_annotation_shapes', sql: m0010 },
  { version: 11, name: '0011_confidence_feedback', sql: m0011 },
  { version: 12, name: '0012_panel_name', sql: m0012 },
  { version: 13, name: '0013_project_currency', sql: m0013 },
  { version: 14, name: '0014_quotation_line_sku', sql: m0014 },
  { version: 15, name: '0015_project_currency_iso', sql: m0015 },
  { version: 16, name: '0016_fx_rate_cache', sql: m0016 },
  { version: 17, name: '0017_quotation_line_component_type', sql: m0017 },
  { version: 18, name: '0018_catalog_items_sku_unique', sql: m0018 },
  { version: 19, name: '0019_extraction_token_usage', sql: m0019 },
  { version: 20, name: '0020_annotation_ai_metadata', sql: m0020 },
  { version: 21, name: '0021_feedback_log_flag_support', sql: m0021 }
]
