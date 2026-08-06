-- Achievements earned by players.
--
-- One row per (player, rule): the primary key is what makes the awarding pass
-- idempotent, so a tournament completed twice cannot produce a second badge.
-- There is no delete path on purpose — an award once earned stands, even if a
-- later rating correction would make it unearned by today's arithmetic.
--
-- `seen_at` is not part of the award: it records that the player has looked at
-- it, and changes neither the rule nor the date it closed.
create table if not exists player_achievements (
    player_id     integer     not null references players(id) on delete cascade,
    rule_id       text        not null,
    earned_at     timestamptz not null default now(),
    -- The tournament whose completion closed the rule; null for awards handed
    -- out by the pass over history, which no single tournament closed.
    tournament_id integer     references tournaments(id) on delete set null,
    seen_at       timestamptz,
    primary key (player_id, rule_id)
);

create index if not exists player_achievements_unseen_idx
    on player_achievements (player_id)
    where seen_at is null;
