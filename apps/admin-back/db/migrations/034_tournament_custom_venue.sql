-- Apply after 033 and BEFORE the new backend. Existing venues and registrations stay unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS custom_venue JSONB;
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_venue_id_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_venue_id_check
  CHECK (venue_id IN ('mansarda', 'everest-mansion', 'custom'));
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_custom_venue_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_custom_venue_check
  CHECK (venue_id <> 'custom' OR COALESCE(
      jsonb_typeof(custom_venue) = 'object'
      AND jsonb_typeof(custom_venue->'name') = 'string'
      AND length(btrim(custom_venue->>'name')) BETWEEN 1 AND 150
      AND jsonb_typeof(custom_venue->'address') = 'string'
      AND length(btrim(custom_venue->>'address')) BETWEEN 1 AND 300
      AND jsonb_typeof(custom_venue->'mapsUrl') = 'string'
      AND length(custom_venue->>'mapsUrl') BETWEEN 1 AND 2048
      AND custom_venue->>'mapsUrl' ~ '^https?://[^[:space:]]+$', false));
COMMIT;
