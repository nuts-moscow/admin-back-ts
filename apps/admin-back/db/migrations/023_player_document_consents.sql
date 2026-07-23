-- Records a player's consent to legal documents given at registration:
-- which document, which version, when, and from which IP. One row per
-- (player, document, version) so a re-consent to a new version is additive.
create table if not exists player_document_consents (
    id               serial primary key,
    player_id        integer not null references players(id) on delete cascade,
    document_slug    text not null,
    document_version text not null,
    accepted_at      timestamptz not null default now(),
    ip               text,
    unique (player_id, document_slug, document_version)
);

create index if not exists player_document_consents_player_id_idx
    on player_document_consents (player_id);
