ALTER TABLE tournaments
  ADD COLUMN rating_enabled      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN rating_season_year  INTEGER,
  ADD COLUMN rating_season_month INTEGER;

ALTER TABLE player_tournament_rating_facts
  ADD COLUMN rating_season_year  INTEGER,
  ADD COLUMN rating_season_month INTEGER;

CREATE INDEX idx_ptrf_season
  ON player_tournament_rating_facts (rating_season_year, rating_season_month)
  WHERE rating_season_year IS NOT NULL;
