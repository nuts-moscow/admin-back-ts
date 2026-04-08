-- Per-tournament rating settings (not on structure template)
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS rating_guarantee_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rating_points_coefficient double precision NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rating_bounty_coefficient double precision NOT NULL DEFAULT 1;

ALTER TABLE tournament_result_players
  ADD COLUMN IF NOT EXISTS rating_manual_adjustment double precision NOT NULL DEFAULT 0;
