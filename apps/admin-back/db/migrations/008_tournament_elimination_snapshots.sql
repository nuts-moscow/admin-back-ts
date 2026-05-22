-- Full bounty/elimination event log at tournament completion (before Redis keys are deleted)
CREATE TABLE IF NOT EXISTS tournament_elimination_snapshots (
    tournament_id  INTEGER  NOT NULL PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
    events           JSONB    NOT NULL DEFAULT '[]'
);
