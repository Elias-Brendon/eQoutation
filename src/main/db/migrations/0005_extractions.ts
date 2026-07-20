export const sql = `
CREATE TABLE extractions (
  id TEXT PRIMARY KEY,
  sld_id TEXT NOT NULL REFERENCES slds(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'error')),
  model TEXT,
  raw_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX idx_extractions_sld_id ON extractions(sld_id);
`
