-- Bounty can be split across multiple killers (fractional share per killer).
alter table tournament_result_players
  alter column bounty_count type double precision using bounty_count::double precision;
