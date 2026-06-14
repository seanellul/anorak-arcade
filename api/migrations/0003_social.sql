-- Anorak Arcade — friends (Social pillar, feature #6/#7). Apply once:
--   wrangler d1 execute anorak-arcade --remote --file=migrations/0003_social.sql
-- One row per follow (user_id follows friend_id). Mutual = two rows.
CREATE TABLE IF NOT EXISTS friendships (
  user_id    TEXT    NOT NULL,
  friend_id  TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_user ON friendships(user_id);
