create extension if not exists citext;

create table if not exists player_users (
    id            serial primary key,
    email         citext not null unique,
    password_hash text not null,
    player_id     integer not null unique references players(id) on delete cascade,
    created_at    timestamptz not null default now()
);

create index if not exists player_users_player_id_idx on player_users (player_id);
