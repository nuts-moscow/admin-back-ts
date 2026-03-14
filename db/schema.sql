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