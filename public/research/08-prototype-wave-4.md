# Wave 4 — Two New Loops: the Authored Link & the Timed Release

Waves 1–3 rebuilt the Tetris pillars with eight verbs — **enclose, shift, rotate, allocate** (static
fields), **fuse, trigger** (a dynamic basin, a loaded spring), **cut, bend** (division, a live stream).
Read against the matrix in `03`–`05`, two structural cells are still empty:

1. **Every chain so far is *machine-authored*.** SURGE taps a point and the chain *floodfills itself*
   by adjacency; SHIFT *auto-detects* ≥3 same-colour groups on the rise; NOVA's cascade resolves on
   its own physics. The player chooses *where*, never *the shape of the link*. Nobody hands you the
   tangle and asks you to **trace the connection yourself** — to author, stroke by stroke, the longest
   pure route through the mess. Connecting like-with-like is one of the oldest ordering acts there is
   (threading, wiring, stringing beads) and we have never tested the *player as the one who draws it*.
2. **Nobody tests *timing precision* as the core skill.** CONDUIT has a beat, but the beat only *paces*
   the routing — you still win by rotating nodes, not by *when you tap*. No loop in the arcade asks the
   player to release **on a rhythmic window** and grades them on how close they were. This is the one
   skill axis Tetris's cousins (the rhythm-action genre) own outright, and our matrix has a hole where
   it should be.

Wave 4 attacks both. It also continues the standing mandate (since Wave 2): **reactivity is a primary
dopamine channel** — every input over-delivers a physical reaction, and each game adds a *new kind* of
release to the arcade's vocabulary (the dossier's §3.6 prediction-error reward is strongest when the
catharsis is novel): the **current-zip** and the **on-beat shockwave**.

| Prototype | Core verb | Fresh metaphor | New axis it opens | Leans hardest on |
|-----------|-----------|----------------|-------------------|------------------|
| **WEAVE** | **link** (trace a path) | Charged nodes pile up; drag one stroke through same-charge cells to wire a circuit, release to discharge it | **The *player-authored* chain** — you draw the link's exact shape, not just its location | #2 order-from-chaos (as *connection*), #3 tractable-under-uncertainty |
| **PULSE** | **time** (release on the beat) | Motes spiral into a reactor core; tap *on the beat* to fire a shockwave ring that scours them | **Timing precision as the skill** — a rhythmic release window, graded; tempo is the accelerator | #4 tension→resolution rhythm, #8 self-scaling (as *tempo*) |

Both are **one-finger mobile-native** (WEAVE = a trace gesture; PULSE = a tap) and both are built as
**maximum-juice showcases**. WEAVE is the arcade's first *multi-segment authored stroke* (CLEAVE's
swipe is a single straight line; WEAVE's is a freeform path whose *every vertex* is a decision). PULSE
is the arcade's first loop where the *clock face is the controller*.

---

## WEAVE — *the connection loop*

**Verb:** **drag** a continuous stroke that threads through orthogonally/diagonally adjacent
**same-colour** nodes, building a link path; **release** to discharge it. **Generator:** charged nodes
rain from the top and pile up by gravity (the disordered input stream). **Completion:** a path of
**≥ K** same-colour nodes discharges — a current races the wire you drew, each node detonating in
sequence; score scales **super-linearly** with path length, so a long authored snake pays enormously.
The cleared nodes settle under gravity (cascades). **Loss:** the pile rises past the ceiling line.

- **Order from chaos (2), as *connection*:** the chaos is a mottled pile of mixed charges; your verb
  imposes order by **drawing the thread that unites like with like**. This is a fantasy the arcade has
  never rendered — not removing the mess, not fusing it, not partitioning it, but *connecting through*
  it. The satisfaction is the completed circuit: a tangle resolves into a single lit wire.
- **The player authors the chain (new):** SURGE's chain is the machine's (flood-fill); WEAVE's is
  *yours*. The skill is **reading the pile for the longest pure route** and tracing it before it
  buries you — a spatial pathfinding problem you solve with your finger. Every vertex of the stroke is
  a tractable "which same-colour neighbour next?" (Pillar 3) while the global "find the maximum route"
  is genuinely hard.
- **Risk/reward = the Tetris gamble (4, 6):** discharge a short safe path now, or *nurse a colour* —
  let one charge spread into a huge connected blob and trace a monster snake for an n²-class payoff —
  while the pile climbs and the oldest nodes oxidise. The exact "safe single vs. greedy Tetris"
  decision, expressed as **how long a wire do I dare draw**.
- **Transparent + fair (5, 7):** the whole pile and every colour boundary are always visible; a live
  preview lights the exact path and floats its predicted score as you trace. A loss is always a pile
  you let rise. Uncertainty lives only in the next colour that rains.
- **Self-scaling (8):** rain rate ramps with score — one knob, more pile, less time to set up the big
  trace.
- **The new release — the *current-zip*:** discharge should feel like *completing a circuit*. The wire
  you drew flashes to white; a bright current sprints from tail to head; each node pops in sequence
  with an ascending chime and a spark; the head bursts at the end. A *travelling, sequential* catharsis
  — distinct from any simultaneous pop, cascade or eruption in the arcade.

### WEAVE's loss curve (doc 07 recipe, built in from the start)

- **Ratchet — oxidation:** every node ages; un-linked within `rustTime()` it **oxidises into dead grey
  rust** — uncharged, unlinkable, and it *breaks paths* (you must route around it). Rust is removed
  **only** by discharging a path *orthogonally adjacent* to it (the surge scours touching rust). So the
  core verb can no longer erase it; a clean board is the skill reward.
