# INTERCEPT — spec

> Read [`00-foundation.md`](00-foundation.md) first (seed RNG, skeleton, iOS control contract,
> haptics vocab, 5 touchpoints). This doc covers only what's specific to INTERCEPT.

## Identity

- **Title / verb:** INTERCEPT · *TRIAGE*
- **Accent:** `#ff4747` (provisional)
- **Atom:** Missile Command — finite-resource triage. The action-sibling of HOMEOSTAT.
- **Pitch:** *"Threats rain down. You have finite interceptors and more targets than you can save. Choose what lives."*
- **Why it hunts:** the score engine is the **multi-kill** — timing one blast so several threats funnel
  through its ring. Trivial to play, deep to master; ammo economy + trajectory reading separate a 5k
  run from a 50k run.

## Core loop

1. Waves of **threats** descend from the top toward N ground **sites** (start 5).
2. **Tap a point** → an interceptor launches from the nearest live battery, flies to that point, and
   detonates into an expanding **blast ring** (~0.6 s).
3. Any threat touching an active ring dies. A threat that reaches a site destroys it.
4. Wave clears when all its threats are resolved → short bonus tally → next wave.
5. **Run ends when the last site falls.**

Runs typically 2–5 minutes.

## Controls (iOS-first — see foundation §3)

- **tap-to-point.** Each tap = one interceptor launched toward `P(e)`. No drag, no buttons.
- Ammo is the only limiter on tapping. Cap concurrent in-flight interceptors (e.g. 4) so spam-tapping
  doesn't trivialise aiming.
- Desktop: mouse-click is the identical gesture.
- *(Open, v2)*: **hold** to charge a larger-radius blast that costs more ammo.

## State & entities

```
Threat      { x, y, vx, vy, type:'straight'|'splitter'|'smart', alive }
            // splitter forks into 2 at a seeded altitude; smart drifts toward nearest live site
Interceptor { x, y, tx, ty, spd, done }        // linear travel to target → spawns a Blast
Blast       { x, y, r, rMax, life }            // ring grows r→rMax; kills threats while life>0
Site        { x, alive }                       // N evenly along the floor
Wave state  { ammo, reload, spawned, remaining }
```

Collision: a threat dies when `dist(threat, blast) <= blast.r` (point-in-expanding-circle). A single
blast can kill many threats across its lifetime — that's the multi-kill.

## Tuning constants (starting values — all overridable)

| Const | Value | Note |
|---|---|---|
| `SITES` | 5 | sites along the floor |
| `BASE_AMMO` | 12 | interceptors granted at wave start |
| `RELOAD` | drip +1 / 2.5 s | optional slow refill within a wave |
| `BLAST_RMAX` | 46 px | max ring radius |
| `BLAST_LIFE` | 0.6 s | ring active duration |
| `INT_SPD` | 520 px/s | interceptor travel speed |
| `MAX_INFLIGHT` | 4 | concurrent interceptors |
| `THREAT_SPD` | 38 px/s × (1 + 0.12·wave) | descent speed ramp |
| `THREATS_PER_WAVE` | 4 + 2·wave | |
| `SPLITTER_UNLOCK` | wave 2 | |
| `SMART_UNLOCK` | wave 4 | |

## Scoring & leaderboard

- `ID = 'INTERCEPT'`, metric = **cumulative score**.
- Per threat destroyed: `+25 × wave`.
- **Multi-kill bonus:** `+50 × (k − 1)²` for `k` kills in one blast (k=2 → +50, k=3 → +200, k=4 → +450).
  This convex curve is the skill gradient hunters chase.
- End-of-wave tally: `+100 × unused ammo` (efficiency) and `+250 × sites still alive` (preservation).
- `GameStats.submitScore('INTERCEPT', score)` on last-site loss. `GameStats.ping('INTERCEPT', dt)` each
  play frame.

## Difficulty curve

Each wave: more threats, +12% speed, then **splitters** (w2 — fork into two), **MIRV bursts** (w3 — a
single threat that spawns a fan), **smart-seekers** (w4 — track the nearest live site). Self-balancing:
pressure scales until the player's aim/ammo can't keep up.

## Daily-seed usage (foundation §1)

`const rng = AASeed.daily('INTERCEPT')`. Seed: per-wave threat count, spawn x, launch times, type mix,
splitter fork altitudes, smart-seeker targets. Same assault for everyone today. Free play uses
`AASeed.rngFrom(crypto.randomUUID())`.

## Haptics map (foundation §4)

| Event | Call |
|---|---|
| interceptor launch | `Feel.commit()` |
| multi-kill (k ≥ 2) | `Feel.heavy()` |
| a site destroyed | `Feel.warn()` |
| wave clear | `Feel.success()` |
| game over | `Feel.fail()` |

## HUD & overlays

- **Top bar:** `SCORE`, `WAVE`, `AMMO` (number or a small pip row), and **site icons** (lit = alive).
- **Title overlay:** one-line rules + Daily/Free toggle + `DEFEND ▶`.
- **Game-over overlay:** final score, best wave reached, sites-saved line, `RESTART`.
- **Wave-clear:** brief inline tally (bonus breakdown) before the next wave, not a blocking modal.

## Build checklist

- [ ] Create `public/seed.js` (if not already created by an earlier game build).
- [ ] `public/intercept.html` from the foundation skeleton; include seed.js + juice.js + stats.js + cabinet.js/css.
- [ ] Point-in-expanding-circle collision for blast↔threat; track per-blast kill count for the multi-kill bonus.
- [ ] Cap concurrent interceptors (`MAX_INFLIGHT`).
- [ ] Wire the 5 touchpoints (foundation §5) with accent `#ff4747`.
- [ ] Test in the iOS simulator: tap registers as a single interceptor; pause button works; safe-area OK.

## Open questions (for the build chat)

- Charge-blast (hold) in v1, or defer to v2?
- One shared ammo pool, or multiple batteries each with their own ammo + nearest-battery launch?
- A rare **smart-bomb / screen-clear** drop as a comeback mechanic?
- Should sites be repairable between waves (spend a wave bonus), or strictly attritional?
