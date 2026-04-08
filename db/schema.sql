create table if not exists players (
    id                  SERIAL     not null primary key,
    nickname            text       not null,
    name                text,
    phone               text,
    tg                  text,
    notes               text,
    sing_agreement       boolean    default false,
    free_entry_count    integer    not null default 0,
    free_reentry_count  integer    not null default 0,
    created_at          timestamp  not null default now()
);

create table if not exists tournaments
(
    id             SERIAL  not null primary key,
    name           text    not null,
    status         text    not null,
    date           bigint  not null,
    entry_price    bigint  not null default 1000,
    reentry_price  bigint  not null default 1000,
    rating_guarantee_enabled boolean not null default false,
    rating_points_coefficient double precision not null default 1,
    rating_bounty_coefficient double precision not null default 1
);

-- Append-only audit log (application inserts only; timestamps via occurred_at)
create table if not exists tournament_audit_events (
    id              bigserial primary key,
    tournament_id   integer    not null references tournaments(id) on delete cascade,
    event_type      text       not null,
    payload         jsonb      not null default '{}'::jsonb,
    occurred_at     timestamptz not null default now()
);

create index if not exists idx_tournament_audit_events_tournament_occurred
  on tournament_audit_events (tournament_id, occurred_at desc);

create table if not exists tournament_structures (
    id                  SERIAL   not null primary key,
    name                text     not null,
    players_limit       numeric  not null,
    stack_size          numeric  not null,
    freeze_out_enabled  boolean  not null,
    max_reentries       integer  not null default 5,
    entry_free_only     boolean  not null default false,
    blinds              text     not null
);

-- Snapshot of cash desk when tournament is completed
create table if not exists tournament_cash_snapshots (
    tournament_id  integer  not null primary key references tournaments(id) on delete cascade,
    cash_desk      jsonb    not null
);

-- Bounty/elimination events at completion (same shape as BountyEliminationEventRecord[])
create table if not exists tournament_elimination_snapshots (
    tournament_id  integer  not null primary key references tournaments(id) on delete cascade,
    events           jsonb    not null default '[]'
);

-- Final results per player when tournament is completed (placement in DB: high = better finish; API maps to 1 = winner)
create table if not exists tournament_result_players (
    tournament_id             integer  not null references tournaments(id) on delete cascade,
    player_id                 text     not null,
    tournament_player_id      integer  not null,
    placement                 integer,
    status                    text     not null,
    entry_payment_method      text,
    entry_paid_amount         bigint,
    reentry_by_payment_method text,
    reentry_payment_lines     text,
    total_reentry_count       integer  not null default 0,
    bounty_count              double precision not null default 0,
    bonuses                   text,
    custom_bonus_chips        text,
    bounty_kills              text,
    eliminated_by             text,
    burned_stack_events       text     not null default '[]',
    rating_manual_adjustment  double precision not null default 0,
    rating_persisted          jsonb    not null default '{}'::jsonb,
    primary key (tournament_id, player_id)
);