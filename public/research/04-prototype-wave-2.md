# Wave 2 — Two New Loops: Synthesis & the Loaded Spring

The first four prototypes (`03-prototype-rationale.md`) each rebuilt the Tetris pillars with a
*different verb* — **enclose, shift, rotate, allocate** — but they share two hidden assumptions:

1. **The substrate is static.** The field is a grid you edit; it never moves on its own (CINDER's
   fire spreads cell-by-cell on a tick, but nothing has *momentum*).
2. **You act continuously.** There is no moment where you *stop inputting, load the field, and then
   release a single decisive act.* Every game pays you a steady trickle of small resolutions.

Wave 2 deliberately attacks both assumptions, to test whether the 8 pillars survive — and whether
**juice scales** — when (a) the substrate is *physical and alive*, and (b) the core act is a single
*timed, gambled trigger* instead of a steady stream of moves.

| Prototype | Core verb | Fresh metaphor | New axis it opens | Leans hardest on |
|-----------|-----------|----------------|-------------------|------------------|
| **NOVA** | **fuse** (drop & merge) | Drop motes into a gravity basin; equal masses fuse upward to a supernova | **Dynamic physical substrate** — the field has gravity, collision, momentum | #2 order-from-chaos (as *synthesis*), #4 risk/reward |
| **SURGE** | **trigger** (set up, then detonate) | Charged orbs drift and pile toward critical mass; spend charge to fire an arc that chains | **The loaded spring** — delayed gratification; you choose the *moment*, not just the move | #4 tension→resolution (taken to its extreme), #1 perpetual pressure |

Both are **one-finger mobile-native** by construction (NOVA = aim + drop; SURGE = tap to detonate),
and both are engineered as **maximum-juice showcases** — the explicit mandate of this wave is to go
*beyond* the game-feel of the first four. Juice and reactivity are treated here not as polish but as
a **primary dopamine channel**: every input must produce an immediate, physical, over-delivered
reaction (Berridge "wanting" is fed by anticipation; the *prediction-error reward*, dossier §3.6, is
fed by a release that consistently over-delivers versus what the input "should" have earned).

---

## NOVA — *the fusion loop*

**Verb:** aim horizontally, **drop** a glowing mote into a basin. **Generator:** the *next* mote's
tier is a random small value (the disordered input stream). **Completion:** two equal-tier masses in
contact **fuse** into one mass of the next tier — with a bloom, a squash, and a pitch-stepped chime —
and a fusion can *cascade* (the new mass immediately fuses with a neighbour, chaining a combo).
Reaching the top tier spawns a **NOVA** that detonates, clearing a wide radius (the juiced
pressure-release). **Loss:** masses pile above the basin's rim line for too long.

- **Order from chaos (2), as *synthesis*:** every other prototype imposes order by *elimination*
  (clear the fire / the run / the queue). NOVA imposes it by *combination* — small + small → big.
  This is the 2048 / Suika dopamine, studied and rebuilt: the satisfaction is watching mess *climb a
  ladder* toward a single radiant goal.
- **Risk/reward = the Tetris gamble (4, 6):** stack a careful pyramid for a guaranteed cascade, or
  greedily drop a big mote into a crowded basin for a huge chain that might instead overflow you. The
  *exact* decision shape of "safe single vs. risky Tetris," now governed by physics.
- **Dynamic substrate (new):** the field has gravity, collision and momentum. Nothing else in the
  arcade *moves on its own with inertia.* This is the richest possible juice substrate — every drop
  bounces, every fusion shoves its neighbours, every settle jiggles. Tactile cause-and-effect is the
  most primal game-feel there is, and we test whether it amplifies the loop.
- **Self-scaling (8):** the single knob is the **basin's own fill level** — the more you score
  without cascading, the less room you have, the higher the stakes. Reward signal *is* difficulty.
- **Transparent + fair (5, 7):** the whole basin and the next-mote preview are always visible; every
  overflow is a stack you let grow. Uncertainty lives only in the next draw.
- **Visuospatial saturation (§3.5):** continuous physical packing fully occupies spatial working
  memory — you are always sub-vocally solving "where does this fit."

## SURGE — *the loaded-spring loop*

**Verb:** **tap** an empty point to fire a detonation; it pops nearby charged orbs, and each popped
orb detonates its own neighbours — an **arc chain** rips outward. **Generator:** charged orbs drift
in continuously and accumulate, packing the field and drifting toward a **critical line**.
**Completion:** a chain pops orbs (score scales *super-linearly* with chain length) and **relieves
pressure** by clearing them; a long chain is a screen-wide eruption. **Resource:** a **charge meter**
refills over time — you can only detonate when charged, so you must pick the *moment*. **Loss:** the
field packs past critical mass.

- **Tension→resolution rhythm (4), to the extreme:** every other prototype trickles out resolutions;
  SURGE lets you *hold the spring.* You watch the field densify (pure rising tension, Zeigarnik open
  loop §3.3), and a single tap converts an accumulated mess into one explosive release. It is the
  most concentrated tension→catharsis cycle we can build.
- **The loaded-spring gamble (new philosophy):** detonate *now* for a safe modest chain, or wait one
  more breath for a denser cluster and a vastly bigger eruption — while the field creeps toward
  overflow and your charge sits spent if you misfire. This is CINDER's proven "let it grow" gamble
  (CINDER is our most-played) **transplanted onto a more explosive, more reactive substrate** — a
  deliberate test of whether the most-loved decision shape travels.
- **Perpetual pressure (1):** the drift never stops; an idle player's default trajectory is overflow.
- **Tractable decisions under uncertainty (3, 6):** each tap is one obvious "where's the densest
  reachable cluster?"; planning multi-stage chains (detonate to *herd* orbs into a future super-chain)
  is deep and high-skilled.
- **Self-scaling (8):** drift rate and spawn rate ramp with score — one knob.
- **Juice ceiling:** a chain reaction is the single most spectacular thing a 2D game can render — a
  one-input, screen-wide cascade of light. It is the purest reactivity showcase in the arcade.

---

## What Wave 2 adds to the testing matrix

- **Static vs. dynamic substrate:** CINDER/SHIFT/CONDUIT/HOMEOSTAT edit a still field; **NOVA** lives
  in physics. Does momentum/collision juice deepen the loop or distract from it?
- **Continuous action vs. the loaded trigger:** all four originals pay a steady trickle; **SURGE**
  withholds, letting tension accumulate to a single gambled release. Which produces a stronger
  craving — the steady drip or the held breath?
- **Order by elimination vs. order by synthesis:** the originals *remove* mess; **NOVA** *combines* it
  upward. Two opposite fantasies of "imposing order."
- **Juice as a primary channel:** both are built to over-deliver on every input — squash, bloom,
  shake, chromatic split, pitch-laddered audio, haptics, time-dilation on the big moments — to test
  the hypothesis that **reactivity itself is a dopamine source**, not merely a coat of paint.

Each ships as a standalone zero-dependency HTML file (`public/nova.html`, `public/surge.html`) with a
live score/pressure readout, WebAudio tension-release cues, haptics where supported, and a
fail→instant-restart loop. Both pass the "is it Tetris-shaped?" acceptance test
(`02-design-pillars.md`) while testing a relationship to *order* that the first four never did.
