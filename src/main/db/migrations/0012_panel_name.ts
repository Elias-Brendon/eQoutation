export const sql = `
ALTER TABLE quotation_lines ADD COLUMN panel_name TEXT NOT NULL DEFAULT '';
`
