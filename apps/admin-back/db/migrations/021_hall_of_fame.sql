create table if not exists hall_of_fame (
    id          serial primary key,
    year        smallint not null,
    player_id   integer references players(id) on delete set null,
    nickname    text not null,
    name        text,
    title       text not null,
    stat        text not null,
    position    smallint not null,
    created_at  timestamptz not null default now(),
    unique (year, position)
);

create index if not exists hall_of_fame_year_idx on hall_of_fame (year desc, position asc);
