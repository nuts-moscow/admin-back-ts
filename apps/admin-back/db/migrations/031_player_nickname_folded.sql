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

-- An earlier revision of this migration shipped a backfill without the
-- confusable mapping and a NOT NULL the application could not yet satisfy.
-- Undo both so the corrected pass below is what stands, whether this runs on a
-- fresh database or on one that took the wrong version.
alter table players
    alter column nickname_folded drop not null;
update players
   set nickname_folded = null
 where nickname_folded is not null;

-- The same fold the code applies, down to the confusable mapping. A backfill
-- that only lowered and trimmed would leave existing rows keyed differently
-- from anything the application computes, and then a newcomer could quietly
-- take a legacy player's name — the exact guarantee this column exists for.
update players
   set nickname_folded = translate(
         lower(btrim(regexp_replace(nickname, '\s+', ' ', 'g'))),
         'авекмнорстух',
         'abekmhopctyx'
       )
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

-- Deliberately last, and deliberately paired with the code in this same
-- change: the column is only NOT NULL once every writer fills it. Applying
-- this migration ahead of the application breaks every insert into `players`,
-- signup and admin-created players alike.
alter table players
    alter column nickname_folded set not null;

-- Full and unqualified: every row is in it, so a new name cannot collide with
-- an old player's any more than with a new one's.
create unique index if not exists players_nickname_folded_uniq
    on players (nickname_folded);
