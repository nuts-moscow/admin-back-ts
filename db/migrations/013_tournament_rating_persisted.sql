ALTER TABLE tournament_result_players
  ADD COLUMN IF NOT EXISTS rating_persisted jsonb NOT NULL DEFAULT '{}'::jsonb;
