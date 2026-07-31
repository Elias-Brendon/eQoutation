export const sql = `
ALTER TABLE projects ADD COLUMN sector TEXT NULL;
ALTER TABLE projects ADD COLUMN quotation_number TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN company TEXT NULL;
ALTER TABLE projects ADD COLUMN coordinator TEXT NULL;
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'pending_review';
ALTER TABLE projects ADD COLUMN created_by TEXT NULL;

UPDATE projects
SET quotation_number = 'PRJ-' || substr('0000' || (
  SELECT COUNT(*)
  FROM projects AS p2
  WHERE p2.created_at < projects.created_at
     OR (p2.created_at = projects.created_at AND p2.id <= projects.id)
), -4, 4);
`
