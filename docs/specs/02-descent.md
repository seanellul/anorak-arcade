# DESCENT — spec

> Read [`00-foundation.md`](00-foundation.md) first (seed RNG, skeleton, iOS control contract,
> haptics vocab, 5 touchpoints). This doc covers only what's specific to DESCENT.

## Identity

- **Title / verb:** DESCENT · *FREEFALL*
- **Accent:** `#b15cff` (provisional)
- **Atom:** one-button auto-runner (Canabalt), reframed as a **gravity-flip vertical fall**
  (Gravity-Guy / VVVVVV feel).
- **Pitch:** *"You're falling. One tap flips which wall you cling to. Don't hit anything. How deep can you go?"*
- **Why it hunts:** the purest possible mobile control — one binary tap — with a continuous,
  ever-tightening ramp. Sub-30-second runs, zero friction, instant "one more." The single best genre
  for daily ghost-races on a shared seed.

## Core loop

1. The vessel descends a vertical shaft at ever-increasing speed, clinging to the **left** or **right**
   wall.
2. **Tap anywhere → dash across** to the opposite wall (a short lateral travel, not instant).
3. Obstacles jut from each wall (seeded). You must be on the safe wall, or threading a gap, as you pass.
4. Optional **charge pickups** sit on the riskier line and raise a score multiplier.
5. Depth = score. **One collision ends the run.**

## Controls (iOS-first — see foundation §3)

- **tap-to-act.** Single binary input: tap = flip wall. Nothing else.
- The dash has a **short travel time** (`DASH_TIME`), so timing — not mere presence — is the skill: flip
  too early and you arrive into an obstacle on the far wall; too late and you clip the near one.
- Desktop: mouse-click or spacebar, identical gesture.

## State & entities

```
Vessel   { side:-1|+1, x, dashing, dashT }     // x interpolates during a dash; collidable throughout
Obstacle { y, side, kind:'spike'|'block'|'gate' }   // gate spans most of the shaft with one slot
Pickup   { y, side, taken }                    // multiplier charge
Globals  { depth, speed, mult }
```

The shaft scrolls upward past the vessel (vessel stays at a fixed screen y; the world moves). Collision:
vessel rect vs obstacle rect each frame, **including mid-dash** (the lateral interpolation matters).

## Tuning constants (starting values — all overridable)

| Const | Value | Note |
|---|---|---|
| `SPEED0` | 180 px/s | initial descent speed |
| `SPEED_RAMP` | +6 px/s per 100 depth | up to a cap |
| `SPEED_CAP` | ~620 px/s | |
| `DASH_TIME` | 0.13 s | lateral travel duration |
| `OBSTACLE_GAP` | 320 px → 200 px | spacing tightens with depth |
| `PICKUP_RATE` | seeded, sparse | on the risky line |
| `MULT_STEP` | +0.1 per pickup | |

## Scoring & leaderboard

- `ID = 'DESCENT'`, metric = `floor(depth) + pickupBonus`, all scaled by `mult`.
- `GameStats.submitScore('DESCENT', score)` on crash. `GameStats.ping('DESCENT', dt)` each play frame.
- Tiny, legible, infinitely "one-more." The multiplier is the greed lever: safe players bank depth,
  brave players chase pickups on the dangerous wall.

## Difficulty curve

Continuous, no discrete waves — the ramp *is* the tension. Speed rises with depth; obstacle gaps
tighten; gates and double-obstacles (both walls hazardous, forcing a precise gap-thread) appear deeper.

## Daily-seed usage (foundation §1)

`const rng = AASeed.daily('DESCENT')` generates the **entire shaft layout** ahead of the vessel
(obstacle `y`/`side`/`kind`, pickup placement). Everyone falls the identical shaft → asynchronous
**ghost races** and a clean daily ladder. A ghost overlay (your best run / a rival's) is downstream and
optional. Free play uses `AASeed.rngFrom(crypto.randomUUID())`.

## Haptics map (foundation §4)

| Event | Call |
|---|---|
| flip / dash | `Feel.tap()` |
| collect pickup | `Feel.select()` |
| depth milestone (every 500) | `Feel.commit()` |
| crash | `Feel.fail()` |

## HUD & overlays

- **Minimal** (this is a twitch game — keep chrome tiny): `DEPTH` big, `×MULT` small, `BEST` ghost line.
- **Title overlay:** Daily/Free toggle + `DIVE ▶`.
- **Game-over overlay:** depth reached, peak multiplier, `RESTART`. Make restart a single tap — momentum
  matters.

## Build checklist

- [ ] Create `public/seed.js` (if not already created by an earlier game build).
- [ ] `public/descent.html` from the foundation skeleton; include seed.js + juice.js + stats.js (cabinet optional).
- [ ] World-scroll model (vessel fixed y, layout moves up); pre-generate layout chunks from `rng` as depth increases.
- [ ] Vessel-rect vs obstacle-rect collision each frame **including the dash interpolation**.
- [ ] Parallax shaft walls so speed is legible.
- [ ] Wire the 5 touchpoints (foundation §5) with accent `#b15cff`.
- [ ] Test in the iOS simulator: tap = flip; restart-on-tap; pause button; safe-area OK.

## Open questions (for the build chat)

- **Gravity-flip (two walls)** — spec's lead — vs **jump (Canabalt floor)**. Confirm before building.
- Multiplier: monotonic (only grows), or does it **decay/reset** on a missed pickup to reward greed
  more sharply?
- A single rare **shield** pickup (absorb one hit) for comeback feel, or keep it brutally pure?
- Should the vessel be able to **double-flip** mid-dash (cancel), or is a dash committed once started?
