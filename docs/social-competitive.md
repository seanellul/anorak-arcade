# Social & Competitive Layer (Phases 1–3)

Built on the Phase 0 integrity foundation (`docs/score-integrity.md`). All additive —
existing boards/endpoints are unchanged. Most UI already existed in `public/native-app.js`
(profile sheet, world ranks, period boards, friends, top-10 celebration); this adds the
genuinely missing pieces that make the arcade *competitive and social*.

## New backend (`api/worker.js`)

| Endpoint | What it does |
|---|---|
| `GET /api/players?limit=50` | **Arcade Score meta-leaderboard.** Ranks named players by a cross-game composite: `Σ(101 − rank)` over every game they're top-100 in (#1 = 100 pts, #100 = 1). Single window-function query. *This is the global ladder the revenue split rewards.* |
| `GET /api/leaderboard?game=X&around=<name>` | **Near-me board.** The ±4 window around a player's rank, with their true rank numbers. The most motivating view — "3 spots from the player above." |
| `GET /api/leaderboard?game=X&scope=friends` (auth) | **Friends board.** Same board scoped to your follow graph (+ you). |
| `GET /api/feed` (auth) | **Activity feed.** Your own `overtaken`/`no1` events + friends' `best`/`no1` events, newest first. |
| `GET /api/profile?name=N` | Now also returns `arcadeScore` (the player's own composite). |
| `GET /api/leaderboard?...&verified=1` | (Phase 0) payout-eligible board — integrity-checked scores only. |

**Events** are written in the hot `sync` path only on a *signed-in player's genuine new
personal best* (cheap: 2–3 extra queries, gated): a `best`/`no1` event for the actor and
an `overtaken` event for any player they genuinely leapfrogged (best between the actor's
old and new score). Flagged scores never emit events.

**Nightly cron** (`wrangler.toml [triggers] crons=["17 3 * * *"]` → `scheduled` →
`snapshotRanks`): freezes top-100 per game into `rank_snapshots`. This is the history that
powers rank deltas ("climbed 14 spots") and, later, frozen season-end standings for payouts.

## New app UI (`public/native-app.js` + `.css`)

- **Arcade Score** banner in the YOU profile sheet (`.aa-arcade`).
- **Scope tabs** (GLOBAL / NEAR ME / FRIENDS) on the scores sheet, composable with the
  existing time-period tabs. NEAR ME needs a name; FRIENDS needs sign-in (graceful prompts).
  Medals render for ranks 1–3 in every scope.
- **Activity feed** in the FRIENDS sheet (`.aa-feed`) — "Kai passed you in CINDER — defend
  your spot," "Mara is #1 in SURGE."

Propagate to iOS: `cd mobile && npm run sync`.

## Verify (after applying migration 0005 + deploying the worker)

```
# Arcade Score meta-leaderboard
curl -s 'localhost:8787/api/players?limit=10'

# Near-me window around a known player
curl -s 'localhost:8787/api/leaderboard?game=CINDER&around=<name>'

# Friends board + feed (need a Bearer session token)
curl -s 'localhost:8787/api/leaderboard?game=CINDER&scope=friends' -H 'Authorization: Bearer <tok>'
curl -s 'localhost:8787/api/feed' -H 'Authorization: Bearer <tok>'

# Feed write path: sign in two accounts, have account B beat account A's CINDER best,
#   then GET /api/feed as A → expect an 'overtaken' event naming B.

# Cron (local): trigger the scheduled handler, then read history
wrangler dev --test-scheduled        # then: curl 'localhost:8787/__scheduled?cron=17+3+*+*+*'
# (or wait for the nightly run in prod) → rank_snapshots gains a dated batch
```

Window functions (`RANK() OVER`) require modern SQLite — D1 supports them. The Arcade
Score query groups anonymous noise out (`name <> ''`), so only claimed handles rank.
