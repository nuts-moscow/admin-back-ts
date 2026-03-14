create table if not exists players (
    id         SERIAL     not null primary key,
    nickname   text       not null,
    name       text,
    phone      text,
    tg         text,
    notes      text,
    sing_agreement boolean default false,
    created_at timestamp  not null default now()
);

create table if not exists tournaments
(
    id             SERIAL  not null primary key,
    name           text    not null,
    status         text    not null,
    date           bigint  not null,
    entry_price    bigint  not null default 1000,
    reentry_price  bigint  not null default 1000
);

create table if not exists tournament_structures (
    id                  SERIAL   not null primary key,
    name                text     not null,
    players_limit       numeric  not null,
    stack_size          numeric  not null,
    freeze_out_enabled  boolean  not null,
    blinds              text     not null
);