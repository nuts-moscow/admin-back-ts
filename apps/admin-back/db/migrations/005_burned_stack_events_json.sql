-- Replace scalar burned_stack_chips with JSON array of { "chips", "source": "Rebuy"|"Out" }
alter table tournament_result_players
    add column if not exists burned_stack_events text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tournament_result_players'
      and column_name = 'burned_stack_chips'
  ) then
    update tournament_result_players
    set burned_stack_events = case
      when coalesce(burned_stack_chips, 0) <= 0 then '[]'
      else json_build_array(
        json_build_object('chips', burned_stack_chips, 'source', 'Rebuy')
      )::text
    end
    where burned_stack_events is null;
  else
    update tournament_result_players
    set burned_stack_events = '[]'
    where burned_stack_events is null;
  end if;
end $$;

alter table tournament_result_players
    alter column burned_stack_events set default '[]';

update tournament_result_players
set burned_stack_events = '[]'
where burned_stack_events is null;

alter table tournament_result_players
    alter column burned_stack_events set not null;

alter table tournament_result_players
    drop column if exists burned_stack_chips;
