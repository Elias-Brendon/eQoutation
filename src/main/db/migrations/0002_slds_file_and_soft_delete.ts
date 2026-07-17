export const sql = `
ALTER TABLE slds ADD COLUMN file_path TEXT NOT NULL DEFAULT '';
ALTER TABLE slds ADD COLUMN deleted_at TEXT;
`
