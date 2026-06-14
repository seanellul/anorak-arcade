# Wave 5 Foundation — shared conventions for the four high-score prototypes

> Read this **first**, before any individual game spec. Everything the four new prototypes
> (INTERCEPT, DESCENT, SORTIE, CIRCUIT) share lives here: the new daily-seed RNG, the standard
> single-file prototype skeleton, the iOS-first control contract, the haptics vocabulary, and the
> exact 5 touchpoints to register a game. The game docs reference this file rather than repeat it.

---

## 1. Daily seed + deterministic RNG (`public/seed.js`)

> **Status: `public/seed.js` now EXISTS** — it was created with the first Wave 5 game (INTERCEPT,
> 2026-06-14). Subsequent games just include it; don't recreate it. The reference implementation
> below documents what's in the file (it also adds `AASeed.free(game)` and `AASeed.uuid()` helpers).

Before Wave 5 there was no deterministic RNG — all earlier prototypes use raw `Math.random()`. These
games are designed around "everyone plays today's board, leaderboard resets daily," which turns a
one-time all-time score wall into a fresh daily rivalry. Include `seed.js` **before** the game's
`<script>`:

```js
// public/seed.js — deterministic RNG + daily seed. window.AASeed
(function () {
  function xmur3(str){ // string -> 32-bit seed generator
    let h = 1779033703 ^ str.length;
    for (let i=0;i<str.length;i++){ h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h<<13 | h>>>19; }
    return function(){ h = Math.imul(h ^ h>>>16, 2246822507); h = Math.imul(h ^ h>>>13, 3266489909); return (h ^= h>>>16) >>> 0; };
  }
  function mulberry32(a){ return function(){ a|=0; a = a+0x6D2B79F5|0; let t = Math.imul(a^a>>>15, 1|a); t = t+Math.imul(t^t>>>7, 61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function rngFrom(seedStr){
    const s = xmur3(String(seedStr));
    const r = mulberry32(s());
    r.range = (lo,hi) => lo + (hi-lo)*r();
    r.int   = (lo,hi) => Math.floor(r.range(lo, hi+1));   // inclusive both ends
    r.pick  = a => a[Math.floor(r()*a.length)];
    r.chance = p => r() < p;
    r.seedStr = String(seedStr);
    return r;
  }
  function dailyKey(){
    const d = new Date();
    return d.getUTCFullYear() + '-' +
           String(d.getUTCMonth()+1).padStart(2,'0') + '-' +
           String(d.getUTCDate()).padStart(2,'0');
  }
  window.AASeed = { rngFrom, dailyKey, daily(game){ return rngFrom(game + '|' + dailyKey()); } };
})();
```

### Two run modes per game (Daily / Free toggle on the title overlay)

- **Daily** — `const rng = AASeed.daily('INTERCEPT')`. Everyone gets the same board today; this is the
  **ranked** attempt. Pass the seed key (`rng.seedStr`) along when submitting so a future daily
  leaderboard can scope it.
- **Free play** — `const rng = AASeed.rngFrom(crypto.randomUUID())`. Practice / endless; still submits
  to the all-time board.

### Determinism rule

**All gameplay randomness** — spawn times, positions, type mixes, pickup order, dive paths — must
draw from `rng`, never `Math.random()`. Cosmetic-only jitter (particle velocities, screen-shake
offsets) may use `Math.random()` since it can't change the outcome or the score.

### Leaderboard determinism (downstream dependency — NOT in a single game's build)

`stats.js` already attaches a `seed` field to a signed score. The **daily-scoped leaderboard view +
daily reset** is not built yet and belongs to the social/competitive overhaul:

- Worker: a `GET /api/leaderboard?seed=<key>` scope, and a board that resets per `dailyKey()`.

Each game spec references this as a downstream dependency. A game ships fully functional submitting to
the existing all-time board; the daily board is layered on later without touching the games.

---

## 2. Standard prototype skeleton

Every Anorak prototype is a **single `public/<slug>.html`** — inline `<style>`, a `<canvas id="c">`,
a DOM HUD + overlays, one IIFE holding all game code. Match this shape.

