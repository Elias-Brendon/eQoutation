export const sql = `
CREATE TABLE quotations (
  id TEXT PRIMARY KEY,
  sld_id TEXT NOT NULL REFERENCES slds(id) ON DELETE CASCADE,
  extraction_id TEXT REFERENCES extractions(id),
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('generating', 'pending_review', 'approved', 'rejected')),
  excel_file_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_quotations_sld_id ON quotations(sld_id);

CREATE TABLE quotation_lines (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  catalog_item_id TEXT REFERENCES catalog_items(id),
  page_number INTEGER NOT NULL DEFAULT 1,
  tag TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  maker TEXT NOT NULL DEFAULT '',
  qty REAL NOT NULL DEFAULT 1,
  uom TEXT NOT NULL DEFAULT '',
  list_price REAL NOT NULL DEFAULT 0,
  discount_factor REAL NOT NULL DEFAULT 1,
  unit_cost REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  margin REAL NOT NULL DEFAULT 1.35,
  quote_price REAL NOT NULL DEFAULT 0,
  match_status TEXT NOT NULL DEFAULT 'unknown' CHECK (match_status IN ('matched', 'unknown')),
  match_confidence REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_quotation_lines_quotation_id ON quotation_lines(quotation_id);
`
