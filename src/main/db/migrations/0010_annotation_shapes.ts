export const sql = `
CREATE TABLE annotations_new (
  id TEXT PRIMARY KEY,
  sld_id TEXT NOT NULL REFERENCES slds(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  author_type TEXT NOT NULL DEFAULT 'human' CHECK (author_type IN ('human', 'ai')),
  shape_type TEXT NOT NULL CHECK (shape_type IN ('freehand', 'pin', 'circle', 'rectangle', 'text')),
  path_data TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#f2652c',
  stroke_width REAL NOT NULL DEFAULT 2.5,
  comment_text TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO annotations_new
  (id, sld_id, page_number, author_type, shape_type, path_data, color, stroke_width, comment_text, created_at)
  SELECT id, sld_id, page_number, author_type, shape_type, path_data, color, 2.5, comment_text, created_at
  FROM annotations;

DROP TABLE annotations;
ALTER TABLE annotations_new RENAME TO annotations;

CREATE INDEX idx_annotations_sld_page ON annotations(sld_id, page_number);
`
