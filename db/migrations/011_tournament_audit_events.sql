-- Append-only audit log for tournament-scoped actions (immutable; INSERT only from app)
CREATE TABLE IF NOT EXISTS tournament_audit_events (
    id              BIGSERIAL PRIMARY KEY,
    tournament_id   INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tournament_audit_events_tournament_occurred
  ON tournament_audit_events (tournament_id, occurred_at DESC);
