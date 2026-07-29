export const sql = `
DROP INDEX IF EXISTS idx_catalog_sku;
CREATE UNIQUE INDEX idx_catalog_sku ON catalog_items(sku);
`
