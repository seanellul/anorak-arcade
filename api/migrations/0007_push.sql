-- Anorak Arcade — push token registry (Phase 4). Apply once:
--   wrangler d1 execute anorak-arcade --remote --file=migrations/0007_push.sql
-- Additive. Stores APNs device tokens so the nightly cron can nudge players to defend
-- their spot / keep a streak / before a season closes. (Sending also needs an APNs
-- auth key — see docs/social-competitive.md; registration is wired here regardless.)
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id    TEXT    NOT NULL,
  token      TEXT    NOT NULL,
  platform   TEXT    NOT NULL DEFAULT 'ios',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (token)
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_tokens(user_id);
