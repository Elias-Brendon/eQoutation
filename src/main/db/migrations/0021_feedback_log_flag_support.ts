export const sql = `
CREATE TABLE feedback_log_new (
  id TEXT PRIMARY KEY,
  quotation_line_id TEXT REFERENCES quotation_lines(id) ON DELETE CASCADE,
  flag_id TEXT REFERENCES flags(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  ai_value TEXT NOT NULL,
  human_value TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('accepted','corrected','flagged_for_later')),
  note TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO feedback_log_new
  (id, quotation_line_id, flag_id, field_changed, ai_value, human_value, action, note, created_at)
  SELECT id, quotation_line_id, NULL, field_changed, ai_value, human_value, action, note, created_at
  FROM feedback_log;

DROP TABLE feedback_log;
ALTER TABLE feedback_log_new RENAME TO feedback_log;

CREATE INDEX idx_feedback_log_line_id ON feedback_log(quotation_line_id);
CREATE INDEX idx_feedback_log_flag_id ON feedback_log(flag_id);
`
