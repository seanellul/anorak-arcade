# Wave 2 — The Juice Log

The mandate for Wave 2 was explicit: **go beyond** the game-feel of the first four prototypes. Juice
and reactivity are treated as a *primary dopamine channel* (dossier §3.6, prediction-error reward),
not a coat of paint. Each new game (`nova.html`, `surge.html`) got **6 dedicated feel cycles** after
its core loop was built and verified. This log records what each cycle added and *why* — so the
techniques transfer to future builds.

Both games share the arcade's `juice.js` toolkit (audio tones/chords, the particle/floater/ring/shake
FX layer, and the edge vignette) and extend it with per-game effects.

---

## NOVA — 6 cycles

Base (pre-juice): a working drop-and-merge physics basin — gravity, circle collision, equal-tier
fusion, overflow loss. Verified deterministically (`window.__nova`): equal tiers fuse to the next,
unequal tiers don't, 30 physics steps run cascades without error.

**Cycle 1 — Tactile physics.** The substrate is *alive*, so every contact must read physically.
Added impact-driven **squash** (vertical pop scales with collision/landing/wall-hit velocity),
**idle breathing** (resting motes scale ±1.3% on a per-mote phase so the basin gently shimmers
instead of sitting dead), and a **staged-mote ready-pulse** — the next mote fades + scales in over its
cooldown (alpha & scale driven by `dropPulse`) with a soft pitch cue, so you *feel* when you can drop
again. Drop emits a small burst + low tone + 8ms haptic.

**Cycle 2 — Fusion bloom.** Fusion is the core reward, so it over-delivers: a bright **flash core**
(radial white→tier-color gradient) punches at the merge point, an expanding **ring** (plus a second
white ring on combos), **implosion sparks** drawn inward then an outward **burst**, and the newborn
mote **pops in with overshoot** (scale eases 0.4 → ~1.18 → 1.0). The new mass **shoves its neighbours**
outward (physics impulse) so the whole pile reacts. Higher tiers add a sub-bass thump.

**Cycle 3 — Combo crescendo.** Chained fusions (within an 820ms window) escalate on every channel at
once: the **audio base pitch climbs** ~7%/step (a rising ladder) with an extra shimmer overtone, the
**floating score text grows** with combo and turns white past ×2, a **combo bar** drains under the HUD,
a **purple edge-tint** blooms at ×3+, and shake scales with the combo count. The combo is felt before
it's read.

**Cycle 4 — Pressure & danger.** Loss must be legible and *dreaded*. Over-rim masses get a pulsing red
**warning ring**; the **rim line reddens, thickens and pulses** as danger climbs; a red **edge vignette**
closes in; and a **heartbeat** (low sine double-thump) speeds up as you approach overflow — anxiety you
can hear.

**Cycle 5 — Supernova climax.** Reaching the top tier detonates the single biggest moment in the game,
so it gets the full kit: **time-dilation** (the whole sim eases to ~0.28× for ~0.55s, then ramps back),
a screen **white flash**, two **shockwave rings**, **radial star-streaks** firing outward, a 60-particle
eruption, a knock-back impulse on every surviving mass, a layered boom + ascending chord, and a
patterned haptic. It clears a wide blast radius — the juiced *pressure release* (Pillar 4).

**Cycle 6 — Cohesion & polish.** A twinkling **starfield** + bottom **nebula glow** give the basin depth
and a cosmic identity; a **PEAK** HUD readout and a one-shot **"NEW TIER"** banner mark progression
milestones; the score **odometer** eases toward its target; `prefers-reduced-motion` suppresses
time-dilation and heavy shake; haptics are tuned per tier. Everything additive uses `lighter` blending
so glows stack into bloom rather than flatten.

---

## SURGE — 6 cycles

Base (pre-juice): drifting charged orbs, a refilling charge meter, a flood-fill **chain** that hops
between orbs within `LINK` distance, super-linear chain scoring, and overflow loss. Verified
deterministically (`window.__surge`): a connected cluster fully chains, isolated orbs don't, an
uncharged tap is a no-op, and the field overloads at capacity.

**Cycle 1 — Lightning craft.** The arc *is* the game, so it got the most love. Each hop draws a
**jagged bolt** with a sine-tapered displacement, a **colored glow halo** (shadowBlur) under a
**white-hot core**, and a random **fork** branching off the midpoint — real lightning, not a line.
Bolts linger ~260ms (long enough to read the web of the chain as it rips through). Supercharged orbs
arc in gold.

**Cycle 2 — Chain crescendo.** As the chain propagates, a **live "×N CHAIN" counter** swells at the
detonation point (font scales with count, recolors cyan→gold→white at 10/20), the **per-pop pitch
climbs** a 4.5%/orb ladder, **shake accelerates**, and an **electric border-pulse** brightens with
chain length. You watch and *hear* the number climb in real time — the core thrill of the loaded
spring releasing.

**Cycle 3 — Eruption climax.** Big chains (≥8) fire a screen-wide **shock ring** and a particle
storm; ≥14 triggers **time-dilation** (sim eases to 0.3× then ramps back) so you savour the cascade;
a **white flash** scales with length, plus a layered chord + sub-bass boom and a patterned haptic. A
20+ chain is meant to feel like the screen tears open.

**Cycle 4 — Charge anticipation.** The "loaded spring" must be *felt* before release. The charge bar
glows when ready with a **READY ⚡** label; a soft **accelerating tick** speeds up through the last
quarter of the charge (rising anticipation); a **ready chime** snaps when full; and the field border
**pulses gold** while loaded. On mobile (no hover) a pulsing **⚡ TAP TO FIRE** hint appears.

**Cycle 5 — Field life & pressure.** Idle orbs **breathe** on individual phases; **supercharged**
orbs wear a pulsing double-ring telegraph (bigger reach, 2.2× value — a high-value target to herd
chains through). As the field fills, orbs **pulse faster and jitter** with nervous energy, colors warm,
a red **edge-pulse + vignette** closes in, and a **heartbeat** quickens — the overflow is dreaded
before it's read.

**Cycle 6 — Cohesion & polish.** A **nebula + drifting starfield** backdrop and a faint grid give the
arena depth; the **proximity-link web** (cyan lines between linkable orbs) is rendered with
distance-faded alpha so you can *read where a chain will flow* before you fire — turning the tap into a
legible spatial decision (Pillar 5). Score **odometer**, `prefers-reduced-motion` guard, tuned haptics,
and a clear **FIZZLE** cue when a detonation hits nothing (wasted charge — honest, legible failure).

---

## Techniques worth reusing (both games)

- **Time-dilation on the apex** — easing the whole sim to ~0.3× for the single biggest moment, then
  ramping back, makes a climax land harder than any particle count.
- **Over-deliver on every input** — squash, bloom, ring, pitch and a haptic on *every* fuse/pop, scaled
  up for rarer/bigger events, so the prediction-error reward (dossier §3.6) fires constantly.
- **Anticipation telegraphs** — staged-mote ready-pulse (NOVA), accelerating charge tick + ready chime
  (SURGE): the *wait* is juiced, not just the payoff.
- **Legible pressure** — a heartbeat that quickens, a reddening pulsing edge, nervous jitter: dread is a
  feeling delivered through audio + motion, not a number.
- **Read-ahead affordances** — NOVA's next-mote preview and SURGE's proximity-link web make the deep
  decision *visible* without removing its difficulty.
