-- Let the audit trail carry admin actions that belong to no tournament.
--
-- Every admin action so far happened inside a tournament, so `tournament_id`
-- was NOT NULL. Avatar moderation is the first that is not: allowing or
-- refusing a player's picture, and taking a published one down, are club-scoped
-- decisions with no tournament to hang them on.
--
-- The alternative was a second audit table, which would have meant the club's
-- admin actions are recorded in two places depending on which one you mean.
-- Relaxing the column is backwards compatible: every existing row keeps its
-- tournament, and every existing writer still passes one.
alter table tournament_audit_events
    alter column tournament_id drop not null;

create index if not exists idx_tournament_audit_events_club_occurred
    on tournament_audit_events (event_type, occurred_at desc)
    where tournament_id is null;
