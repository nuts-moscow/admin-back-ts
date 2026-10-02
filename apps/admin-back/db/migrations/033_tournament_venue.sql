-- Additive migration: existing tournaments keep their original venue.
-- No changes to tournament IDs, registrations, results, payments or Redis.
-- Apply BEFORE deploying the backend. Safe to run again.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS venue_id TEXT NOT NULL DEFAULT 'mansarda'
    CONSTRAINT tournaments_venue_id_check CHECK (venue_id IN ('mansarda', 'everest-mansion'));
COMMIT;
