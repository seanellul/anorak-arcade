# Anorak Arcade — App Architecture

Turn the web arcade into native apps (iOS first, Android fast-follow) on top of the existing web
arcade, where:

- the **shell** (home, nav, leaderboard, account) ships in the app and works offline;
- **games ship bundled inside the app** (the whole `public/` tree) so the full arcade plays
  **offline, on first launch, with no login** — the "play everything on a plane" promise. New
  games arrive with each app build; over-the-air delivery is a deferred optimization (see
  [`arcade-app-phase3.md`](arcade-app-phase3.md)), not a launch requirement;
- **play is free and anonymous; signing in is only ever required to *save* a score to a global
  board** — never to play (see [`score-integrity.md`](score-integrity.md), the login-to-save model);
- **accounts** use **Sign in with Apple** → our Cloudflare Worker, unlocking leaderboards,
  voting, suggestions, and challenges on a single `user_id` backbone.

> **Decision (2026-06-17): bundle-first offline, OTA-later.** A real tester wanted to play the whole
> arcade on a flight. Bundling is the best possible offline UX — zero action, works on first launch,
> works with no network — and it already works today (iOS has `webDir: ../public`, **no `server.url`**,
> all 13 games + assets synced into the bundle). The unbuilt Phase-3 zip-download pipeline (fflate
> unzip, sha256, install registry) was an iOS-only optimization for *new games between app builds*;
> it's orthogonal to offline play, so it's deferred until release cadence actually demands it.

## Platform strategy

**Launch: Web + iOS. Android: fast-follow.** The games are web, so reach is already everywhere — the
web arcade runs in any browser, including Android, *today*. "iOS-only native" ≠ "iOS-only reach";
nobody is locked out at launch. Native iOS is where the platform work already exists (Sign in with
Apple, APNs push, the `AnorakViewController` shell, entitlements). A native **Android** app is a
*fast-follow*, not a launch gate, because it is a genuine second track — a different auth path
(Google Sign-In / email, since Sign in with Apple is Apple-only), FCM instead of APNs, a Play Console
listing + review, and Android WebView QA. Don't triple the store-review/support surface before the
core loop is validated.

| Surface | Status | Offline story | Notes |
|---|---|---|---|
| **Web** (Cloudflare Pages) | live | PWA precache + "Download for offline" (to-do) | Source of truth; zero review friction; the no-install demo. |
| **iOS** (Capacitor) | building | **bundled — works now** | Where the native work lives. Launch surface. |
| **Android** (Capacitor) | fast-follow | bundled (same as iOS) | `cap add android` + auth/push swap once the loop is proven. |

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Native shell | **Capacitor** (`mobile/`) | `WKWebView` + native plugins. Reuses `public/` as-is. |
| Web source of truth | `public/` (Cloudflare Pages) | The same site that runs at the web URL. |
| Game catalog | `public/catalog.json` | Machine-readable list of games + versions. |
| Game delivery | **bundled in the app** (`webDir: ../public`) | Whole arcade ships in the binary → offline by default. OTA zips deferred. |
| Backend / data | **Cloudflare Worker + D1** (`api/`) | Auth, accounts, scores, social features. |
| Auth | **Sign in with Apple** | Native plugin → identity token → Worker verifies → session. |
| Ads | AdMob (Capacitor plugin) | Secondary; add after core loop works. |

## Offline model (bundle-first)

```
App launch ──► whole arcade is bundled (shell + all games) ─► plays offline, no login, first launch
                  │
                  ├─ play a game ─► runs from the bundle (no network ever needed)
                  │                  personal bests saved on-device (localStorage)
                  │
                  ├─ online + signed in? ─► score lands on the GLOBAL board via Worker API
                  │                          (anonymous / offline submits return {saved:false})
                  │
                  └─ new games ─► arrive with the next app build (OTA is deferred — see phase3 doc)
```

- **Everything is bundled** — shell *and* games ship in the binary (`webDir: ../public`). The app
  opens and plays the full catalog with no network. Games are **content, not native code**, run in a
  `WKWebView` — exactly what App Store Guideline **4.7** permits.
- **No login to play.** Anonymous = full play + on-device personal bests + playtime. Signing in
  (Sign in with Apple) is required *only* to save a score to a **global** board — never to play.
