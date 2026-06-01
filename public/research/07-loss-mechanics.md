# Loss Mechanics — giving each loop a real "you will lose" curve

## The diagnosis (why several prototypes were too easy to lose)

CINDER/SHIFT/CONDUIT/HOMEOSTAT/FLUX all have a genuinely *present* loss: an idle player overflows.
But playtesting flagged **NOVA, SURGE and CLEAVE** as nearly impossible to lose — you had to *wait* to
die. They share one structural flaw:

> **The field is 100% clearable and the clear is action-efficient.** One cut removes a whole vein, one
> fusion frees the basin, one detonation clears a cluster. A competent player removes more-per-action
> than the generator adds-per-second, so the field trends toward *empty* and the only loss state (fill
> the field) requires deliberately not playing.

Tetris never has this problem because of **one thing that never resets: speed.** You can clear lines
forever, but gravity only ratchets up, so your hands eventually lose. Every loop that feels
"un-losable" is missing that ingredient. The fix is one (ideally both) of:

1. **A one-way ratchet** — matter/pressure the core verb *cannot erase*, so even flawless play loses
   ground over time. This alone guarantees a loss curve.
2. **Non-resetting acceleration** — the self-scaling knob (Pillar 8) must be *monotonic and steep*, so
   the late game becomes physically unplayable regardless of skill.

Add a **greed trap** on top (the high-score line of play flirts with death) and the loop becomes an
*accelerating, anxious cycle* instead of a relaxed grind.

The acceptance test for any prototype going forward:

> Could a *perfect* player survive indefinitely? If yes, there is no loss curve — add a ratchet or a
> non-resetting accelerator until the answer is no.

---

## CLEAVE — shipped: **petrification** (a calcification ratchet)

Implemented in `public/cleave.html`. The mechanism:

- Every cell carries an `age`. If it isn't harvested within `petrifyTime()`, it **calcifies into grey
  stone**: uncuttable, colorless, excluded from all veins (so the core verb can no longer remove it).
- Stone is dead weight that settles and stacks like any cell, pushing the chamber toward the ceiling.
- The **only** way to remove stone is to shatter a *living vein orthogonally adjacent* to it — the
  shatter "knocks loose" touching stone (crumble FX + rubble SFX). So stone is *manageable* but only
  reactively, and clusters that drift away from any cuttable vein become permanent.
- `petrifyTime()` **shrinks as score rises** (`PET_START 8.5s → PET_MIN 3.2s`), which is the
  non-resetting accelerator: the better you do, the faster the crystal calcifies.
- **Bedrock (the permanent floor):** stone that survives ~4.2 s *as stone* hardens into **bedrock** that
  knock-loose can no longer remove. This is what makes the ratchet bite even strong play — neglect
  compounds, so a momentary lapse leaves a permanent scar and the board only ever gets tighter.
  (Validated: with bedrock, a good autoplayer that previously held the board at 0 stone now ends a run
  with permanent bedrock accumulating; a casual one gets buried.)
- **Greed trap, for free:** a big vein you're nursing for the n² payoff ages from its oldest cells
  first — wait too long and its core petrifies, shrinking the harvestable part *and* adding stone.
- **Telegraph (fairness, Pillar 5/7):** cells crack and grey-wash over the last ~35% of their life, so
  calcification is always foreseeable and every loss is attributable to a shard you left too long.

Result (validated with headless autoplayers): even near-optimal play now accrues unreachable stone and
**eventually loses**; the loop becomes "keep the crystal turning over or it buries you."

---

## NOVA — shipped: **strict rim + sediment fossilization**

NOVA originally had effectively no loss (the rim/overflow grace was too lenient and the basin self-empties
as you fuse). Two additions, now live in `nova.html`, give it a real curve — both in the spirit of the
Suika genre's true tension:

**1. A strict, *descending* rim (the real accelerator).**
- First made the rim strict (a settled mass over the line ~1.2 s ends the run, recovery slower than the
  threat builds). But validation exposed the deeper truth: NOVA's basin *self-empties* — fusion clears
  small motes faster than any drop cadence adds them, so even sloppy autoplay kept `danger` at **0** and
  the rim never engaged. An age-based ratchet can't bite a field that never persists.
- The fix is a **rim that creeps down over time** (`RIM_PER_SEC ≈ 2 px/s`, capped at `RIM_MAX ≈ 290 px`),
  with the lost zone shaded so the squeeze is legible. This is the Tetris-speed equivalent: a monotonic
  pressure *independent of field occupancy*, so however well you fuse, your working space shrinks until
  the basin tops out. **This is what actually guarantees the loss curve.** The sediment below is the
  second jaw of the vice.

