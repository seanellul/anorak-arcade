# Arcade App — Phase 3: over-the-air game downloads  **(DEFERRED)**

> **STATUS (2026-06-17): DEFERRED. The launch model is _bundle-first offline_, not OTA download.**
> The whole arcade (`public/`) already ships inside the app binary (`webDir: ../public`, **no
> `server.url`**), so all 13 games + assets play **offline, on first launch, with no login**. That is
> the best possible offline UX and it is the "play everything on a plane" promise — already true today.
>
> The over-the-air download pipeline described below (download zip → verify sha256 → fflate unzip →
> run from Filesystem) was scoped to solve a *different* problem: shipping **new games between app
> builds** with no rebuild. That is **orthogonal to offline play**, it is iOS-flavored, and it is
> unbuilt — so there is **zero sunk cost** in deferring it. Pick it up only when the release cadence
> makes per-game app rebuilds genuinely painful. Until then, new games arrive with the next app build.
>
> See [`arcade-app.md`](arcade-app.md) → "Offline model (bundle-first)" and "Platform strategy".

## Why this was deferred (the decision)

A real tester wanted to play the whole arcade on a flight. Walking the options for "works on a plane":

| Model | Offline on first launch? | Pre-download needed? | Complexity | Cross-platform |
|---|---|---|---|---|
| **Bundle-in-app (chosen)** | ✅ yes, zero action | no | trivial (already done) | yes (same on Android) |
| OTA zip download (this doc) | ❌ only after downloading each game | yes, before boarding | high (build tool, unzip, sha256, registry, eviction) | fflate is portable, rest is bespoke |
| Pure server-load (`server.url`) | ❌ never offline | n/a | low | yes, but no offline |

Bundling wins decisively for the plane scenario. OTA's only advantage is "new games without a rebuild,"
which isn't a launch need. So: **bundle now, OTA later (maybe).**

## Trust model (decided alongside — applies regardless of delivery)

Offline play raises a real long-term question: how do offline runs affect leaderboard trust? The answer
is to **bifurcate**, which also matches the product value "never gate *play* behind a login":

- **Casual / offline / personal tier** — frictionless, login-free, plays on a plane. Personal bests
  live on-device. Treat these as lenient; defend only against the casual cheater (sane score bounds,
  server-side outlier rejection). A determined cheater can forge scores in *any* client-side web game,
  online or offline — offline doesn't change the threat in kind.
- **Global / competitive / money tier** — gated **online + authenticated + server-authoritative**.
  The board name comes from the account handle (never client-supplied); anonymous/offline submits
  return `{saved:false}`. This is where integrity is enforced (see
  [`score-integrity.md`](score-integrity.md), the login-to-save model). Requiring sign-in *here* is a
  fair trade — the user is opting into competing for a record — unlike gating basic play.

> Principle: **login + strict integrity are the price of competing for glory/money — never the price
> of playing.** Server replay re-simulation for the competitive tier remains a later hardening step.

---

# Reference design (for IF/WHEN OTA is picked up)

Everything below is the original, still-valid engineering design for over-the-air delivery. It is kept
as the implementation reference for the deferred phase — not current work.

> **Goal (when revived):** ship a new game by pushing to Cloudflare and have it appear in the
> **installed** app with no `cap sync`, no rebuild, no App Store review — the way the web arcade
> already works. This is the "downloaded content, run in a WebView" model that App Store Review
> **Guideline 4.7** permits. (Android: the same model via a portable unzip — fflate works there too.)

## Current launch path (the two interception points)

```
native home (native-app.js, renders from fetch('/catalog.json'))
   └─ tap card → location.href = 'game.html?id=<ID>'              # native-app.js
        └─ game.html resolves the catalog entry
             └─ ▶ PLAY button → href = g.entry  (e.g. intercept.html)
                  └─ the bundled game HTML loads
```

`entryHref(g)` (`native-app.js`) and `game.html`'s PLAY `href` are the **two interception points**:
to add OTA, instead of pointing at a bundled relative path they resolve to a *runnable URL* that may
be a downloaded copy on the Filesystem. Under the current bundle-first model these simply return the
bundled relative path — no change needed.

## Key facts in the codebase (verified 2026-06-17)

