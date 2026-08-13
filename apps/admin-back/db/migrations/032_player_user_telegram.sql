-- The second door's half of an account row: which Telegram identity may open
-- it, and the constraint that decides who owns that identity.
--
-- Nullable, and it stays nullable forever. Three populations live in this
-- table and none of them is going away: legacy players with neither address
-- nor Telegram, mailbox players who may never bind one, and players who
-- arrive by Telegram and have no address at all. A NOT NULL here would be a
-- claim about people, not about data.
alter table player_users
    add column if not exists telegram_id bigint;

-- Uniqueness lives here rather than in the service, and that is the whole
-- point of this migration. Two paths write the binding — a newcomer opening
-- an account by Telegram and an existing player binding one in their profile
-- — so a pre-check in either would be one more place to forget and no
-- defence at all against the two of them racing. The loser of that race has
-- to be told it lost by the same authority that decided, which is this index.
--
-- Partial, because nullable columns are not the thing being made unique: every
-- unbound row would otherwise have to be distinct from every other unbound
-- row, and in Postgres they happen not to be, but saying so explicitly is
-- cheaper than relying on it.
create unique index if not exists player_users_telegram_id_uniq
    on player_users (telegram_id)
 where telegram_id is not null;
