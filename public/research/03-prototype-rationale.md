# The 4 Prototypes — Research → Design Rationale

Four **different core verbs**, each engineered to reproduce the 8 pillars and the neuro-loop
(`02-design-pillars.md`) *without* falling tetrominoes or line clears. None is a Tetris reskin; each
attacks the same psychology from a distinct mechanical angle so we can A/B which "feel" lands.

| Prototype | Core verb | The fresh metaphor | Tetris pillar it leans hardest on |
|-----------|-----------|--------------------|-----------------------------------|
| **CINDER** | **Enclose** (draw walls) | Contain a spreading fire before it overruns the grid | #2 Order-from-chaos, #4 risk/reward release |
| **STRATA** | **Shift** (slide rows) | Slide rising rock layers to align mineral veins | #1 Perpetual pressure, #2 order-from-chaos |
| **CONDUIT** | **Rotate** (route a pulse) | Rotate nodes to channel a rhythmic energy pulse to its sink | #4 Tension–resolution rhythm, #8 self-scaling |
| **HOMEOSTAT** | **Allocate** (feed meters) | Keep accelerating reactors inside their "flow band" | #1 Perpetual pressure, #3 tractable decisions |

---

## CINDER — *the containment loop*
**Verb:** drag to paint walls. **Generator:** embers ignite adjacent cells every tick (deterministic
probabilistic spread). **Completion:** fully enclose an ember cluster → it suffocates → clears to ash
(score), enclosing walls refund. **Loss:** embers exceed the grid's capacity.
- **Order from chaos (2):** the chaos is literal — a spreading fire — and your verb imposes order
  (boundaries). The strongest visual instantiation of the core fantasy.
- **Risk/reward = the Tetris gamble (4, 6):** a bigger cluster scores more but is one tick from
  overrun. Enclose early (safe singles) vs. let it grow (a "Tetris"). Identical decision shape.
- **Zeigarnik (§3.3):** a half-built wall is the purest possible open loop — your eye *must* close it.
- **Self-scaling (8):** spread rate + new ignition seeds accelerate over time.
- **Fairness (5,7):** spread is visible and rule-based; every overrun is traceable to a slow wall.

## STRATA — *the shifting-field loop*
**Verbs:** select a row and **slide** it left/right (wrap); **drop** (↓) to compact the stack; **push
up** (↑/space) to force the next Shift. **Generator:** a new random colored row is pushed up on each
**Shift**. **Completion:** matches resolve **only during a Shift** — everything rises, *then* ≥3
connected same-color cells crystallize, clear, and blocks fall into **cascades** (the chain
multiplier). Between Shifts you freely rearrange and compact to build *larger-than-3* groups, so the
timing of the rise is the core tension. **Loss:** a Shift forces a filled cell past the top.
*(Design note: decoupling "rearrange" (free, no clear) from "resolve" (only on the rising Shift) is
what turns each rise into a punctuated tension→resolution beat — Pillar 4 — rather than a constant
trickle of clears, and lets the player gamble on bigger setups, the order-from-chaos payoff.)*
- **Perpetual pressure (1):** the rising floor is the falling-stack inverted — the threat literally
  rises toward the ceiling on its own clock.
- **Order from chaos (2) + tractable decisions (3):** disordered strata; each shift is one obvious
  move, but planning cascades across the whole field is deep.
- **Tension–resolution (4):** rising tension; a cascade is the juiced burst (combo multiplier).
- **Distinct from Tetris:** you never place pieces — you manipulate the *existing* field. The verb is
  rearrangement, not deposition.

## CONDUIT — *the rhythmic routing loop*
**Verb:** click a node to rotate its connectors 90°. **Generator:** a source emits a pulse every beat
toward a randomly-lit sink; the lit sink (and occasional scrambles) are the uncertainty stream.
**Completion:** when source→sink is connected at beat time, the pulse delivers (score, charge drops).
**Loss:** undelivered pulses raise a charge meter to overload.
- **Tension–resolution rhythm (4):** the beat **is** the metronome of stress/catharsis — the most
  literal rendering of dossier §3.2's anticipation→resolution micro-cycle.
- **Self-scaling (8):** beat interval shrinks as score rises — less time to route.
- **Transparent state (5):** every connector and the incoming beat are visible; pure foreknowledge,
  intractable execution under time (echoes the NP-hard-but-legible structure).
- **Wanting (§3.2):** the next beat is *always coming* — anticipation pull is continuous.

## HOMEOSTAT — *the plate-spinning loop*
**Verb:** hold a key / click to feed one reactor at a time. **Generator:** each reactor drains at its
own (accelerating) rate; reactors are added over time. **Completion (soft):** keeping a reactor in its
green "flow band" scores continuously; recovering a critical one is the juiced release. **Loss:** any
reactor hits 0 (starve) or 100 (overload).
- **Perpetual pressure (1) + loss-aversion (§4):** everything drains; you can only feed one — the
  dominant felt motive is *avoiding* a flat-line, exactly Tetris's top-out aversion.
- **Tractable decisions under uncertainty (3):** which reactor *now*? Each call is obvious; the global
  juggling problem is deep and gets deeper as reactors multiply.
- **Flow channel made literal (§3.4):** the scoring zone is *named* the flow band — reward is paid for
  living between starve (boredom) and overload (anxiety).
- **Most abstract / most different verb:** no grid at all — proves the pillars are substrate-independent.

---

## What we're testing across the four
- **Spatial vs. temporal pressure:** CINDER/STRATA (spatial) vs CONDUIT/HOMEOSTAT (clock/beat).
- **Build vs. rearrange vs. route vs. balance:** four different relationships to "imposing order."
- **Which release feels best:** an enclosure *pop*, a cascade *chain*, a delivery *pulse*, or a
  recovery *save*. The one with the strongest tension→resolution "snap" is the candidate to deepen.

Each ships as a standalone zero-dependency HTML file (`public/*.html`) with on-screen controls,
a live score/pressure readout, WebAudio tension-release cues, and a fail→instant-restart loop so the
loss-is-cheap property (dossier §3.7) holds. Open `public/index.html` to launch all four.
