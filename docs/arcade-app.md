# Anorak Arcade — iOS App Architecture

Turn the web arcade into a native iOS app where:

- the **shell** (home, nav, leaderboard, account) ships in the app and works offline;
- **games** are HTML5 bundles served from our server, **downloaded on demand**, playable offline;
- **new games ship by pushing to Cloudflare** — no App Store update, no review (App Store
  Review Guideline **4.7**: HTML5 mini-games run in a WebView are allowed);
- **accounts** use **Sign in with Apple** → our Cloudflare Worker, unlocking leaderboards,
  voting, suggestions, and challenges on a single `user_id` backbone.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Native shell | **Capacitor** (`mobile/`) | `WKWebView` + native plugins. Reuses `public/` as-is. |
| Web source of truth | `public/` (Cloudflare Pages) | The same site that runs at the web URL. |
| Game catalog | `public/catalog.json` | Machine-readable list of games + bundle versions. |
| Game bundles | `public/bundles/<slug>-<ver>.zip` | Self-contained HTML/JS/assets per game. |
| Backend / data | **Cloudflare Worker + D1** (`api/`) | Auth, accounts, scores, social features. |
| Auth | **Sign in with Apple** | Native plugin → identity token → Worker verifies → session. |
| Ads | AdMob (Capacitor plugin) | Secondary; add after core loop works. |

## Offline + remote-update model (the 4.7-safe pattern)

```
App launch ──► bundled shell (always offline)
                  │
                  ├─ online?  ─► GET /catalog.json ─► diff against installed bundle versions
                  │                                   └─► show "update available" / "new game" badges
                  │
   tap a game ──► installed?  ─► run from Filesystem (offline OK)
                  │  └─ no/stale ─► download /bundles/<slug>-<ver>.zip ─► unzip to Filesystem ─► run
                  │
   leaderboard / vote / challenge ─► needs network ─► Worker API (matches "wifi only for leaderboard")
```

- **Shell is bundled** in the app so it opens with no network. Games are **downloaded content**,
  not native code — this is exactly what 4.7 permits.
- **Bundle versioning**: `catalog.json` is the source of truth. Each game has a
  `bundle.version`; the app stores installed versions and re-downloads when the catalog bumps.
  Pushing a new `catalog.json` + zip to Pages ships an update instantly.
- **Integrity**: each bundle carries a `sha256`; the app verifies after download before unzipping.

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

1. **Spike** — Capacitor wraps `public/`; arcade runs in the simulator. *(this commit)*
2. **Auth** — Sign in with Apple → Worker sessions → `/api/me`; claim anonymous history.
3. **Offline downloads** — catalog diffing + bundle download/unzip/run from Filesystem.
4. **Social** — suggestions + voting, then challenges.
5. **Ads** — AdMob, interstitial between runs.
