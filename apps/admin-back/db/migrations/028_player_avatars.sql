-- Published avatars: the pictures the club actually shows.
--
-- One row per player — the primary key says so, rather than the calling code.
-- A row lands here only through an admin's allowing verdict; the upload path
-- has no reach into this table at all.
--
-- `address` is derived from the normalized bytes together with the player, so
-- two players uploading the same file get two addresses and two rows: one
-- player's takedown or deletion can never touch another's picture. It is the
-- capability: unguessable, and served to anyone holding it.
--
-- The cascade is the erasure guarantee. Deleting a player takes the face with
-- it in the same transaction the account leaves — not in a later sweep that
-- someone has to remember to run.
create table if not exists player_avatars (
    player_id     integer     not null primary key references players(id) on delete cascade,
    address       text        not null unique,
    image         bytea       not null,
    content_type  text        not null default 'image/webp',
    published_at  timestamptz not null default now()
);
