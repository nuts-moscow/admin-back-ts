-- Max re-entries per player when not freeze-out (default 5)
ALTER TABLE tournament_structures
  ADD COLUMN IF NOT EXISTS max_reentries integer NOT NULL DEFAULT 5;
