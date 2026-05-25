-- Configurable bonus points for final-table guarantee (places 1–10); default 10.
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS rating_guarantee_bonus_points integer NOT NULL DEFAULT 10;

