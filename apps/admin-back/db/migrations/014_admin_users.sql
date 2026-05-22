create table if not exists admin_users (
    id            serial primary key,
    username      text not null unique,
    password_hash text not null,
    created_at    timestamptz not null default now()
);
