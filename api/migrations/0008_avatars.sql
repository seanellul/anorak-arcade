-- Anorak Arcade — chosen profile avatars (emoji). Apply once:
--   wrangler d1 execute anorak-arcade --remote --file=migrations/0008_avatars.sql
-- Avatar lives on the `names` row (the canonical identity for leaderboards), so it
-- shows for both account-linked and anonymous-but-named players. '' = use the
-- deterministic fallback emoji derived from the name.
ALTER TABLE names ADD COLUMN avatar TEXT NOT NULL DEFAULT '';
