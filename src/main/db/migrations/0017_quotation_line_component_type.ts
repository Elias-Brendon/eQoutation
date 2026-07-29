export const sql = `
ALTER TABLE quotation_lines ADD COLUMN component_type TEXT NOT NULL DEFAULT '';
`
