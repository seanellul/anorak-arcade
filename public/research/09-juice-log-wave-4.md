# Wave 4 — The Juice Log

The standing mandate since Wave 2: **reactivity is a primary dopamine channel** (dossier §3.6,
prediction-error reward), not a coat of paint. After each game's loop was built and its core algorithm
verified deterministically (in-browser via a `window.__weave` / `window.__pulse` debug hook, with
headless autoplayers used to *balance* the loss curve before any polish), **six dedicated game-feel
cycles** were run per game — each a focused pass engineered to go *beyond* the delivery of the earlier
arcade. This log records what each cycle added and *why*, so the techniques transfer.

Both games share the arcade's `juice.js` toolkit (audio tones/chords, the particle/floater/ring/shake
FX layer, the edge vignette) and extend it with per-game effects. Both inherit the Wave-2/3 reusable
kit — time-dilation on the apex, over-deliver on every input, anticipation telegraphs, legible
pressure, read-ahead affordances — and each adds **one new catharsis** to the arcade's vocabulary.

---

## WEAVE — the current-zip

Base (pre-juice): a working draw-to-link loop — trace a stroke through orthogonally/diagonally adjacent
same-charge nodes, release to discharge a wire of ≥ K, super-linear scoring, gravity settle, an
oxidation ratchet. Verified deterministically (`window.__weave`): `findWire` locates a same-colour
route, `wire()` validates adjacency/colour and discharges, `gainFor` is super-linear, the rust timer
shrinks with score. Balanced against headless autoplayers — a *competent* player (≈1 trace/sec) holds a
tense ~80 % pile with rust accumulating; a *sloppy* player overruns; a node-perfect superhuman keeps the
board empty but scores poorly (the greed trap holds).

**Cycle 1 — The trace, alive.** The core verb is a *continuous authored gesture*, so it must respond
under the finger, vertex by vertex. As the stroke threads each node: the wire draws itself between
linked nodes (a graded glow core + outer bloom in the charge colour), the newly-linked node squashes
and pops, a **pitch ladder climbs one step per node** (you *hear* the wire growing — anticipation made
audible), a soft spark puffs, and a haptic tick fires. A **flowing dash** drifts along the live wire
toward the head, telegraphing the discharge to come.

**Cycle 2 — The current-zip discharge.** The release is the new catharsis, so it over-delivers and is
*sequential*: on let-go the wire flashes, a **bright current head sprints tail→head** along the exact
path you drew, and each node detonates **in order** into spinning charge-shards over twin rings (colour
+ white), with an **ascending arpeggio that ladders up the wire** and a brighter tick at the head. The
spent wire glows and fades behind the current. A long snake reads as a whip-crack of light running the
whole circuit — distinct from any simultaneous pop or cascade in the arcade.

**Cycle 3 — Audio identity.** A glassy per-node trace tick (rising ladder); the discharge zip arpeggio
that lengthens and climbs with the wire; a low **circuit-complete boom** on long paths (≥7); a settle
*thud* timed to the falling nodes; a dull oxidation *grind*; a rubble *clatter* when a wire scours
adjacent rust; a danger hum that pulses as the pile fills; sub-audible growth ticks on each rain node.

**Cycle 4 — Anticipation & readability.** An **incoming-node ghost** (a descending charge dot + beam)
telegraphs which column the next rain lands in; columns flash on receive; while tracing, every
same-charge neighbour of the path tail gets a **pulsing "linkable from here" glow** so the next move is
legible (Pillar 5) without removing the search; a **live predicted score** (`+549 ×9`) floats at the
finger; the ceiling pulses faster as it fills; an idle shimmer sweeps the field; per-node charge-glow
makes blobs read as regions.

**Cycle 5 — Pressure & danger.** A reddening, pulsing ceiling line; a red edge vignette that closes in;
a heartbeat that quickens near overload; nervous shimmer; the **oxidation telegraph** — nodes crack and
grey-wash over the last ⅓ of their life so calcification is foreseeable and every loss is attributable
to a node left too long. Big discharges (≥7) trigger a **hit-stop freeze → slow-mo** and a screen flash
scaled to the wire length — the payoff lands physically.

**Cycle 6 — Mobile & feel.** `touch-action:none` so the trace never scrolls the page; length-scaled
**haptics** (a tick per linked node, a pattern on discharge); a finger trail tinted to the live charge;
a first-time **"trace to link" demo stroke** that auto-finds and animates a real route on the board
(shown once, cleared on first discharge); a `prefers-reduced-motion` guard that drops shake/slow-mo and
thins particles; a score **odometer**; a circuit-board backdrop (trace grid + glowing vias) with all
additive FX in `lighter` so glows stack into bloom.

---

## PULSE — the on-beat shockwave