**2. Sediment fossilization (the ratchet).**
- The smallest tier(s) of mote, if they sit **un-fused for ~8–10 s**, **fossilize**: they sink to the
  basin floor and turn into immovable grey **sediment** that no longer fuses and can't be cleared by a
  normal fusion.
- Sediment raises the effective floor — the basin gets *shallower* over the run, so the same number of
  motes overflows sooner. This is the one-way ratchet: fusion can't remove sediment.
- **Only a NOVA detonation** (reaching the top tier) clears sediment in its blast radius — so the big
  payoff doubles as the *only* pressure-relief valve, a strong risk/reward spine.
- Fossilization timer shrinks with score (accelerator). Telegraph: small motes darken/calcify visibly
  before they fossilize.
- **Greed trap:** hoarding small motes to set up a big cascade risks them fossilizing into floor.

Net loop: "fuse upward fast enough to outrun the rising sediment floor, and bank NOVAs to dig back
down." A perfect player can no longer hold equilibrium forever.

## SURGE — shipped: **permanent drift ramp + inert husks**

SURGE's chain cleared too much and the drift was too gentle, so the field self-emptied. Two additions,
now live in `surge.html`:

**1. A burnout clock + ratcheting spawn (the real accelerator).**
- A monotonic spawn-rate ramp alone wasn't enough: SURGE *also* self-empties (a single ×30 chain wipes
  the board), so even sloppy autoplay surfed it for 160 s with the field near-empty and husks barely
  forming. So the guaranteeing squeeze is a **burnout clock**: any orb left un-popped past a *tightening*
  window (`HUSK_AGE 8.2 s → 4.4 s` as you score) **burns out into a husk on its own**, flickering grey
  first as a telegraph. This is field-independent — the orbs that always linger at the fringe of your
  chains now rot into chain-blocking husks regardless of how the field empties, and it doubles as a
  *skill element*: it bounds "wait for density" into "herd, then fire **before** it burns." The spawn/charge
  ramp (`spawnEvery → 300 ms`, never reset) rides on top.

**2. Inert husks from incomplete chains (the ratchet).** *(Implemented exactly as below.)*
- Every chain **scorches its fringe**: live orbs that sat within ~`LINK·1.35` of a popped orb but were
  *not* themselves caught get a `missed++`. After `HUSK_N` (3) such grazings an orb **burns out into an
  inert husk** — a dead, uncharged grey rock that still occupies space (counts toward `CAP`) and, crucially,
  **blocks chains**: detonation seeding and chain propagation both skip husks, so a husk breaks the link
  path through it.
- Husks crowd the field one-way and *fragment* future chains (they break link paths), so sloppy,
  poorly-aimed detonations make the board progressively harder — punishing spray-and-pray, rewarding
  detonations placed to catch *everything*.
- **Only a long chain** (`HUSK_CLEAR_MIN` = ×6) vaporizes the husks it sweeps past (within ~`LINK·1.25`
  of a popped orb) — the skill reward that claws back space, and the reason husks spiral once your chains
  shorten. Verified: a husk blocks a chain dead, and a ×8 chain clears an adjacent husk.

Net loop: "place each detonation to chain *everything*, because every orb you leave behind calcifies the
board and the drift never slows."

---

## A reusable recipe

For any "imposing order" loop that self-empties, add:

1. **One un-clearable accumulator** fed by *time* or *imperfection* (stone / sediment / husks). The
   core verb must not remove it; a *secondary, harder* action (the big payoff) is the only relief.
2. **A monotonic accelerator** — one knob (a shrinking timer or a rising rate) that only ever tightens.
3. **A telegraph** on both, so every death is foreseeable and fair (Pillars 5 & 7).
4. **A greed trap** that falls out of (1): the high-score play is exactly the one that risks feeding the
   accumulator.

This converts a relaxed "clear at leisure" grind into an accelerating tension→resolution cycle with a
death the player can see coming — the Tetris feeling, rebuilt with a different verb each time.

### One hard-won caveat (from validating these)

An **age- or neglect-based ratchet only engages if the field persists.** CLEAVE's crystal sits in place,
so cells reliably age into stone — the ratchet bites. But NOVA's basin and SURGE's field *self-empty*
(fusion / chains clear faster than the generator fills), so nothing sits around to calcify — sediment and
husks barely formed even under sloppy autoplay. For a self-emptying field you **must** add a
*field-independent* monotonic squeeze — a **descending rim** (NOVA) or an ever-rising drift/spawn rate —
that tightens on a clock regardless of how empty the board is. The neglect-ratchet then becomes the
flavour (it punishes specific sloppiness), while the clock-squeeze is what guarantees everyone eventually
loses. Verify with an autoplayer: if a *near-optimal* bot survives forever, your only real lever is the
clock, not the accumulator.
