-- Mystery-bounty format: when set, bounty rating points are earned only for
-- knockouts the victim re-buys from (elimination type Rebuy). A knockout that
-- ends the victim's tournament (type Out) earns no bounty points. Knockouts are
-- still counted as such for the profile, «Кого выбил» and achievements.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS rating_bounty_rebuy_only BOOLEAN NOT NULL DEFAULT false;
