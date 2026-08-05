export const sql = `
ALTER TABLE quotation_lines ADD COLUMN removed_at TEXT NULL;
`
