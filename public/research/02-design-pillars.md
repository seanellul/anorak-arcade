# The 8 Pillars — Tetris Distilled into a Buildable Spec

These are the **transferable mechanisms** behind Tetris, extracted so they can be rebuilt with
*different verbs*. Each pillar = a principle + the mechanism Tetris uses + the lever we pull.
(Derived from `01-tetris-dossier.md` §2–§4 and the neuroscience in §3.)

| # | Pillar | Principle | Mechanism in Tetris | The lever to reproduce it |
|---|--------|-----------|---------------------|---------------------------|
| 1 | **Perpetual Pressure** | The system always tightens; no stable equilibrium. | Pieces never stop falling; gravity accelerates; the stack only grows. | Make an idle player's default trajectory **loss**. Threat advances on its own clock. |
| 2 | **Order From Chaos** | Hand the player entropy; satisfaction is organizing it. | Random piece stream → impose flat, gapless rows → clear. | Pair a disordered generator with a tidy completion. Core fantasy = competence under mess. |
| 3 | **Tractable Decisions Under Uncertainty** | Each atomic choice is small & legible; the whole problem is intractable. | One piece at a time + small preview; macro-problem is NP-complete. | Decompose deep optimization into a stream of individually-obvious choices. |
| 4 | **Tension–Resolution Rhythm** | Build tension continuously; release in discrete, earned bursts. | Rising stack = tension; line clear = punctuated, juiced release. | Separate a gradual tension **accumulator** from an instantaneous, juiced **resolution event**. |
| 5 | **Transparent State** | No hidden info about the present; uncertainty only about the future. | Whole field + active piece + next preview visible. | Make losses legible. Uncertainty comes **only** from the future draw. |
| 6 | **Skill Expression / Mastery Ceiling** | Trivial to enter, effectively impossible to exhaust. | 4 controls; NP-hard optimum + superhuman techniques (T-spins, rolling). | Fix the rule set; let depth **emerge** from mastery, never from added systems. |
| 7 | **Fairness (Legible Causality)** | Every loss attributable to a player decision, never the system cheating. | Transparent state + fixed rules (only speed scales). | Randomness in **inputs only**; adjudication deterministic & visible. |
| 8 | **Self-Scaling Difficulty** | Challenge tracks rising skill automatically, with one knob. | Fall speed ramps with level/lines. | Find the **one** parameter that is both reward signal and difficulty increase, player-driven. |

### How they interlock (the dependency graph)
- **Transparent State (5)** enables **Fairness (7)**.
- **Fairness (7)** lets **Perpetual Pressure (1)** + loss-aversion *motivate* instead of embitter.
- **Tractable Decisions (3)** under **Self-Scaling Difficulty (8)** hold the player in the **flow
  channel**, producing the **Tension–Resolution rhythm (4)**.
- **Order From Chaos (2)** supplies the fantasy; a fixed/complete rule set gives the **Mastery
  Ceiling (6)** room to emerge.
- Universality + snackability (the commercial outcome) are **downstream** of 5 + 3 (abstraction and
  self-teaching).

### The neuro-loop the pillars must produce (from dossier §3)
```
        ┌─────────────────── self-scaling speed (Pillar 8) ───────────────────┐
        ▼                                                                      │
  OPEN LOOP (Zeigarnik) ──► WANTING (dopamine, Berridge) ──► ACTION (skill) ───┤
  unfinished task piles    anticipation pulls you forward    tractable choice  │
        ▲                                                                      ▼
        └──── ESCALATE (stakes rise) ◄── RELIEF + PREDICTION-ERROR REWARD ◄── CLOSURE
                                          (Schultz; juiced release, Pillar 4)   (Pillar 2)
```
**Visuospatial saturation** (dossier §3.5) must be present throughout: the loop should fully occupy
spatial working memory so the rest of the mind goes quiet (the absorption / "flow" / craving-blocking
mechanism).

### Acceptance test for any prototype ("is it Tetris-shaped?")
A prototype passes if, **without falling tetrominoes or line clears**, it still:
1. has a threat that advances on its own clock (1),
2. turns a random/disordered stream into player-imposed order (2),
3. presents one obvious micro-decision at a time while the macro-problem is deep (3, 6),
4. accumulates tension gradually and releases it in juiced bursts (4),
5. hides nothing about the present and is provably-fair (5, 7),
6. accelerates via a single player-driven knob (8),
7. saturates visuospatial attention.
