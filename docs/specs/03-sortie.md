# SORTIE — spec

> Read [`00-foundation.md`](00-foundation.md) first (seed RNG, skeleton, iOS control contract,
> haptics vocab, 5 touchpoints). This doc covers only what's specific to SORTIE.

## Identity

- **Title / verb:** SORTIE · *FORMATION*
- **Accent:** `#ff9d3d` (provisional)
- **Atom:** Galaga — formation disruption.
- **Pitch:** *"Hold the line. Enemies assemble, then peel off to dive. Risk capture to fly as two — and double everything."*
- **Why it hunts:** the **capture-and-recover dual-ship** gamble. A safe player banks a modest score; a
  player who deliberately risks capture to fly as two — doubling fire and points — opens a 10k-vs-100k
  gap. That risk/reward multiplier is exactly why Galaga's score chase endured.

## Core loop

1. Ship at the bottom, **auto-firing** upward.
2. Enemies fly in, assemble into a top **formation**, then peel off in seeded **dive patterns** you
   shoot down.
3. **Signature hook:** a **captor** enemy can tractor-beam your ship → costs a life, ship held at top.
   Destroy the captor *while it holds your ship* → **recover** it and fly as a **dual ship**: double
   fire + **double score**.
4. Run ends when all lives are lost. Waves escalate.

## Controls (iOS-first — see foundation §3)

- **drag-to-position.** Ship `x` follows the finger's x (absolute, clamped to the playfield). Firing is
  automatic — no fire button.
- Fully single-pointer, one-thumb. Desktop: mouse-x.
- *(Open, v2)*: tap = a scarce **bomb** special.

## State & entities

```
Ship   { x, dual, lives }
Bullet { x, y }                                 // player; auto-rate (×2 when dual)
Enemy  { slot, state:'enter'|'formed'|'diving', path, type:'grunt'|'captor', hp }
                                                // path = seeded bezier for enter / dive
Beam   { captorId, phase:'grab'|'hold'|'recover' }   // the capture sub-state machine
```

The **capture → hold → recover** sequence is the trickiest piece — model it as its own sub-state
machine, not inline flags. While a captor holds the ship, the player still controls a (single) ship if
a life remains; killing the captor in the hold phase triggers `recover` → `dual = true`.

## Tuning constants (starting values — all overridable)

| Const | Value | Note |
|---|---|---|
| `FORM_COLS` | 8 | formation width |
| `FORM_ROWS` | 4 | formation height |
| `LIVES` | 3 | |
| `FIRE_RATE` | 6 / s | doubled when `dual` |
| `DIVE_FREQ` | ramps with wave | divers per second peeling off |
| `CAPTOR_COUNT` | 1 (wave ≥ 2) | |
| `DIVE_VALUE_MULT` | ×2 of formed | diving enemies worth double |

## Scoring & leaderboard

- `ID = 'SORTIE'`.
- `+50` for a **formed** kill; `+100` for a **diving** kill (rewards aggressive positioning).
- **Capture-recovery doubles all output** while `dual`.
- **Perfect-wave** (all divers downed, ship intact): `+500`.
- `GameStats.submitScore('SORTIE', score)` on final life lost. `GameStats.ping('SORTIE', dt)` each play
  frame.
- The obsession lever = dual-ship uptime + diver farming.

## Difficulty curve

Per wave: faster and denser dives, more captors deeper, tighter dive geometry. **Discrete waves** give
natural "one-more-wave" checkpoints (distinct from DESCENT/CIRCUIT's continuous ramps).

## Daily-seed usage (foundation §1)

`const rng = AASeed.daily('SORTIE')` seeds enter order, formation slot assignment, dive choreography
(bezier control points), and captor timing. Identical assault for everyone today. Free play uses
`AASeed.rngFrom(crypto.randomUUID())`.

## Haptics map (foundation §4)

| Event | Call |
|---|---|
| dive-kill | `Feel.commit()` |
| ship captured | `Feel.heavy()` |
| dual-ship recovery / wave clear | `Feel.success()` |
| life lost | `Feel.warn()` |
| game over | `Feel.fail()` |

> Do **not** fire a haptic per bullet or per formed-kill — it'd be constant. Reserve haptics for the
> meaningful beats above.

## HUD & overlays

- **Top bar:** `SCORE`, `WAVE`, lives icons, a `×2` flag when `dual`.
- **Title overlay:** Daily/Free toggle + `SCRAMBLE ▶`.
- **Game-over overlay:** score, best wave, `RESTART`.

## Build checklist

- [ ] Create `public/seed.js` (if not already created by an earlier game build).
- [ ] `public/sortie.html` from the foundation skeleton; include seed.js + juice.js + stats.js + cabinet.js/css.
- [ ] Bezier path system for enter + dive (seeded control points).
- [ ] Bullet-vs-enemy AABB; player-vs-diver / player-vs-captor-beam collision.
- [ ] The capture → hold → recover sub-state machine (the hard part — build and test it in isolation first).
- [ ] Wire the 5 touchpoints (foundation §5) with accent `#ff9d3d`.
- [ ] Test in the iOS simulator: drag moves the ship smoothly; pause button; safe-area OK.

## Open questions (for the build chat)

- **Dual-ship wider hitbox** (Galaga's classic risk — two ships = a bigger target)? Include or omit?
- Lose the dual-ship on **any** hit, or only on a second capture?
- Bomb special in v1, or defer?
- Should the formation drift side-to-side (Galaga/Space-Invaders style), or hold static while only
  divers move? (Static is simpler and reads cleaner on a phone.)
