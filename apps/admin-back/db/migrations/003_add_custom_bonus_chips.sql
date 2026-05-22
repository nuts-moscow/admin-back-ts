-- Custom bonus chip grants per player (JSON array of positive integers)
ALTER TABLE tournament_result_players
  ADD COLUMN IF NOT EXISTS custom_bonus_chips text;