- **`catalog.json` is already shaped for this:** every game has `bundle: { version, url, bytes, sha256 }`
  (currently `bytes:0, sha256:""`, and `/bundles/` doesn't exist). `catalogVersion` + `minAppVersion`
  exist at the top. These fields are **dormant** under bundle-first delivery.
- **`@capacitor/filesystem` is installed** (`mobile/package.json`) but **unused in web JS** — only
  `Capacitor.Plugins.Keyboard` is referenced. OTA would be its first use.
- **No bundle tooling** yet (`tools/` has only `sync-*.sh`).
- **GOTCHA — shared-script dependency:** prototypes include `seed.js`/`stats.js` (and full games their
  own `js/`,`css/`) by **relative path**. A game loaded from a Filesystem dir resolves those relative
  to that dir → app-root copies are unreachable. **Therefore OTA bundles must be self-contained**
  (carry every asset the entry references). (Bundling sidesteps this entirely — relative paths resolve
  inside the one bundled `public/` tree.)
- **Loading a Filesystem file in the WebView:** use `Capacitor.convertFileSrc(fileUri)` to turn a
  Filesystem path into a URL the `anorak://` WebView can navigate to.

## OTA architecture (when revived)

```
┌─ remote catalog (live) ────────────────────────────────────────────────┐
│  fetch https://anorak-arcade.pages.dev/catalog.json  (network)          │
│   ├─ cache to Filesystem (offline fallback)                              │
│   └─ fall back to BUNDLED /catalog.json when offline                     │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │  merge with install state
                               ▼
        ┌─ per-game runnable-state resolver ─────────────────────────┐
        │  bundled?      → run from bundle (entry)   ← always true now │
        │  downloaded at bundle.version? → run from Filesystem        │
        │  else (remote-only / stale)    → DOWNLOAD on tap           │
        └───────────────────────────┬────────────────────────────────┘
                                    ▼
   tap PLAY → download /bundles/<slug>-<ver>.zip → verify sha256
            → unzip (fflate, in JS) to Filesystem/games/<slug>-<ver>/
            → register installed version → convertFileSrc(entry) → navigate
```

### Bundle format (self-contained)

`/bundles/<slug>-<version>.zip` contains the game **plus every asset it references**, flat-rooted so
relative paths resolve inside the unzip dir. The build tool reads `<script src>`/`<link href>` tags and
copies those files in. Full games (motherload, ecotone) ship their whole dir.

### Unzip in JS with **fflate** (no native plugin)

Capacitor Filesystem can't unzip. Vendor **fflate** (~8KB, pure JS, works in the WebView and on
Android): fetch the zip as an `ArrayBuffer`, `unzipSync`, write each entry to Filesystem. Portable,
dependency-light, avoids an iOS-only native unzip pod.

### Integrity + 4.7 compliance

Each `bundle.sha256` is computed at build time; the app verifies downloaded bytes before unzipping
(reject + retry on mismatch). `bundle.bytes` drives the progress bar. Bundles are HTML/JS/CSS/asset
data run in a `WKWebView` — **no native code downloaded or executed** — the 4.7-safe pattern; document
it in the App Store review notes.

## Files to create / modify (when revived)

**New**
- `public/aa-games.js` — runtime: remote-catalog fetch+cache, install registry, `resolveRunnable(game)`,
  download+verify+unzip, progress sheet. Native-only (no-op on web).
- `public/vendor/fflate.min.js` — vendored unzip lib.
- `tools/build-bundles.mjs` — assemble self-contained zips into `public/bundles/<slug>-<ver>.zip`,
  compute `bytes` + `sha256`, write them back into `public/catalog.json`. Run pre-deploy.

**Modify**
- `public/native-app.js` — fetch the **remote** catalog (cache + offline fallback); route card tap and
  `entryHref` through `AAGames.resolveRunnable(...)`; "update available / new game" badges.
- `public/game.html` — ▶ PLAY calls `AAGames.resolveRunnable(g)` rather than `href = g.entry` directly.
- `public/catalog.json` — populated `bundle.bytes`/`sha256`.

**Worker:** essentially no change — bundles are static files on Pages.

## Phased build sequence (when revived)

1. **Build tool + bundles** — `tools/build-bundles.mjs` produces self-contained zips + fills
   `bytes`/`sha256`. *(No app changes; safe to land first.)*
2. **Runtime, download-only** — `aa-games.js` + fflate: download → verify → unzip → `convertFileSrc`
   → navigate. Wire only `game.html`'s PLAY button. Test in the simulator with a game removed from the
   bundle but present in the remote catalog.
3. **Remote catalog + home integration** — `native-app.js` fetches the live catalog (offline
   fallback), renders "new game" badges, routes card taps through the runtime.
4. **Update detection** — diff remote `bundle.version` vs installed; re-download; cache eviction.
5. **Polish** — progress UI, retry/backoff, integrity-failure handling, storage accounting.

**Win condition (when revived):** push a brand-new game to Cloudflare *without* touching the app;
confirm it appears and plays in the already-installed app.

## Open questions (parked with the deferral)

- Commit `public/bundles/*.zip` to git, or generate-and-deploy only? (Leaning gitignore + pre-deploy.)
- Install registry store: `@capacitor/preferences` vs a Filesystem `installed.json`.
- Update policy for already-bundled games when the remote bumps their version.
- Eviction / storage cap for downloaded bundles.
- Audit any prototype that references an asset the `<script>/<link>` scan would miss (runtime `fetch`).