- **Trust is bifurcated** (see [`score-integrity.md`](score-integrity.md)): casual/offline play and
  personal bests are lenient and login-free; **global/competitive boards are online + authenticated +
  server-authoritative** (board name comes from the account handle, anonymous submits don't write).
  The high-stakes tier is where integrity is enforced; offline play stays pure fun.
- **New games** currently arrive by shipping a new app build (a `cap sync` + store update). That's
  fine at this stage. Over-the-air delivery — pushing a game to Cloudflare and having it appear in the
  installed app with no rebuild — is the **deferred** Phase-3 optimization; pick it up only when the
  release cadence makes per-game rebuilds painful.

### Catalog shape — `public/catalog.json`

```jsonc
{
  "schema": 1,
  "catalogVersion": "2026-06-13",
  "minAppVersion": "1.0.0",          // app shows "update the app" if older
  "games": [{
    "id": "CINDER",                  // matches leaderboard GAME ids
    "slug": "cinder",
    "title": "CINDER", "verb": "CONTAINMENT", "tag": "...", "blurb": "...",
    "accent": "#ff6a3d",
    "type": "prototype",             // prototype | full
    "wave": 1,
    "platforms": ["mobile","desktop"],   // motherload is desktop-only → hidden on phone
    "controls": ["touch","mouse"],
    "entry": "cinder.html",          // entry file inside the bundle
    "bundle": { "version": "1.0.0", "url": "/bundles/cinder-1.0.0.zip", "bytes": 0, "sha256": "" }
    // ^ bundle{} fields stay in the schema but are DORMANT under bundle-first delivery —
    //   they only become live if/when OTA download (phase3) is picked up. Today the game
    //   plays from the in-app copy at `entry`; nothing is downloaded.
  }]
}
```

> **Single source of truth (later):** the web home (`index.html`) still hand-authors its cards.
> A follow-up should make both the web home and the app render from `catalog.json` so games are
> declared once. `tools/build-catalog.mjs` can also fill `bytes`/`sha256` at bundle time.

## Accounts — the backbone

Today: device-scoped (`client_id` UUID + free-text name, one row per device×game in `totals`).
New: real **users**, with the device model kept as the **anonymous tier** that can be claimed.

```
Apple ─► identityToken (JWT) ─► POST /api/auth/apple
   Worker verifies token against Apple's public keys (appleid.apple.com/auth/keys),
   checks aud = our bundle id, iss = https://appleid.apple.com, exp not passed.
   ─► upsert users(apple_sub) ─► issue our own session token (signed, ~30d) ─► client stores it.
```

- **Claim flow**: on first sign-in, pass the anonymous `client_id`; the Worker re-points that
  device's `totals` rows to the new `user_id` so nobody loses their history.
- **Sessions**: HMAC-signed token (`user_id.exp.sig`) in a `SESSION_SECRET`; cheap to verify, no
  session-table lookup. Authenticated routes read `Authorization: Bearer <token>`.
- Apple only returns name/email **once**, on first authorization — capture and store it then.

### Schema additions (`api/schema.sql`)

- `users` — `id`, `apple_sub` (unique), `handle`, `email`, timestamps.
- `totals` — add nullable `user_id` (keep `client_id` for anon + claim migration).
- `suggestions` — community game ideas; `votes` — one vote per user per suggestion.
- `challenges` — a game + target/seed + window; `challenge_entries` — a user's score in a challenge.

## API surface (Worker)

Existing: `POST /api/sync`, `GET /api/leaderboard`, `GET /api/stats`, `GET /api/admin`, `GET /api/health`.

New:
- `POST /api/auth/apple` — `{identityToken, clientId?}` → `{token, user}` (verifies + claims device).
- `GET  /api/me` — current user + aggregate stats (auth).
- `POST /api/suggestions` — `{title, blurb}` (auth); `GET /api/suggestions` — list with vote counts.
- `POST /api/suggestions/:id/vote` — toggle vote (auth).
- `GET  /api/challenges` — active challenges; `POST /api/challenges/:id/score` — submit (auth).

`/api/sync` stays backward-compatible: if a session token is present it attributes to `user_id`,
otherwise it behaves exactly as today (anonymous `client_id`).

## Build / run

```bash
cd mobile
npm install
npx cap sync ios          # copies public/ web assets + native plugins into the iOS project
npx cap open ios          # opens Xcode → run on simulator or device
```

Web/back-end deploy is unchanged: push to `main` → Cloudflare Pages rebuild; Worker via `wrangler deploy`.

## Phasing

1. **Spike** — Capacitor wraps `public/`; arcade runs in the simulator. *(done)*
2. **Auth** — Sign in with Apple → Worker sessions → `/api/me`; claim anonymous history. *(done — login-to-save model)*
3. **Offline play** — **achieved by bundling** (whole `public/` ships in the binary; plays offline,
   no login). ✅ No download/unzip pipeline needed for offline. *(OTA download — old Phase 3 —
   deferred; see [`arcade-app-phase3.md`](arcade-app-phase3.md).)*
4. **Social** — suggestions + voting, then challenges.
5. **Ads** — AdMob, interstitial between runs.
6. **Android fast-follow** — `cap add android` + auth/push swap, once the loop is validated.
7. **(Deferred) OTA game delivery** — pick up Phase 3 when per-game app rebuilds become painful.
