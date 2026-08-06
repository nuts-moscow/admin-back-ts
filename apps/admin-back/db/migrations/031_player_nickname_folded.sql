-- The form nicknames are compared by, and the index that makes one rule bind
-- every writer.
--
-- Three paths write a player's name — self-registration, the player's own
-- rename, and an admin creating a player by hand. A check in each service would
-- be three chances to forget, and no defence at all against two of them racing.
-- The constraint therefore lives here, where none of them can route around it.
--
-- `nickname_folded` is what uniqueness is decided on: case-flattened,
-- whitespace-collapsed, and Cyrillic letters indistinguishable from a Latin one
-- folded onto the Latin side. The displayed `nickname` is never touched —
-- folding decides who may have a name, not how it is written.
alter table players
    add column if not exists nickname_folded text;

update players
   set nickname_folded = lower(btrim(regexp_replace(nickname, '\s+', ' ', 'g')))
 where nickname_folded is null;

-- The club already holds duplicate nicknames: they were derived from mail
-- addresses and never checked. Nobody is renamed by the arrival of a rule, so
-- the *displayed* name of every existing player stays exactly as it is; what
-- gets disambiguated is only the comparison key, which no one ever sees.
--
-- The first holder of a name keeps the plain key, so a newcomer choosing it
-- collides with them and is refused — which is the guarantee that matters. The
-- later duplicates get a suffixed key and simply stop being reachable by that
-- name, which they already were not.
with ranked as (
    select id,
           nickname_folded,
           row_number() over (partition by nickname_folded order by id) as n
      from players
)
update players p
   set nickname_folded = ranked.nickname_folded || '#' || ranked.n
  from ranked
 where p.id = ranked.id
   and ranked.n > 1;

alter table players
    alter column nickname_folded set not null;

-- Full and unqualified: every row is in it, so a new name cannot collide with
-- an old player's any more than with a new one's.
create unique index if not exists players_nickname_folded_uniq
    on players (nickname_folded);
