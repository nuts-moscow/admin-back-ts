-- First buy-in must use Free payment when true (re-entries unchanged)
ALTER TABLE tournament_structures
  ADD COLUMN IF NOT EXISTS entry_free_only boolean NOT NULL DEFAULT false;
