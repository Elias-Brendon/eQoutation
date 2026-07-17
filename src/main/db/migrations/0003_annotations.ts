export const sql = `
CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  sld_id TEXT NOT NULL REFERENCES slds(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  author_type TEXT NOT NULL DEFAULT 'human' CHECK (author_type IN ('human', 'ai')),
  shape_type TEXT NOT NULL CHECK (shape_type IN ('freehand', 'pin')),
  path_data TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#f2652c',
  comment_text TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_annotations_sld_page ON annotations(sld_id, page_number);
`
