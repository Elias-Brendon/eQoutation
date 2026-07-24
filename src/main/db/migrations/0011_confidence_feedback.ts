export const sql = `
ALTER TABLE quotation_lines ADD COLUMN ai_confidence REAL NOT NULL DEFAULT 1;
CREATE TABLE feedback_log (
  id TEXT PRIMARY KEY,
  quotation_line_id TEXT NOT NULL REFERENCES quotation_lines(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  ai_value TEXT NOT NULL,
  human_value TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('accepted','corrected','flagged_for_later')),
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_feedback_log_line_id ON feedback_log(quotation_line_id);
`
