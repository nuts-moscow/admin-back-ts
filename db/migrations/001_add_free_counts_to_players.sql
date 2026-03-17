-- Run this on existing databases that were created before free_entry_count/free_reentry_count were added.
-- New installs use schema.sql which already includes these columns.

ALTER TABLE players ADD COLUMN IF NOT EXISTS free_entry_count integer NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS free_reentry_count integer NOT NULL DEFAULT 0;
