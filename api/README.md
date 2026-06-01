# Anorak Arcade — leaderboard API (Cloudflare Worker + D1)

A tiny Worker over one D1 table (`totals`, one row per device×game, upserted) that powers:
personal time + best scores, global time played, per-name high scores, most-played games, and an
admin "who plays what" view.

## Deploy (one-time)

```bash
cd api

# 1. auth (browser OAuth)
npx wrangler login

# 2. create the database, then paste the printed database_id into wrangler.toml
npx wrangler d1 create anorak-arcade

# 3. apply the schema (remote)
npx wrangler d1 execute anorak-arcade --remote --file=schema.sql

# 4. set the admin secret (any random string; used for /api/admin?key=...)
npx wrangler secret put ADMIN_KEY

# 5. deploy
npx wrangler deploy
```

Wrangler prints the Worker URL (e.g. `https://anorak-arcade-api.<your-subdomain>.workers.dev`).
Put that URL into the front-end: edit `public/stats.js` →

```js
const API = 'https://anorak-arcade-api.<your-subdomain>.workers.dev';
```

(Leave `API = ''` and the whole site still works — it just stays local-only, no leaderboards.)

## Endpoints

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/api/sync` | `{clientId,name,game,addMs,plays,score}` | `{ok:true}` — upserts the device×game row |
| GET | `/api/leaderboard?game=CINDER&limit=20` | — | `{game, top:[{name,score,ms}]}` |
| GET | `/api/leaderboard` | (no game) | `{boards:{CINDER:[…],…}}` top-5 each |
| GET | `/api/stats` | — | `{globalMs, perGame:[{game,ms,plays,players}]}` |
| GET | `/api/admin?key=…` | secret | `{rows:[…], byName:[…]}` — who plays what |
| GET | `/api/health` | — | `{ok:true}` |

## Local dev

```bash
npx wrangler dev          # runs on http://localhost:8787 with a local D1
npx wrangler d1 execute anorak-arcade --local --file=schema.sql   # seed local DB first
```

## Notes / guardrails

- Scores are client-submitted, so they're spoofable — fine for a public name-in-the-box arcade.
  The Worker sanitises names, caps score/time/plays per request, and restricts `game` to the known
  set. Add HMAC-signed or replay-validated submissions later if needed.
- Resetting playtime in the browser is **local only**; the server keeps the global record.
- Time is tracked per anonymous device immediately and attributed to a handle once one is entered
  (the row's `name` updates on the next sync).