- **Canvas sizing:** logical `W/H` mobile-portrait (~`390×680`); `dpr`-aware backing store
  (`cv.width = W*dpr; cv.height = H*dpr; ctx.scale(dpr,dpr)`); `cabinet.js` upscales the displayed
  canvas up to ~1.6× on desktop.
- **Loop** (frame-rate independent via `dt`):
  ```js
  let state='title', last=0;
  function loop(now){
    const dt = Math.min(48, now - last); last = now;   // clamp tab-switch spikes
    if (state==='play'){ window.GameStats && GameStats.ping('ID', dt); update(dt/16.7); }
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  ```
- **State machine:** `title → play ↔ paused → dead`. `reset(showTitle)` re-inits all state.
- **Overlays:** `#title`, `#over`, `#paused` divs toggled `display:flex/none`.
- **Pause:** the native shell injects a floating pause button that dispatches a `'p'` keydown — listen
  for it, don't build your own button:
  ```js
  window.addEventListener('keydown', e => { if (e.key.toLowerCase()==='p') togglePause(); });
  window.addEventListener('blur', () => { if (state==='play') togglePause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state==='play') togglePause(); });
  ```

### Shared scripts to include (order matters)

**Current Wave-5 convention (use this):** the worked example `public/intercept.html` follows the
NOVA/PULSE pattern — a plain `<body>` (no `data-game`), `juice.js` for audio + FX, a **self-contained
HUD**, and **no `cabinet.js`**. Only the 4 Wave-1 games use the cabinet chrome.

```html
<!-- … game markup with its own HUD … -->
<script src="seed.js"></script>     <!-- window.AASeed (already exists) -->
<script src="juice.js"></script>    <!-- window.Juice: audio + particle/float/ring/shake FX -->
<script src="stats.js"></script>    <!-- window.GameStats: client id, name modal, score sign + /api/sync -->
<script> /* game IIFE */ </script>
```

