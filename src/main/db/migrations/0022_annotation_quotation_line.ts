export const sql = `
ALTER TABLE annotations ADD COLUMN linked_quotation_line_id TEXT REFERENCES quotation_lines(id) ON DELETE CASCADE;
`