Base (pre-juice): a working rhythm loop — motes spiral inward, a steady beat, a tap graded by timing
(perfect / good / miss) fires a radius-scaled shockwave that scours motes, an on-beat streak multiplier,
a slag-scar ratchet, tempo/speed accelerators. Verified deterministically (`window.__pulse`): a perfect
wave clears every mote in range, `SCAR_MAX` breaches end the run, `firePerfect`/`fireAtPhase` drive the
grader. Balanced against headless rhythm-bots — the accelerators ramp with **elapsed time** (not just
score), so even a low-scoring off-beat player is eventually outpaced; a miss barely defends the core, so
mistimed play accrues breaches → permanent slag → meltdown.

**Cycle 1 — The beat, made physical.** The metronome must be *felt*, not just heard. The core **throbs
on every beat** (a scale-punch + glow flush); a **guide ring contracts to "closed" on the beat** — the
timing window rendered as a closing aperture, brightening to white as the beat lands ("▲ NOW"); a soft
**beat tick** (a stronger downbeat every 4); the whole reactor field breathes a faint ring-pulse on the
beat. The optimal moment is *knowable and rhythmic* (Pillar 5), so timing is skill, not guesswork.

**Cycle 2 — The on-beat shockwave.** The new catharsis is radial and graded. A **perfect** tap fires a
screen-wide, white-cored ring that sweeps the whole field; a **good** tap a medium ring; a **miss** a
stunted grey fizzle that barely clears the core. Each mote the leading edge crosses pops into shards + a
ring + a **scour arpeggio that ladders up with the catch count** — so a dense shell caught in one
perfect wave detonates as a rising run of light and pitch. A radial, rhythm-locked obliteration, unlike
SURGE's adjacency chain.

**Cycle 3 — The groove crescendo.** Consecutive on-beat hits build a **groove streak** that escalates
every channel: the fire pitch climbs with the streak, the core glows hotter and pinker, a red field
tint blooms at ×3 / ×6, shake scales, and a groove chime rings every five. The apex — a perfect wave
that catches a fat shell at high streak — drops the sim into **time-dilation** with a screen flash, so
the biggest moment lands hardest. Being *in the groove* is a felt flow-state, not a number.

**Cycle 4 — Anticipation & readability.** The contracting metronome **is** the anticipation telegraph;
each mote draws an **inward light trail** so its colour and heading read at a glance; motes near the
core flash a **breach-warning ring** before they fuse; the dashed **target ring** shows exactly where
"closed" lands; beat downbeats are accented every four. Intent is always legible (Pillar 5) — a breach
is always a beat you missed, never the system cheating.

**Cycle 5 — Pressure & danger.** **Slag scars visibly crust the core** and swell it, so the shrinking
safe field is legible as physical damage; the core-integrity bar reddens and pulses near meltdown; a red
overload vignette flashes on each breach and rises with danger; a **heartbeat hum** quickens beneath the
beat (a second, dreadful rhythm); a missed beat that breaks a long groove fires a **discordant buzz**
and a desaturating screen flash — failure is honest and audible.

**Cycle 6 — Mobile & feel.** Tap **anywhere** (the whole canvas is the hit area — a one-thumb game);
graded **haptics** (a felt "click" on each on-beat, a pattern on a big perfect wave, a heavy buzz on a
breach); a first-time **"TAP ON THE BEAT" hint synced to the metronome** (flashing "▲ NOW" on the
window, cleared on first fire); a `prefers-reduced-motion` guard that drops shake/slow-mo and shortens
the wave; a score **odometer**; a reactor backdrop (concentric rings + beat-synced field pulse) with all
glow additive so the core and waves bloom.

---

## Techniques worth reusing (Wave 4 additions)

- **Audible anticipation — the climbing ladder.** WEAVE's per-node trace tick and PULSE's per-catch
  scour arpeggio both make the *build* of a release audible in real time, so the player hears the payoff
  growing before it pays. The single cheapest way to make a longer/bigger action *feel* bigger.
- **The sequential release.** WEAVE's current-zip detonates the chain *in order along the authored
  path*, not all at once — a travelling catharsis. Decoupling the visual zip from the (instant) logic
  (cells removed immediately, the zip plays over cached positions, settle deferred until it reads) keeps
  the game snappy while the feedback is cinematic.
- **The clock as a controller.** PULSE's contracting metronome ring turns *timing* into a legible
  spatial target (a closing aperture) — the rhythm-genre's core readability problem solved with one
  breathing circle. The window in *phase* units is constant; tempo shrinks it in *time*, so the
  accelerator and the skill share one knob.
- **Ramp the accelerator on TIME, not just score.** PULSE's first balance pass tied tempo to score and a
  weak off-beat player coasted forever (low score → no ramp → no death). Ramping on elapsed play-time
  makes the pressure *unavoidable* — the cleanest fix for any loop where bad play scores too little to
  trigger a score-based accelerator (a corollary to doc 07's recipe).
- **A miss must not defend you.** Making PULSE's mistimed wave barely clear the core is what gives the
  loss curve teeth: a defence that only a *well-executed* input provides. Generous failure states quietly
  remove the threat.
