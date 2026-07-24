export const sql = `
ALTER TABLE projects ADD COLUMN currency TEXT NOT NULL DEFAULT '$';
`