- **Accelerator:** `rustTime()` shrinks as score rises (`RUST_START → RUST_MIN`) and rain rate climbs —
  both monotonic, neither resets.
- **Greed trap, for free:** the big blob you nurse for the monster snake oxidises from its oldest nodes
  first — wait too long and its core rusts, shortening the traceable route *and* seeding path-breaking
  debris.
- **Telegraph:** nodes crack and desaturate over the last ~⅓ of their life, so every oxidation is
  foreseeable and every loss attributable to a node you left too long.

---

## PULSE — *the resonance loop*

**Verb:** **tap** (anywhere) to fire a shockwave from the core — *on the beat*. **Generator:** a reactor
core at centre; colour-coded **motes** spiral inward from the rim in continuous motion (the disordered
stream, *already moving*). **Completion:** the core throbs on a steady **beat** (a visible metronome
ring that contracts to a hit-point); a tap **graded by how close to the beat** fires a shockwave ring —
a perfect on-beat tap fires a **full-power** wave that sweeps far and scours every mote it crosses;
off-beat fires a stunted one. Consecutive on-beat hits build an **in-the-groove streak multiplier** that
escalates every channel. **Loss:** motes that reach the core raise an **overload** meter to overflow.

- **Timing precision as the skill (new):** every other prototype is spatial (where do I place / aim /
  cut / trace). PULSE is **temporal** — the field comes to you, radially, and the only question is
  *when*. The metronome makes the optimal moment **knowable and rhythmic**; nailing it is a motor-timing
  skill the arcade has never demanded. This is the rhythm-genre's home turf, ported onto a Tetris-shaped
  loop.
- **Tension→resolution rhythm (4), made literal:** the beat **is** the metronome of stress and
  catharsis — the most direct rendering of §3.2's anticipation→resolution micro-cycle. Tension is the
  inward creep of the motes; release is the on-beat wave. The loop *has a pulse* you can feel in your
  thumb.
- **The loaded spring, re-timed:** like SURGE you choose the moment — but here the moment is gated by
  the *rhythm*, not just a charge bar. Wait for the motes to bunch into a dense shell before you fire
  (greedy), and risk one breaching the core. Fire early and safe, and clear less.
- **Transparent + fair (5, 7):** every mote's path and the metronome's phase are always visible; the
  shockwave's reach is deterministic. A breach is always a beat you missed or a wave you fired too
  early/weak. Uncertainty is only the next emission.
- **Self-scaling (8), as *tempo*:** the single knob is the **beat tempo**, which ramps with score. A
  faster beat is simultaneously the reward signal (more releases) and the difficulty (a tighter timing
  window, faster inward creep). This is the *cleanest* analogue in the arcade to Tetris's one-way
  gravity ramp — speed that only ever climbs.
- **The new release — the *on-beat shockwave*:** a perfect tap detonates the core, fires a screen-wide
  ring that obliterates a field of motes in one expanding sweep, snaps a flash on the beat, and — at
  high streaks — drops the whole sim into the groove (pitch-laddered, time-dilated apex). A *radial,
  rhythm-locked* catharsis, distinct from SURGE's adjacency chain.

### PULSE's loss curve (doc 07 recipe, built in from the start)

- **Ratchet — slag scars:** a mote that reaches the core without being cleared **fuses to it as a slag
  scar**, permanently enlarging the core (shrinking the safe field; the bigger core is easier to breach
  next time) and un-cleared by ordinary shockwaves. Only a **perfect, high-streak** wave chips a scar
  loose — so the skill reward (staying in the groove) is the *only* way to claw the field back.
- **Accelerator:** beat tempo and inward spiral speed both ramp monotonically with score — a tighter
  window and a faster creep, neither resetting.
- **Greed trap, for free:** holding fire to let motes bunch for a fat multi-clear is exactly the play
  that risks a breach → a permanent scar.
- **Telegraph:** the metronome ring's contraction *is* the window; a mote near the core flashes a
  breach-warning before it fuses, so every scar is foreseeable.

---

## What Wave 4 adds to the testing matrix

- **Machine-authored vs. player-authored chain:** SURGE flood-fills the chain from a tapped point;
  **WEAVE** makes the player *draw its exact shape*. The cleanest A/B in the arcade on "who finds the
  combo — the system or the hand."
- **Spatial trigger vs. temporal trigger:** SURGE is *where* you tap; **PULSE** is *when*. Two opposite
  answers to "what makes a single gambled release thrilling" — reading a cluster in space vs. catching a
  window in time.
- **A new input grammar — the multi-segment authored stroke:** CLEAVE proved the single straight stroke;
  **WEAVE** is the first *path* whose every vertex carries meaning — a richer mobile gesture to test.
- **Rhythm as a first-class pillar:** CONDUIT *paced* with a beat; **PULSE** *scores on* the beat,
  making tempo the self-scaling knob. The first time the arcade tests the rhythm-genre's core loop on
  Tetris-shaped bones.
- **Two new catharses — the current-zip and the on-beat shockwave:** a sequential travelling discharge,
  and a radial rhythm-locked obliteration. Each engineered to be the most satisfying instance of its
  verb we can render in 2D.

Each ships as a standalone zero-dependency HTML file (`public/weave.html`, `public/pulse.html`) with a
live score/pressure readout, WebAudio tension–release cues, haptics where supported, a
fail→instant-restart loop, and a `window.__weave` / `window.__pulse` debug hook for headless validation.
Both pass the "is it Tetris-shaped?" acceptance test (`02-design-pillars.md`) while testing a
relationship to *order* — the authored connection, and the timed release — that the first nine never did.
The six dedicated juice cycles per game are logged in `09-juice-log-wave-4.md`.
