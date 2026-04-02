-- Actual entry/rebuy paid amounts for cash desk and history (same currency as entry_price / reentry_price).

ALTER TABLE tournament_result_players
  ADD COLUMN IF NOT EXISTS entry_paid_amount bigint,
  ADD COLUMN IF NOT EXISTS reentry_payment_lines text;
