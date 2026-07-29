export const sql = `
CREATE TABLE IF NOT EXISTS fx_rate_cache (
  currency TEXT PRIMARY KEY,
  rate REAL NOT NULL,
  fetched_at TEXT NOT NULL
);
`
