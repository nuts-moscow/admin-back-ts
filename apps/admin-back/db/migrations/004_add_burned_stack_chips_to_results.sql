alter table tournament_result_players
    add column if not exists burned_stack_chips integer not null default 0;
