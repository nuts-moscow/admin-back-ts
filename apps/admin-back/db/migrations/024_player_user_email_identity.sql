-- The mailbox becomes the identifier for new accounts.
--
-- `email` stays nullable on purpose: accounts self-registered before this
-- change carry a login and no address at all, and they keep signing in
-- unchanged. The unique constraint on the citext column is what stops one
-- address becoming two accounts; the pre-check in the application is only a
-- fast path, never the authority.
--
-- `email_verified_at` records when the address was proved by a code. Rows
-- written before this change have never been proved and stay null.
alter table player_users
    add column if not exists email_verified_at timestamptz;

-- Legacy seeded rows carry an address that predates code verification;
-- they are not retroactively marked as proved.
create index if not exists player_users_email_idx
    on player_users (email)
    where email is not null;
