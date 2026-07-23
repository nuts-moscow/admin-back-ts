-- month-final feature: a flag on the tournament row marking it as the season's
-- «финал месяца» (invite-only; date source for the player home panel), plus a
-- pull-based drop notice left for players removed when a tournament becomes a
-- month final (they read the reason on next open — no push channel).

ALTER TABLE tournaments
  ADD COLUMN month_final BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS tournament_drop_notice (
  tournament_id INTEGER     NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  player_id     TEXT        NOT NULL,
  reason        TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, player_id)
);
