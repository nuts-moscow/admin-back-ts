-- Which seasons have been settled, and who led each one.
--
-- Two questions need this and neither is answerable from player_achievements:
-- where to resume settling from, and how many seasons in a row a player led.
-- The awards table keys (player, rule), so it remembers that someone was MVP
-- at least once — not which seasons, and not in what order.
--
-- A season is a calendar month, and only months that actually held a rated
-- tournament ever appear here: a quiet month settles nobody and is not a gap.
create table if not exists season_settlements (
    season_year   integer     not null,
    season_month  integer     not null,
    -- Null when the season held tournaments but produced no leader (nobody
    -- scored). Settled all the same, so it is not revisited.
    leader_player_id text,
    settled_at    timestamptz not null default now(),
    primary key (season_year, season_month)
);

create index if not exists season_settlements_leader_idx
    on season_settlements (leader_player_id, season_year, season_month)
    where leader_player_id is not null;
