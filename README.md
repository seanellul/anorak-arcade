# The Tetris Lab — research → 4 playable prototypes

A deep study of *why Tetris works* — history, mechanics, neuroscience, and game theory — distilled
into **8 design pillars**, then rebuilt as **4 playable prototypes** that capture the same
psychology with **four different core verbs** and **no falling tetrominoes or line clears**.

## Repo layout

```
public/        ← the deployable static site (Cloudflare Pages output dir)
  index.html     launcher + live playtime panel
  cinder.html  strata.html  conduit.html  homeostat.html
  stats.js       shared playtime tracker (localStorage)
research/      ← the research dossier (source of truth; linked from the launcher)
api/           ← (planned) Cloudflare Worker + D1 leaderboard / data API
```

## Play locally

```bash
cd public && python3 -m http.server 8753
# open http://localhost:8753/
```

Or open `public/index.html` directly in a browser. Click once in any game to enable sound.

## Deploy (Cloudflare Pages)

The static site is `public/`. With a Cloudflare account:

```bash
# one-time auth (either):
npx wrangler login                 # interactive OAuth
# …or set a scoped token for CI/non-interactive:
export CLOUDFLARE_API_TOKEN=...     # Pages:Edit
export CLOUDFLARE_ACCOUNT_ID=...

npx wrangler pages deploy public --project-name re-imagine-tetris
```

Or connect the GitHub repo in the Cloudflare dashboard (Pages → Connect to Git → output dir `public`)
for auto-deploy on every push.

## The four prototypes (`public/`)

| Game | Verb | One line | Leans hardest on |
|------|------|----------|------------------|
| **CINDER** `cinder.html` | **enclose** | Wall a spreading fire into sealed pockets to suffocate it | order-from-chaos · risk/reward release |
| **STRATA** `strata.html` | **shift** | Slide rising rock layers to align mineral veins and cascade them | perpetual pressure · order-from-chaos |
| **CONDUIT** `conduit.html` | **rotate** | Rotate nodes to channel a rhythmic pulse to its sink before overload | tension→resolution rhythm · self-scaling |
| **HOMEOSTAT** `homeostat.html` | **allocate** | One feed stream, many draining reactors — keep each in its flow band | perpetual pressure · loss-aversion |

Each shares the Tetris loop — **open loops faster than they close, under one self-scaling pressure,
with transparent state and skill-contingent release** — but tests a different relationship to
"imposing order": build vs. rearrange vs. route vs. balance, and spatial vs. clock-based pressure.

## Playtime tracker

A shared `public/stats.js` records how long each game is actively played (per-frame ping while
in active play, not paused/dead) to `localStorage`. The launcher (`index.html`) shows a live
**PLAYTIME** panel — time + session count per game, with a reset button. Serve over http (below) so
all pages share one origin.

## The research (`research/`)

1. **`01-tetris-dossier.md`** — history & story, mechanics & design, neuroscience (Stickgold,
   Holmes/Oxford PTSD, Skorka-Brown cravings, Haier PET, Zeigarnik, Berridge wanting-vs-liking,
   flow), and the product/game-theory case (incl. NP-completeness). Evidence-graded, cited, with
   marketing/disputed claims flagged.
2. **`02-design-pillars.md`** — the 8 transferable pillars as a buildable spec + the neuro-loop
   diagram + a "is it Tetris-shaped?" acceptance test.
3. **`03-prototype-rationale.md`** — how each of the 4 builds maps back to the research.

## How these were validated

Every prototype's core algorithm was tested deterministically in-browser (Playwright), not just
eyeballed:
- **CINDER** — a sealed ember cluster captures & clears; an un-enclosed ember does not.
- **STRATA** — a 3-run clears, a 2-run does not, multi-group clears score correctly.
- **CONDUIT** — a complete source→sink path delivers; a broken one fails; restoring re-delivers.
- **HOMEOSTAT** — dies unattended in ~5s (real pressure) yet survives & scores with competent play;
  drain ramp guarantees eventual loss.

Each game exposes a small `window.__<name>` debug hook used by those tests; it's inert during normal
play.

## Next step

These are **feel tests**. Play each ~2 minutes and judge which tension→resolution "snap" lands
hardest — the enclosure *pop*, the cascade *chain*, the delivery *pulse*, or the recovery *save*.
That winner is the loop to deepen into a full game.
