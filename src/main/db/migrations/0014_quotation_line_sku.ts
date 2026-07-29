export const sql = `
ALTER TABLE quotation_lines ADD COLUMN sku TEXT NOT NULL DEFAULT '';
`
