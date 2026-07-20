export const sql = `
CREATE TABLE flags (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  quotation_line_id TEXT REFERENCES quotation_lines(id) ON DELETE CASCADE,
  origin TEXT NOT NULL CHECK (origin IN ('matcher', 'ai', 'human')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning')),
  message TEXT NOT NULL,
  page_number INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution_note TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX idx_flags_quotation_id ON flags(quotation_id);
CREATE INDEX idx_flags_quotation_line_id ON flags(quotation_line_id);
CREATE INDEX idx_flags_status ON flags(status);

CREATE TABLE quotation_comments (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_quotation_comments_quotation_id ON quotation_comments(quotation_id);
`
