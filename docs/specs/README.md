# Wave 5 — high-score prototype specs

Four new single-file Anorak Arcade prototypes built to drive **hungry high-score hunters**: short,
deterministic, instant-restart runs with one legible number. Each is a legally-clean reinterpretation
of a classic arcade *mechanical atom* (the mechanic is free to reuse; the original's name, art, sound,
and exact layouts are not — so we keep the verb structure and rebuild every expressive layer).

All four are **single-pointer by design** — the primary target is the iOS (Capacitor) app — and all
four are built on a new **shared daily-seed RNG** so "everyone plays today's board, leaderboard resets
daily" turns a one-time score wall into a daily rivalry.

## The docs

| File | Purpose |
|---|---|
| [`00-foundation.md`](00-foundation.md) | **Read first.** Shared daily-seed RNG (`public/seed.js`), the single-file prototype skeleton, the iOS-first control contract, the haptics vocabulary, and the exact 5 touchpoints to register a game. |
| [`01-intercept.md`](01-intercept.md) | INTERCEPT — finite-resource triage (Missile Command). *tap-to-point.* ✅ **BUILT** (`public/intercept.html`) — the worked reference for the other three. |
| [`02-descent.md`](02-descent.md) | DESCENT — one-button gravity-flip faller (Canabalt / Gravity Guy). *tap-to-act.* |
| [`03-sortie.md`](03-sortie.md) | SORTIE — formation-break shooter (Galaga). *drag-to-position.* |
| [`04-circuit.md`](04-circuit.md) | CIRCUIT — continuous-trail survival with a graze-combo (Snake × Tron). *steer-toward-touch.* |

## Wave 5 at a glance

| ID | slug | verb | gesture | accent | high-score lever |
|---|---|---|---|---|---|
| INTERCEPT | intercept | TRIAGE | tap-to-point | `#ff4747` | multi-kill blast timing |
| DESCENT | descent | FREEFALL | tap-to-act | `#b15cff` | depth × pickup multiplier |
| SORTIE | sortie | FORMATION | drag-to-position | `#ff9d3d` | dual-ship capture gamble |
| CIRCUIT | circuit | CIRCUIT | steer-toward-touch | `#2fe0b0` | graze-combo nerve |

> Accents are **provisional** — Wave 5's palette is crowded; recolor freely (see foundation §5).

## Per-chat hand-off

These specs are designed so each game can be built in its **own fresh chat**:

1. Open one chat per game.
2. Start it from [`00-foundation.md`](00-foundation.md) **+** that game's doc — together they're a
   complete, standalone brief.
3. Build order *within* a chat: create `public/seed.js` first (shared — do it in whichever game you
   build first), then the game's `public/<slug>.html`, then wire the 5 touchpoints, then test in the
   iOS simulator.

**Recommended build order across the four** (simplest control/loop first, so the shared `seed.js` and
patterns land early on an easy game): **DESCENT → INTERCEPT → CIRCUIT → SORTIE.**

## Downstream dependency (not part of any single game's build)

The games submit to the existing all-time leaderboard out of the box. The **daily-scoped leaderboard
view + daily reset** (worker: `GET /api/leaderboard?seed=…` + a per-day board) is net-new and belongs
to the social/competitive overhaul. The games carry the seed already; the daily board layers on later
without touching them.
