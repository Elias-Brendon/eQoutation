export const sql = `
CREATE TABLE catalog_items (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  description TEXT NOT NULL,
  maker TEXT NOT NULL DEFAULT '',
  family TEXT NOT NULL DEFAULT '',
  series TEXT NOT NULL DEFAULT '',
  list_price REAL NOT NULL DEFAULT 0,
  discount_factor REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  uom TEXT NOT NULL DEFAULT '',
  source_row INTEGER,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_catalog_sku ON catalog_items(sku);
CREATE INDEX idx_catalog_description ON catalog_items(description);

CREATE TABLE catalog_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_path TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  synced_at TEXT NOT NULL
);
`
