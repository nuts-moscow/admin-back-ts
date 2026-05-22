-- One row per (tournament, player): flat rating columns for analytics; mirrors tournament_result_players rating after completion / manual patch.

CREATE TABLE IF NOT EXISTS player_tournament_rating_facts (
  tournament_id             INTEGER NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  player_id                 TEXT    NOT NULL,
  tournament_player_id      INTEGER NOT NULL,
  tournament_date_ms        BIGINT  NOT NULL,
  rating_table_id           INTEGER NOT NULL REFERENCES rating_tables (id),
  rating_field_size         INTEGER NOT NULL,
  player_status             TEXT    NOT NULL,
  placement                 INTEGER,
  base_points               DOUBLE PRECISION NOT NULL,
  guarantee_bonus           DOUBLE PRECISION NOT NULL,
  points_coefficient        DOUBLE PRECISION NOT NULL,
  from_table_after_coefficient DOUBLE PRECISION NOT NULL,
  bounty_count              DOUBLE PRECISION NOT NULL,
  bounty_points             DOUBLE PRECISION NOT NULL,
  bounty_coefficient        DOUBLE PRECISION NOT NULL,
  non_placement_accrued     DOUBLE PRECISION NOT NULL,
  manual_adjustment         DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_points              DOUBLE PRECISION NOT NULL,
  breakdown                 JSONB   NOT NULL DEFAULT '{}'::jsonb,
  recorded_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_ptrf_player_date
  ON player_tournament_rating_facts (player_id, tournament_date_ms DESC);

CREATE INDEX IF NOT EXISTS idx_ptrf_tournament_date
  ON player_tournament_rating_facts (tournament_date_ms);

CREATE INDEX IF NOT EXISTS idx_ptrf_rating_table_date
  ON player_tournament_rating_facts (rating_table_id, tournament_date_ms);

-- Backfill from existing results (rating_field_size unknown for legacy → 0)
INSERT INTO player_tournament_rating_facts (
  tournament_id,
  player_id,
  tournament_player_id,
  tournament_date_ms,
  rating_table_id,
  rating_field_size,
  player_status,
  placement,
  base_points,
  guarantee_bonus,
  points_coefficient,
  from_table_after_coefficient,
  bounty_count,
  bounty_points,
  bounty_coefficient,
  non_placement_accrued,
  manual_adjustment,
  total_points,
  breakdown
)
SELECT
  trp.tournament_id,
  trp.player_id,
  trp.tournament_player_id,
  t.date,
  t.rating_table_id,
  0,
  trp.status,
  trp.placement,
  COALESCE((trp.rating_persisted->>'basePoints')::double precision, 0),
  COALESCE((trp.rating_persisted->>'guaranteeBonus')::double precision, 0),
  COALESCE((trp.rating_persisted->>'pointsCoefficient')::double precision, 0),
  COALESCE((trp.rating_persisted->>'fromTableAfterCoefficient')::double precision, 0),
  COALESCE((trp.rating_persisted->>'bountyCount')::double precision, 0),
  COALESCE((trp.rating_persisted->>'bountyPoints')::double precision, 0),
  COALESCE((trp.rating_persisted->>'bountyCoefficient')::double precision, 0),
  COALESCE((trp.rating_persisted->>'nonPlacementAccrued')::double precision, 0),
  trp.rating_manual_adjustment,
  COALESCE((trp.rating_persisted->>'fromTableAfterCoefficient')::double precision, 0)
    + COALESCE((trp.rating_persisted->>'bountyPoints')::double precision, 0)
    + COALESCE((trp.rating_persisted->>'nonPlacementAccrued')::double precision, 0)
    + trp.rating_manual_adjustment,
  CASE
    WHEN trp.rating_persisted IS NULL OR trp.rating_persisted = '{}'::jsonb THEN '{}'::jsonb
    ELSE trp.rating_persisted
  END
FROM tournament_result_players trp
JOIN tournaments t ON t.id = trp.tournament_id
WHERE NOT EXISTS (
  SELECT 1 FROM player_tournament_rating_facts f
  WHERE f.tournament_id = trp.tournament_id AND f.player_id = trp.player_id
);
