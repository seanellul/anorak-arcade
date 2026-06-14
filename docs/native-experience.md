# Anorak Arcade — Native Experience Philosophy

> The web app is a *gallery* — you browse prototypes. The app is a *pocket arcade*: pick it up,
> play a 60-second game, climb the board, drag your friends in. Everything below exists to make
> that loop feel **tactile, instant, alive, social, and forgiving** — and to stop the app ever
> feeling like a website in a frame.

These are the five pillars. The 10 features are each a pillar made concrete — a design *philosophy*
with a build, not a one-off tweak. Research backing is cited inline; sources at the end.

| Pillar | Promise |
|---|---|
| **Tactile** | Every meaningful input has a physical correlate (touch + motion + sound). |
| **Instant** | No dead air. The next thing is already there before you finish the gesture. |
| **Alive** | The app moves, breathes, and reacts; it has a place and a personality. |
| **Social** | You're always playing *against people*, and bragging/inviting is one tap. |
| **Forgiving** | You're never trapped, surprised, or punished by the UI. |

Two global accessibility controls cut across everything: a **Feel level** (Full / Subtle / Off) and
honoring the OS **Reduce Motion / Dynamic Type / Dark Mode**. Juice and haptics must be opt-out
(research is unanimous: the user owns whether feedback fires).

---

## TACTILE

### 1. The Feel Layer — haptics as a first language
**Principle.** Touch is the app's second output channel. A *small, consistent* haptic vocabulary
confirms actions and builds muscle memory; randomness or constant buzzing reads as cheap.

**Why.** Best practice is a central wrapper exposing a tiny vocabulary, harmonized with visuals +
audio, with mandatory user control — not ad-hoc `vibrate()` calls scattered around.

**Execution.** `public/feel.js` — one global (`Feel`) over `@capacitor/haptics`, no-op on web:
- `Feel.select()` — tab/card focus, menu open (selection tick)
- `Feel.tap()` / `Feel.commit()` — light vs. medium impact for browse vs. act (place a wall, drop a mote)
- `Feel.success()` — new best / sealed pocket (notification-success)
- `Feel.warn()` / `Feel.fail()` — danger / game-over
- gated by `aa.haptics` setting + Reduce Motion; routed through each game's existing `Juice` so
  taps, sound, and haptics fire as one event. **This is the single biggest "native, not web" signal.**

### 10. The Juice System — tuned game-feel, globally consistent
**Principle.** Maximize *feedback per input*, then tune back. A tap should bloom: number-pop, flash,
squash, a particle, a sound, a haptic — as one beat.

**Why.** Juice is how players understand consequence; screenshake should be 50–300ms with an easing
decay, micro-animations (squash & stretch, hit-flash) are cheap and huge — but over-juicing buries
the mechanics, so it must be tunable.

**Execution.** Promote the per-game `juice.js` into a shared **feedback bus**: standardized score-pop,
combo escalation (visual + audio + haptic ramp), decaying screenshake, hit-flash, and a record
**confetti + success-haptic** celebration. One **Feel level** setting scales all of it (Full / Subtle / Off).

---

## INSTANT

### 2. Spatial navigation — the shared-element game launch
**Principle.** You don't "open a page," you *move through space*. Tapping a game expands its card
(accent + title) into the game itself; back collapses it. Continuity = you always know where you are.

**Why.** Native transitions should be <300ms at 60fps; spatial continuity is what separates an app
from a stack of reloading documents. (It also kills the black flash we hit when a game boots.)

**Execution.** A transition layer using the **View Transitions API** (WebKit-supported) with a FLIP
fallback: the card's accent color and name bridge into the game's header. Push/pop, not navigate.

### 3. Zero-dead-air loading — the accent canvas
**Principle.** Never show a black or white frame. The app is always *mid-thought*.

**Why.** Doherty threshold: keep perceived response <400ms; a **skeleton in the game's own accent**
(logo pulse + game name) reads as instant where a spinner or blank reads as broken. We literally saw
black flashes during boot — this is the cure.

**Execution.** A branded launch screen matching the home background; on game open, paint the game's
shell (HUD chrome + accent skeleton) *before* the canvas initializes; prefetch the catalog and warm
the most-likely-next game.

---

## ALIVE

### 4. The pocket-arcade home — a living hub + bottom tab bar
**Principle.** The home is a *destination*, not a menu. Reachable by thumb, personal, and in motion.

