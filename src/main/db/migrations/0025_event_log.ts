export const sql = `
CREATE TABLE event_log (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('error', 'crash')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  error_code TEXT,
  context TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_event_log_created_at ON event_log(created_at);
`
