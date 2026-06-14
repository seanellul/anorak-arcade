-- Anorak Arcade — follow any named player (not just account-holders). Apply once:
--   wrangler d1 execute anorak-arcade --remote --file=migrations/0010_follows.sql
-- Keyed by the followed player's canonical name (name_lc), so you can friend anyone
-- who appears on the boards — they don't need a Sign in with Apple account.
CREATE TABLE IF NOT EXISTS follows (
  user_id    TEXT    NOT NULL,   -- the follower (an account)
  name_lc    TEXT    NOT NULL,   -- the followed player's name, lowercased
  name       TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, name_lc)
);
CREATE INDEX IF NOT EXISTS idx_follows_user ON follows(user_id);