**Why.** A bottom tab bar is the native idiom for top-level nav (thumb zone); the web's top nav is the
giveaway that it's a website. A hub that surfaces "what's next for *you*" drives the play loop.

**Execution.** Native-only bottom tab bar — **Play · Board · Friends · You**. Home becomes a hub:
*Continue*, *Daily challenge*, *Your rank this week*, a featured rotation with ambient parallax, and
recently-played — all in the neon-on-dark Anorak aesthetic.

### 5. Player identity — the trophy room (You)
**Principle.** The player is the protagonist. Progress is always visible and quietly celebrated.

**Why.** Identity + visible progression is the retention spine of a casual-competitive game; it gives
the leaderboard and invites something to attach to.

**Execution.** Sign in with Apple → a profile (built API: `/api/me`): a **generative avatar** from the
handle, total play time, games played, medals/badges, and per-game bests & ranks. A celebratory
"new medal" moment when milestones unlock.

---

## SOCIAL

### 6. Rivalry, not a spreadsheet — the social leaderboard
**Principle.** Competition is *personal*. A static table is data; "you're 180 behind Maya" is a goal.

**Why.** Relative, person-framed standing converts a number into motivation; presence + rank-up
moments are what make boards sticky.

**Execution.** Reframe the board around the player: "**#4 — 180 to pass Maya**", a rank-up animation
when you climb, **ghost targets in-game** ("beat Sam: 12,400"), and **weekly seasons** that reset so
everyone gets a fresh shot. Backs onto the friends model (new) + existing leaderboard API.

### 7. One-tap brag — share & invite as the growth loop
**Principle.** Sharing is a *brag*, not a chore; inviting a friend is the most valuable tap in the app.

**Why.** Frictionless, beautiful sharing is organic growth; it must be one tap and on-brand, with
links that drop the recipient *exactly* where you were.

**Execution.** Native share sheet (`@capacitor/share`) with an **auto-generated score card** (reuse the
existing OG-image pipeline), **universal links** that open the precise game/challenge, and "invite a
friend → both get a cosmetic perk." Invited friends appear on your boards (closes the social loop with #6).

### 8. Daily challenge & streaks — a gentle reason to return
**Principle.** One low-pressure ritual a day. Showing up is rewarded; missing a day isn't punished harshly.

**Why.** A shared daily seed makes fair head-to-head with friends; streaks drive habit — but stress-free
means gentle, opt-in nudges, never nags.

**Execution.** One **seeded** run/day on a rotating game (challenges API, scaffolded), a streak counter,
and an **opt-in** local notification. Same seed across all players = a daily, fair rivalry.

---

## FORGIVING

### 9. The forgiveness layer — stress-free guarantees
**Principle.** The UI never traps, surprises, or punishes you for a mis-tap.

**Why.** Perceived control and safety are the baseline of a stress-free experience; dead-ends and
accidental losses are what make an app feel clunky and amateurish.

**Execution.** Pause-anywhere, swipe-back everywhere, **no accidental mid-run exits** (confirm only
when you'd actually lose a run), undo where it's cheap, ≥44pt tap targets, and full honoring of
**Reduce Motion / Dynamic Type / Dark Mode**. Every screen has an obvious way back.

---

## Suggested build order

1. **#1 Feel Layer** + **#10 Juice System** — foundational; everything rides the same feedback bus. *(starting now)*
2. **#3 Zero-dead-air** + **#2 Spatial nav** — the two biggest "it's an app" perception wins.
3. **#4 Tab-bar hub** + **#5 Profile** — the structural shell + identity.
4. **#6 Social board** + **#7 Share/invite** + **#8 Daily** — the brand loop (needs the auth/friends backend).
5. **#9 Forgiveness** — woven throughout, audited at the end.

## Sources
- Saropa, *2025 Guide to Haptics* — https://saropa.com/articles/2025-guide-to-haptics-enhancing-mobile-ux-with-tactile-feedback
- UX Pilot, *Designing for Haptic Feedback* — https://uxpilot.ai/blogs/enhancing-haptic-feedback-user-interactions
- More Mountains, *Feel* (game-feel system) — https://feel.moremountains.com/
- *Juice It: Adding Camera Shake* — https://gt3000.medium.com/juice-it-adding-camera-shake-to-your-game-e63e1a16f0a6
- LogRocket, *Doherty Threshold* — https://blog.logrocket.com/ux-design/designing-instant-feedback-doherty-threshold/
- NextNative, *Mobile App UI Design Best Practices 2025* — https://nextnative.dev/blog/mobile-app-ui-design-best-practices
