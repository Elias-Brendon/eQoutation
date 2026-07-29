export const sql = `
ALTER TABLE extractions ADD COLUMN input_tokens INTEGER;
ALTER TABLE extractions ADD COLUMN output_tokens INTEGER;
`
