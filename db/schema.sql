-- Rating distribution tables: multiple named matrices for assigning points by place and participant count.
-- column_range_start: participant count mapped to the first column (step always 2).
-- matrix: rows = places (0-based index → place N+1), cols = participant count ranges; null = no points.
create table if not exists rating_tables (
  id                   SERIAL  PRIMARY KEY,
  name                 TEXT    NOT NULL,
  column_range_start   INTEGER NOT NULL,
  column_range_step    INTEGER NOT NULL DEFAULT 2,
  matrix               JSONB   NOT NULL
);

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
    id                            SERIAL  not null primary key,
    name                          text    not null,
    status                        text    not null,
    date                          bigint  not null,
    entry_price                   bigint  not null default 1000,
    reentry_price                 bigint  not null default 1000,
    rating_guarantee_enabled      boolean not null default false,
    rating_guarantee_bonus_points integer not null default 10,
    rating_points_coefficient     double precision not null default 1,
    rating_bounty_coefficient     double precision not null default 1,
    rating_table_id               integer not null default 1 references rating_tables(id),
    rating_enabled                boolean not null default true,
    rating_season_year            integer,
    rating_season_month           integer,
    late_registration_closed      boolean not null default false
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
create table if not exists admin_users (
    id            serial primary key,
    username      text not null unique,
    password_hash text not null,
    created_at    timestamptz not null default now()
);

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

-- Flat rating per (tournament, player) for analytics (seasons, time ranges); mirrors rating after completion / manual adjustment
create table if not exists player_tournament_rating_facts (
    tournament_id                integer not null references tournaments (id) on delete cascade,
    player_id                    text    not null,
    tournament_player_id         integer not null,
    tournament_date_ms           bigint  not null,
    rating_table_id              integer not null references rating_tables (id),
    rating_field_size            integer not null,
    player_status                text    not null,
    placement                    integer,
    base_points                  double precision not null,
    guarantee_bonus              double precision not null,
    points_coefficient           double precision not null,
    from_table_after_coefficient double precision not null,
    bounty_count                 double precision not null,
    bounty_points                double precision not null,
    bounty_coefficient           double precision not null,
    non_placement_accrued        double precision not null,
    manual_adjustment            double precision not null default 0,
    total_points                 double precision not null,
    breakdown                    jsonb   not null default '{}'::jsonb,
    recorded_at                  timestamptz not null default now(),
    rating_season_year           integer,
    rating_season_month          integer,
    primary key (tournament_id, player_id)
);

create index if not exists idx_ptrf_player_date
  on player_tournament_rating_facts (player_id, tournament_date_ms desc);

create index if not exists idx_ptrf_tournament_date
  on player_tournament_rating_facts (tournament_date_ms);

create index if not exists idx_ptrf_rating_table_date
  on player_tournament_rating_facts (rating_table_id, tournament_date_ms);

create index if not exists idx_ptrf_season
  on player_tournament_rating_facts (rating_season_year, rating_season_month)
  where rating_season_year is not null;