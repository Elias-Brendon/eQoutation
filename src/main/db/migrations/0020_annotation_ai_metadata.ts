export const sql = `
ALTER TABLE annotations ADD COLUMN linked_flag_id TEXT REFERENCES flags(id) ON DELETE CASCADE;
ALTER TABLE annotations ADD COLUMN resolved_at TEXT;
`
