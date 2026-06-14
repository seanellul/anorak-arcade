# Score Integrity Foundation (Phase 0)

The bedrock for a competitive arcade where rank eventually carries real money: every
score that can ever touch a payout must be **attributable to a verified human** and
**defensible against replay/tamper**. This phase lays the seams without disrupting the
existing anonymous, honor-system arcade — old scores keep working as `legacy`.

> Determined cheats who read the client JS can still forge a session-signed score
> (the per-session secret is handed to the browser). Closing that needs server-side
> **replay re-simulation** of seeded runs — that's Phase 5. Phase 0 stops casual
> tampering and replay, and—critically—gives us the *provenance columns and the
> verified-only board* the economy plugs into.

## What changed

**DB — `api/migrations/0005_identity_integrity.sql`** (additive; apply once):
- `auth_identities` — provider-agnostic identity (Apple backfilled; Google/email/passkey later, zero migration).
- `users` gains `handle_lc` (unique), `display_name`, `country`, `avatar_seed`, `verified`, `privacy`.
- `play_sessions` — server-issued, per-run, single-use sessions bound to (client, game, seed, user).
- `scores` gains `session_id`, `integrity` (`verified` | `session` | `legacy` | `flagged`), `client_version`.
- `seasons` + `rank_snapshots` — frozen standings (the economic primitive) + rank history.
- `events`, `blocks`, `reports` — social-feed + moderation backbone.

**Worker — `api/worker.js`:**
- `POST /api/session/start` `{clientId, game, seed?, clientVersion?}` → `{sessionId, secret, seed, exp}`. Honours a Bearer token to bind the session to a user.
- `POST /api/sync` now validates an optional `{sessionId, sig, nonce}` on the logged score and stamps `scores.integrity`. Single-use (`consumed_at`) blocks replay. No session → `legacy` (unchanged behaviour).
- `GET /api/leaderboard?...&verified=1` → the payout-eligible board (`integrity='verified'` only). Default board is unchanged (all comers).
- `sanityOk(game, score)` — per-game plausibility seam (global cap today; real bounds in Phase 5). Implausible scores are recorded as `flagged` and hidden from boards.

**Client — `public/stats.js`:**
- Lazily starts a play session per game on first `ping`/`submitScore`.
- On a new best, precomputes an HMAC over `sessionId.game.score.seed.nonce` with the session secret.
- `flush()` attaches the proof only when it matches the exact score being sent; rotates the session after a signed send.
- Entirely best-effort: any network/crypto failure falls back to the legacy path.
- Propagate to the iOS bundle with `cd mobile && npm run sync` (Capacitor copies `../public`).

## Signature scheme

```
sig = hex( HMAC-SHA256( session.secret, `${sessionId}.${game}.${score}.${seed}.${nonce}` ) )
```
Server reloads the session, checks game/client/seed/expiry/not-consumed, recomputes the
HMAC, marks the session consumed, and stamps the score `verified` (session had a user) or
`session` (anonymous run).

## Apply + verify

1. **Migrate** (remote D1):
   ```
   cd api
   wrangler d1 execute anorak-arcade --remote --file=migrations/0005_identity_integrity.sql
   ```
   Re-running is safe: tables use `IF NOT EXISTS`; each `ALTER TABLE ADD COLUMN` errors
   harmlessly if the column already exists (run them individually if a re-apply trips).

2. **Local worker** against a local D1 copy:
   ```
   cd api && wrangler dev
   ```

3. **Happy path** — verified score appears on the verified board:
   ```
   # start a session
   curl -s localhost:8787/api/session/start -d '{"clientId":"dev-1","game":"CINDER"}' | tee /tmp/s.json
   # sign: sig = HMAC-SHA256(secret, "<sessionId>.CINDER.5000..<nonce>")
   #   node -e 'const c=require("crypto");const s=require("/tmp/s.json");const n="nonce1";
   #     console.log(c.createHmac("sha256",s.secret).update(`${s.sessionId}.CINDER.5000..${n}`).digest("hex"))'
   curl -s localhost:8787/api/sync -d '{"clientId":"dev-1","game":"CINDER","score":5000,"sessionId":"<id>","sig":"<sig>","nonce":"nonce1"}'
   curl -s 'localhost:8787/api/leaderboard?game=CINDER&verified=1'   # → score present
   ```

4. **Integrity rejections** (all must fall back to `legacy`, never crash):
   - Submit the same `{sessionId, sig, nonce}` twice → second is `legacy` (session consumed).
   - Tamper the score after signing (sign 5000, submit 9999) → signature mismatch → `legacy`.
   - Submit with no `sessionId` → `legacy`; still appears on the default board, **absent** from `verified=1`.

5. **End-to-end (app):** `cd mobile && npm run sync && npm run open`, run a game in the
   simulator to a new best, confirm the score lands and that `?verified=1` shows it once
   signed-in (anonymous runs show as `session`, not `verified`).

6. **Regression:** the 13 shipped games keep submitting via `/api/sync`; existing boards
   (no `verified` param) are unchanged.
