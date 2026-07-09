-- Open self-registration by unique login.
-- Add a unique login (username); email becomes optional so users can register
-- with just login + password. Existing email-based users keep working.
alter table player_users add column if not exists login citext unique;
alter table player_users alter column email drop not null;
