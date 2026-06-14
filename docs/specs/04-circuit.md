# CIRCUIT — spec

> Read [`00-foundation.md`](00-foundation.md) first (seed RNG, skeleton, iOS control contract,
> haptics vocab, 5 touchpoints). This doc covers only what's specific to CIRCUIT.

## Identity

- **Title / verb:** CIRCUIT · *CIRCUIT*
- **Accent:** `#2fe0b0` (provisional)
- **Atom:** Snake × Tron — continuous trail, self-collision death — with a **graze-combo** twist that
  makes near-misses the scoring play.
- **Pitch:** *"A live current. Collect charge, skim your own trail for combo — touch it and you discharge."*
- **Why it hunts:** the graze meter turns a safe avoidance game into a nerve game. A timid player banks
  base pickups; a brave one skates millimetres from their own light-trail to pump a combo multiplier,
  massively out-scoring the cautious. The risk dial is *your own body*.
- **Distinct from CINDER/CLEAVE:** no territory-enclosure here. Continuous free-direction movement +
  self-collision death + graze is a different mechanical family from the wall-drawing/partition games.

## Core loop

1. A head moves continuously, laying a **permanent trail**.
2. Collect **pips** to score and grow the trail; speed ramps with each pickup.
3. Hitting your **own trail** or a **wall** ends the run.
4. **Twist — graze meter:** the closer the head skims a trail segment *without touching*, the faster a
   **combo multiplier** climbs. Graze distance is the risk dial.

## Controls (iOS-first — see foundation §3)

- **steer-toward-touch** (primary). The head continuously turns toward the current touch point at a
  capped turn-rate (`MAX_TURN`) — analog, free-direction, satisfying on a thumb. Release = hold the
  current heading. Desktop: mouse position.
- *(Open, accessibility alt)*: tap left/right screen halves = ±90° grid turns.

## State & entities

```
Head    { x, y, dir }                           // turns toward touch with MAX_TURN per second
trail   [ {x,y}, … ]                             // decimated polyline (min-gap between points)
Pickup  { x, y, taken }                          // seeded spawn order/positions
Globals { combo, grazeMeter, speed, length }
```

- **Self-collision (death):** head within `R_DIE` of any **non-recent** trail segment. Ignore the last
  few segments so a tight turn doesn't insta-kill.
- **Graze (combo):** head within `R_GRAZE` (> `R_DIE`) of a segment → combo climbs while in range.
- Use a point-to-segment distance test; for performance, spatially bucket or only test segments within
  a bounding window of the head.

## Tuning constants (starting values — all overridable)

| Const | Value | Note |
|---|---|---|
| `SPEED0` | 150 px/s | base speed |
| `SPEED_STEP` | +4 px/s per pickup | up to a cap |
| `SPEED_CAP` | ~360 px/s | |
| `MAX_TURN` | 240 °/s | steering rate |
| `R_DIE` | 6 px | self-collision radius |
| `R_GRAZE` | 18 px | graze radius (must be > R_DIE) |
| `GROW` | 14 px trail per pickup | |
| `COMBO_DECAY` | after ~1.2 s with no graze | combo bleeds back down |
| `IGNORE_SEGMENTS` | last ~8 points | excluded from self-collision |

## Scoring & leaderboard

- `ID = 'CIRCUIT'`, metric = `Σ pickup(10) × comboMult` + a small survival drip.
- `comboMult` climbs with **sustained grazing** — a brave skater out-scores a safe one by a wide margin.
- `GameStats.submitScore('CIRCUIT', score)` on crash. `GameStats.ping('CIRCUIT', dt)` each play frame.

## Difficulty curve

Emergent, no scripted waves: speed rises with each pickup, and your own **lengthening trail shrinks the
safe space**. The board fills with your own risk — the player authors their own difficulty.

## Daily-seed usage (foundation §1)

`const rng = AASeed.daily('CIRCUIT')` seeds pickup spawn order/positions and any arena obstacles. Same
board for everyone today. Free play uses `AASeed.rngFrom(crypto.randomUUID())`.

## Haptics map (foundation §4)

| Event | Call |
|---|---|
| collect pip | `Feel.tap()` |
| enter graze range | `Feel.warn()` (throttled — not continuous) |
| combo milestone | `Feel.heavy()` |
| crash | `Feel.fail()` |

> Throttle the graze `warn` (e.g. once per entry into range, or every ~0.4 s) so it isn't a continuous
> buzz while skating.

## HUD & overlays

- **Top bar:** `SCORE`, `×COMBO` (pulsing near milestones), and a graze proximity tell (e.g. a glow on
  the head/trail when in graze range).
- **Title overlay:** Daily/Free toggle + `CHARGE ▶`.
- **Game-over overlay:** score, peak combo, trail length, `RESTART`.

## Build checklist

- [ ] Create `public/seed.js` (if not already created by an earlier game build).
- [ ] `public/circuit.html` from the foundation skeleton; include seed.js + juice.js + stats.js + cabinet.js/css.
- [ ] Decimated-polyline trail; point-to-segment distance test for both `R_DIE` and `R_GRAZE`; spatial
      windowing for performance as the trail grows.
- [ ] Exclude the last `IGNORE_SEGMENTS` from self-collision (no insta-kill on tight turns).
- [ ] Tune `R_DIE`/`R_GRAZE` for a fair-but-tense skim window.
- [ ] Wire the 5 touchpoints (foundation §5) with accent `#2fe0b0`.
- [ ] Test in the iOS simulator: head tracks the thumb smoothly; graze feels rewarding not punishing;
      pause button; safe-area OK.

## Open questions (for the build chat)

- **Free-direction steer** (spec's lead) vs **grid tap-turns** as the *primary* control?
- Should grazing also **speed you up** (extra risk for extra reward), or only feed the combo?
- **Length cap** or unbounded trail?
- Arena **obstacles** (static hazards) in v1, or just walls + your own trail?
- Does a closed loop do anything (bonus/clear), or is enclosure deliberately *not* a mechanic to stay
  clear of CINDER/CLEAVE? (Spec's lead: no enclosure mechanic — keep it pure flow + graze.)
