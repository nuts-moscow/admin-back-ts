-- Fixed core players (ids 1–4): nicknames and signed agreement.
-- Idempotent: ON CONFLICT updates nickname and sing_agreement to canonical values.

INSERT INTO players (id, nickname, name, phone, tg, notes, sing_agreement, free_entry_count, free_reentry_count, created_at)
VALUES
  (1, 'Magic', NULL, NULL, NULL, NULL, true, 0, 0, now()),
  (2, 'Сева', NULL, NULL, NULL, NULL, true, 0, 0, now()),
  (3, 'Полина Дама', NULL, NULL, NULL, NULL, true, 0, 0, now()),
  (4, 'Владосик', NULL, NULL, NULL, NULL, true, 0, 0, now())
ON CONFLICT (id) DO UPDATE SET
  nickname = EXCLUDED.nickname,
  sing_agreement = EXCLUDED.sing_agreement;

SELECT setval(
  pg_get_serial_sequence('players', 'id'),
  (SELECT COALESCE(MAX(id), 1) FROM players)
);