`feel.js` (`window.Feel` haptics) and `native-app.js` are **auto-injected on iOS** by the native
shell and are **no-ops on web** — never include them yourself; call `Feel.*` defensively
(`window.Feel && Feel.commit()`). A `navigator.vibrate` fallback for Android web must be **gated
behind a real user gesture** or Chrome logs a console error (see `intercept.html`'s `gestured` flag).

> **If you instead opt into `cabinet.js`** (top bar + web leaderboard drawer, like the Wave-1 games):
> set `<body data-game="ID">` **and** add `ID:'#accent'` to the `COLORS` map at the top of
> `public/cabinet.js` — a **6th touchpoint** that only applies to cabinet-style games. The Wave-5
> self-contained style above avoids it.

---

## 3. iOS-first control contract (every Wave 5 game obeys)

The primary target is the iOS app. The native shell already paves the hard parts; obey the contract
and a game inherits correct touch behavior for free.

- **Single pointer only.** No keyboard requirement, no multi-touch, no two-thumb layouts. Mouse on
  desktop is the same single-pointer gesture.
- **Canvas CSS:** `touch-action:none; -webkit-user-select:none; user-select:none;`.
- **Touch handlers** use `{passive:false}` + `e.preventDefault()` on `touchstart`/`touchmove`. Shared
  coordinate helper (handles touch + mouse, maps to logical space):
  ```js
  function P(e){
    const r = cv.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x:(t.clientX - r.left) * (W / r.width), y:(t.clientY - r.top) * (H / r.height) };
  }
  ```
- **Don't** pad for the notch (safe-area padding is auto-injected) and **don't** build a back or pause
  button (auto). Reserve top-right HUD space for the injected pause button — the `aa-game` CSS already
  adds `padding-right` for it.
- **Scroll-lock is automatic.** Any page without `site.css` is tagged `html.aa-game` →
  `overflow:hidden; overscroll-behavior:none`, so the canvas owns all touch (no rubber-band, no
  pull-to-refresh).
- **Primary gesture per game** (each one comfortable one-handed):
  | Game | Gesture |
  |---|---|
  | INTERCEPT | **tap-to-point** — each tap launches an interceptor toward `P(e)` |
  | DESCENT | **tap-to-act** — tap anywhere flips wall |
  | SORTIE | **drag-to-position** — ship x follows finger x; auto-fire |
  | CIRCUIT | **steer-toward-touch** — head turns toward finger at a capped rate |

---

## 4. Haptics vocabulary (`window.Feel`, no-op on web)

| Call | Meaning |
|---|---|
| `Feel.tap()` | light browse-y press |
| `Feel.select()` | focus / move |
| `Feel.commit()` | an act with consequence |
| `Feel.heavy()` | a big beat |
| `Feel.success()` | new best / wave clear |
| `Feel.warn()` | danger |
| `Feel.fail()` | run over |

**Rule:** never fire a haptic every frame — only on discrete, meaningful events. Per-game mapping
lives in each game doc. Always guard: `window.Feel && Feel.commit()`.

---

## 5. The 5 touchpoints to register a prototype

No DB migration is needed — `game` is a free-text column. To add one game (example: `INTERCEPT`):

**1. `public/catalog.json`** — add a game entry:
```json
{
  "id": "INTERCEPT", "slug": "intercept", "title": "INTERCEPT", "verb": "TRIAGE",
  "tag": "triage · tap to intercept",
  "blurb": "Threats rain down toward your sites. Finite interceptors, more targets than you can save — tap to detonate a blast and choose what lives.",
  "accent": "#ff4747",
  "type": "prototype", "wave": 5, "featured": false,
  "platforms": ["mobile", "desktop"], "controls": ["touch", "mouse"],
  "entry": "intercept.html",
  "bundle": { "version": "1.0.0", "url": "/bundles/intercept-1.0.0.zip", "bytes": 0, "sha256": "" }
}
```

**2. `public/index.html`** — add a hand-authored card to the prototypes grid:
```html
<a class="card v2 reveal" href="intercept.html" style="--c:#ff4747">
  <span class="demo"><canvas data-demo="intercept"></canvas><span class="verb">TRIAGE</span><span class="fade"></span><span class="play">PLAY ↗</span></span>
  <div class="body">
    <h2>INTERCEPT</h2>
    <div class="tag">triage · tap to intercept</div>
    <p>Threats rain down toward your sites. Finite interceptors, more targets than you can save — tap to detonate a blast and choose what lives.</p>
    <div class="pill">finite-resource triage · multi-kill timing</div>
  </div>
</a>
```
(The `data-demo` mini-canvas is optional; a build chat can skip the home-page demo animation and just
omit the `<canvas data-demo>` or leave it static.)

**3. `public/stats.js`** — one edit: add `'INTERCEPT'` to the `GAMES` array (line ~16). That array is
the client-side allowlist used for sync/aggregation; it's the only stats.js change. *(There is no
per-game color or order map in stats.js — accent comes from `catalog.json` `accent` + the `index.html`
card's `--c`, so no separate color registration is needed.)*

**4. `api/worker.js`** — add `'INTERCEPT'` to the `GAMES` allowlist constant (gates `/api/sync`,
`/api/session/start`, leaderboard aggregation, and the nightly rank-snapshot cron).

**5. `public/<slug>.html`** — the game file itself, following the skeleton above. `public/seed.js`
already exists (created with INTERCEPT) — just include it. **Worked reference: `public/intercept.html`.**

### Wave 5 registration table

| ID | slug | verb | tag | accent | atom |
|---|---|---|---|---|---|
| INTERCEPT | intercept | TRIAGE | `triage · tap to intercept` | `#ff4747` | Missile Command |
| DESCENT | descent | FREEFALL | `freefall · tap to flip` | `#b15cff` | Canabalt / Gravity Guy |
| SORTIE | sortie | FORMATION | `formation · slide & break` | `#ff9d3d` | Galaga |
| CIRCUIT | circuit | CIRCUIT | `circuit · grow & graze` | `#2fe0b0` | Snake × Tron |

> **Accents are provisional.** Wave 5's palette is crowded against the existing 12 hues and the dark
> `#0a0e14` background — recolor freely; just keep all four distinct from each other and from
> neighbours (PULSE `#ff2e4d`, CINDER `#ff6a3d`, CONDUIT `#b98cff`, CLEAVE `#3fe0c2`).
