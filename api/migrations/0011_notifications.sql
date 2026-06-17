-- Anorak Arcade — per-user notification inbox + per-kind preferences. Apply once:
--   wrangler d1 execute anorak-arcade --remote --file=migrations/0011_notifications.sql
-- Distinct from the `events` activity feed: this is YOUR inbox (things that happened
-- TO you), with read state for an unread badge. kind ∈ follow | beaten | dethroned |
-- fav_record | new_game | challenge | challenge_result.
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL,                -- recipient account
  kind       TEXT    NOT NULL,
  actor_id   TEXT,                            -- who triggered it (account), if any
  actor_name TEXT    NOT NULL DEFAULT '',
  game       TEXT    NOT NULL DEFAULT '',
  payload    TEXT    NOT NULL DEFAULT '',     -- small JSON (score, rank, ...)
  created_at INTEGER NOT NULL,
  read_at    INTEGER                          -- NULL = unread
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);

-- per-kind on/off preferences (JSON map; absent/true = on). Errors harmlessly if re-applied.
ALTER TABLE users ADD COLUMN notif_prefs TEXT NOT NULL DEFAULT '';
