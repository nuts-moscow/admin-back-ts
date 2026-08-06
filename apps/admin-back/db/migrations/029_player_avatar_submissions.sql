-- Pictures waiting for a human, and the memory of what was already refused.
--
-- One row per player: a second upload replaces the first through the conflict
-- clause rather than adding a row, so the queue's length is the number of
-- players waiting, not the number of times anyone pressed the button.
--
-- `submission_id` is the identity a verdict answers. It changes whenever the
-- bytes change, which is what makes an admin's click apply to the picture they
-- looked at and not merely to the player: a verdict carrying a superseded id
-- publishes nothing and discards nothing.
--
-- A refused row keeps its place but loses its picture: `image` goes null and
-- `state` becomes 'refused', so the player can be told without the club holding
-- bytes nobody approved. An allowed row is deleted instead — the picture has
-- become the avatar, and there is no waiting left to describe. Only 'pending'
-- rows are the queue.
create table if not exists player_avatar_submissions (
    player_id     integer     not null primary key references players(id) on delete cascade,
    submission_id text        not null,
    state         text        not null check (state in ('pending', 'refused')),
    image         bytea,
    content_type  text        not null default 'image/webp',
    fingerprint   text        not null,
    submitted_at  timestamptz not null default now(),
    decided_at    timestamptz,
    check ((state = 'pending') = (image is not null))
);

create index if not exists player_avatar_submissions_pending_idx
    on player_avatar_submissions (submitted_at)
    where state = 'pending';

-- Fingerprints of what this player has been refused. The hash, never the
-- picture: enough to avoid asking a human the same question twice, and nothing
-- more. This table is also the one place the refusal count lives — the
-- submission row comes and goes, these do not.
create table if not exists player_avatar_refusals (
    player_id   integer     not null references players(id) on delete cascade,
    fingerprint text        not null,
    refused_at  timestamptz not null default now(),
    primary key (player_id, fingerprint)
);
