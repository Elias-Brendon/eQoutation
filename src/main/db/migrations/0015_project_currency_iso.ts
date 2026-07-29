export const sql = `
ALTER TABLE projects ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN exchange_rate_is_manual INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN exchange_rate_updated_at TEXT;

-- Prior to this migration 'currency' was a freeform display symbol (default
-- '$', otherwise whatever the user typed) with no real FX conversion behind
-- it. Map the common legacy symbols to their ISO 4217 code so existing
-- projects keep their intended currency instead of being forced to MYR;
-- anything already a valid ISO code (e.g. a user who typed 'USD' directly)
-- is left untouched, and only truly unrecognized values fall back to MYR.
UPDATE projects SET currency = 'USD' WHERE currency = '$';
UPDATE projects SET currency = 'MYR' WHERE currency IN ('RM', 'Rm', 'rm');
UPDATE projects SET currency = 'SGD' WHERE currency = 'S$';
UPDATE projects SET currency = 'EUR' WHERE currency = '€';
UPDATE projects SET currency = 'GBP' WHERE currency = '£';
UPDATE projects SET currency = 'JPY' WHERE currency = '¥';
UPDATE projects SET currency = 'THB' WHERE currency = '฿';
UPDATE projects SET currency = 'INR' WHERE currency = '₹';
UPDATE projects SET currency = 'PHP' WHERE currency = '₱';
UPDATE projects SET currency = 'HKD' WHERE currency = 'HK$';
UPDATE projects SET currency = 'AUD' WHERE currency = 'A$';
UPDATE projects SET currency = 'CAD' WHERE currency = 'C$';
UPDATE projects SET currency = 'NZD' WHERE currency = 'NZ$';
UPDATE projects SET currency = 'BRL' WHERE currency = 'R$';
UPDATE projects SET currency = 'MYR' WHERE currency NOT IN (
  'MYR','USD','SGD','EUR','GBP','THB','IDR','PHP','CNY','JPY','KRW','HKD','INR',
  'AUD','NZD','CAD','CHF','SEK','NOK','DKK','ISK','ZAR','TRY','ILS','PLN','CZK','HUF','RON','MXN','BRL'
);
`
