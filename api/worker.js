// Anorak Arcade — leaderboard API (Cloudflare Worker + D1)
// Routes:
//   POST /api/sync          {clientId,name,game,addMs,plays,score}  -> upsert totals
//   GET  /api/leaderboard?game=CINDER&limit=20                      -> top names by best score
//   GET  /api/stats                                                 -> global time + per-game
//   GET  /api/admin?key=...                                         -> full name x game breakdown (secret)
// CORS-open so the games can be embedded anywhere.

// MOTHERLOAD has two boards: MOTHERLOAD = max depth (m), MOTHERLOAD_CASH = lifetime money earned ($).
const GAMES = ['CINDER', 'SHIFT', 'CONDUIT', 'HOMEOSTAT', 'NOVA', 'SURGE', 'CLEAVE', 'FLUX', 'WEAVE', 'PULSE', 'MOTHERLOAD', 'MOTHERLOAD_CASH', 'ECOTONE'];
const SCORE_CAP = 1000000000;     // absurd-value guard (money earned can climb high, so 1e9)
const MS_CAP    = 600000;         // max time accepted per single sync (10 min) - anti-inflation
const PLAYS_CAP = 100;
const NAME_MAX  = 16;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });

function cleanName(n) {
  // keep printable chars only (drop control chars), collapse whitespace, trim, cap length
  const s = String(n == null ? '' : n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 32 && c !== 127) out += s[i];
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}
const clampInt = (v, lo, hi) => {
  v = Math.floor(Number(v));
  if (!Number.isFinite(v)) v = 0;
  return Math.max(lo, Math.min(hi, v));
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      if (request.method === 'POST' && path === '/api/sync')        return await sync(request, env);
      if (request.method === 'POST' && path === '/api/session/start') return await sessionStart(request, env);
      if (request.method === 'GET'  && path === '/api/leaderboard') return await leaderboard(url, env, request);
      if (request.method === 'GET'  && path === '/api/stats')       return await stats(env);
      if (request.method === 'GET'  && path === '/api/admin')       return await admin(url, env);
      if (request.method === 'GET'  && path === '/api/health')      return json({ ok: true });

      // ---- accounts (Sign in with Apple) + social backbone ----
      if (request.method === 'POST' && path === '/api/auth/apple')  return await authApple(request, env);
      if (request.method === 'GET'  && path === '/api/me')          return await me(request, env);
      if (request.method === 'GET'  && path === '/api/suggestions') return await listSuggestions(env);
      if (request.method === 'POST' && path === '/api/suggestions') return await createSuggestion(request, env);
      let m;
      if (request.method === 'POST' && (m = path.match(/^\/api\/suggestions\/([a-zA-Z0-9-]+)\/vote$/)))
        return await voteSuggestion(request, env, m[1]);
      if (request.method === 'GET'  && path === '/api/challenges')  return await listChallenges(env);
      if (request.method === 'POST' && (m = path.match(/^\/api\/challenges\/([a-zA-Z0-9-]+)\/score$/)))
        return await challengeScore(request, env, m[1]);
      if (request.method === 'GET'  && path === '/api/daily')       return daily();
      if (request.method === 'GET'  && path === '/api/daily/leaderboard') return await dailyBoard(env);
      if (request.method === 'GET'  && path === '/api/rank')        return await rank(url, env);
      if (request.method === 'GET'  && path === '/api/profile')     return await profile(url, env);
      if (request.method === 'GET'  && path === '/api/players')     return await players(url, env);
      if (request.method === 'GET'  && path === '/api/feed')        return await feed(request, env);
      if (request.method === 'GET'  && path === '/api/seasons')     return await seasons(env);
      if (request.method === 'GET'  && path === '/api/season/standings') return await seasonStandings(url, env);
      if (request.method === 'POST' && path === '/api/push/register') return await pushRegister(request, env);
      if (request.method === 'POST' && path === '/api/name')        return await claimName(request, env);
      if (request.method === 'GET'  && path === '/api/friends')     return await listFriends(request, env);
      if (request.method === 'POST' && path === '/api/friends/add') return await addFriend(request, env);
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, 500);
    }
    return json({ error: 'not found' }, 404);
  },

  // Nightly cron (see wrangler.toml [triggers]): freeze per-game standings so we can
  // show rank deltas ("climbed 14 spots this week") and, later, season-end top-N.
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => { await snapshotRanks(env); await rolloverSeasons(env); })());
  },
};

// Top-100 per game → rank_snapshots, stamped with one captured_at per run.
async function snapshotRanks(env) {
  const now = Date.now();
  for (const g of GAMES) {
    const r = await env.DB.prepare(
      "WITH best AS (SELECT LOWER(name) AS pkey, MAX(name) AS name, MAX(user_id) AS user_id, MAX(score) AS score " +
      "  FROM scores WHERE game = ?1 AND score > 0 AND name <> '' GROUP BY LOWER(name)) " +
      "SELECT name, user_id, score, RANK() OVER (ORDER BY score DESC) AS rk FROM best ORDER BY rk LIMIT 100"
    ).bind(g).all();
    for (const row of (r.results || [])) {
      await env.DB.prepare(
        "INSERT INTO rank_snapshots (scope, season_id, game, user_id, name, rank, score, captured_at) " +
        "VALUES ('global','',?1,?2,?3,?4,?5,?6)"
      ).bind(g, row.user_id || null, row.name, row.rk, row.score, now).run();
    }
  }
}

async function sync(request, env) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const clientId = String(b.clientId || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  const game = String(b.game || '').toUpperCase();
  if (!clientId || GAMES.indexOf(game) < 0) return json({ error: 'bad clientId/game' }, 400);
  const name  = cleanName(b.name);
  const addMs = clampInt(b.addMs, 0, MS_CAP);
  const plays = clampInt(b.plays, 0, PLAYS_CAP);
  const score = clampInt(b.score, 0, SCORE_CAP);
  const now = Date.now();
  // Optional auth: if a valid session token is present, attribute this device's rows to the user.
  const userId = await currentUserId(request, env);
  // daily seed tag (only the canonical daily-YYYY-MM-DD form is accepted)
  const seed = /^daily-\d{4}-\d{2}-\d{2}$/.test(String(b.seed || '')) ? String(b.seed) : '';

  // Canonical name is server-authoritative: the player's CLAIMED (unique) name, not whatever
  // the client sent. Falls back to the submitted name for legacy/unclaimed clients.
  let canon = '';
  let nrow = null;
  if (userId) nrow = await env.DB.prepare("SELECT name FROM names WHERE user_id = ?1 LIMIT 1").bind(userId).first();
  if (!nrow) nrow = await env.DB.prepare("SELECT name FROM names WHERE client_id = ?1 LIMIT 1").bind(clientId).first();
  canon = (nrow && nrow.name) || name;

  await env.DB.prepare(
    "INSERT INTO totals (client_id, game, name, total_ms, plays, best_score, created_at, updated_at, user_id) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8) " +
    "ON CONFLICT(client_id, game) DO UPDATE SET " +
    "  total_ms = total_ms + excluded.total_ms, " +
    "  plays = plays + excluded.plays, " +
    "  best_score = MAX(best_score, excluded.best_score), " +
    "  name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE name END, " +
    "  user_id = COALESCE(excluded.user_id, totals.user_id), " +
    "  updated_at = excluded.updated_at"
  ).bind(clientId, game, canon, addMs, plays, score, now, userId).run();

  // Log the run (anonymous included) for time-windowed + daily leaderboards.
  // If the client signed this score against a server-issued play session, the row
  // is provenance-stamped ('verified'/'session'); otherwise it's the trusted-legacy path.
  if (score > 0) {
    let integrity = sanityOk(game, score) ? 'legacy' : 'flagged';
    let sessionId = null;
    let scoreUser = userId;
    const clientVersion = String(b.clientVersion || '').slice(0, 32);
    const signed = await validateSignedScore(env, {
      sessionId: b.sessionId, sig: b.sig, nonce: b.nonce, game, score, seed, clientId,
    });
    if (signed) {
      sessionId = String(b.sessionId);
      integrity = sanityOk(game, score) ? signed.integrity : 'flagged';
      if (signed.userId) scoreUser = signed.userId;
    }
    // prior best for this named player (before we log the new row) → detect a true new best
    let prevBest = 0;
    if (scoreUser && canon) {
      const pb = await env.DB.prepare(
        "SELECT MAX(score) AS m FROM scores WHERE game = ?1 AND LOWER(name) = ?2 AND score > 0"
      ).bind(game, canon.toLowerCase()).first();
      prevBest = (pb && pb.m) || 0;
    }
    await env.DB.prepare(
      "INSERT INTO scores (game, name, client_id, user_id, score, seed, created_at, session_id, integrity, client_version) " +
      "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)"
    ).bind(game, canon, clientId, scoreUser, score, seed, now, sessionId, integrity, clientVersion).run();
    // feed: only on a signed-in player's genuine new personal best, and never for flagged scores
    if (scoreUser && canon && integrity !== 'flagged' && score > prevBest) {
      try { await recordScoreEvents(env, { game, score, prevBest, actorUserId: scoreUser, actorName: canon, now }); } catch (e) {}
    }
  }

  return json({ ok: true });
}

// ===========================================================================
// Score integrity — server-issued play sessions + signed submissions.
// A run starts a session (bound to game/seed/user); the client signs its final
// score with the session's secret; the server re-checks the HMAC + single-use.
// This is the seam the future revenue-split plugs into: only verified, session-
// bound scores from signed-in users are ever payout-eligible. Determined cheats
// still need real replay validation (Phase 5) — this stops casual tamper/replay.
// ===========================================================================
const SESSION_RUN_TTL_MS = 6 * 60 * 60 * 1000;   // a run/session stays valid up to 6h

function randomSecret() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return bytesToB64url(a);
}
async function hmacHexWith(secret, msg) {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, te.encode(msg));
  const a = new Uint8Array(sig);
  let h = '';
  for (let i = 0; i < a.length; i++) h += a[i].toString(16).padStart(2, '0');
  return h;
}
// Per-game plausibility. Seam for Phase 5 (real per-game bounds / replay re-sim).
// For now it's the global absurd-value guard; impossible scores get 'flagged'.
function sanityOk(game, score) {
  return score >= 0 && score <= SCORE_CAP;
}

async function sessionStart(request, env) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const clientId = String(b.clientId || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  const game = String(b.game || '').toUpperCase();
  if (!clientId || GAMES.indexOf(game) < 0) return json({ error: 'bad clientId/game' }, 400);
  const seed = /^daily-\d{4}-\d{2}-\d{2}$/.test(String(b.seed || '')) ? String(b.seed) : '';
  const clientVersion = String(b.clientVersion || '').slice(0, 32);
  const userId = await currentUserId(request, env);   // null for anonymous play
  const id = crypto.randomUUID();
  const secret = randomSecret();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO play_sessions (id, user_id, client_id, game, seed, secret, client_version, started_at, expires_at) " +
    "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)"
  ).bind(id, userId, clientId, game, seed, secret, clientVersion, now, now + SESSION_RUN_TTL_MS).run();
  // The secret is returned to the client so it can sign its final score.
  return json({ sessionId: id, secret, seed, game, exp: now + SESSION_RUN_TTL_MS });
}

// Validate a signed score against its session. Returns {integrity,userId} or null.
async function validateSignedScore(env, { sessionId, sig, nonce, game, score, seed, clientId }) {
  if (!sessionId || !sig) return null;
  const s = await env.DB.prepare("SELECT * FROM play_sessions WHERE id = ?1").bind(String(sessionId)).first();
  if (!s) return null;
  if (s.game !== game) return null;
  if (s.client_id !== clientId) return null;
  if ((s.seed || '') !== (seed || '')) return null;
  if (Date.now() > s.expires_at) return null;
  if (s.consumed_at) return null;                       // single-use → blocks replay
  const expect = await hmacHexWith(s.secret, `${sessionId}.${game}.${score}.${seed || ''}.${nonce || ''}`);
  if (expect !== String(sig)) return null;
  await env.DB.prepare("UPDATE play_sessions SET consumed_at = ?2 WHERE id = ?1").bind(String(sessionId), Date.now()).run();
  return { integrity: s.user_id ? 'verified' : 'session', userId: s.user_id || null };
}

// time windows for the leaderboard filters
function periodCutoff(period) {
  const now = Date.now(), day = 86400000;
  if (period === 'today') return now - day;
  if (period === 'week') return now - 7 * day;
  if (period === 'month') return now - 30 * day;
  return 0; // 'all'
}
// one entry per player: lowercased name, or client_id when anonymous
const LB_GROUP = "CASE WHEN name <> '' THEN LOWER(name) ELSE client_id END";

// verified=1 restricts the board to integrity-checked, session-bound scores — the
// payout-eligible view. Default shows every score (the fun, all-comers board).
const VERIFIED_FILTER = " AND integrity = 'verified'";

async function leaderboard(url, env, request) {
  const limit = clampInt(url.searchParams.get('limit') || 20, 1, 100);
  const game = String(url.searchParams.get('game') || '').toUpperCase();
  const period = String(url.searchParams.get('period') || 'all');
  const cutoff = periodCutoff(period);
  const verified = url.searchParams.get('verified') === '1' ? VERIFIED_FILTER : '';
  const scope = String(url.searchParams.get('scope') || 'global');
  const around = cleanName(url.searchParams.get('around') || '');
  if (game && GAMES.indexOf(game) >= 0) {
    // near-me view: the ±span window around a player's rank (the most motivating board)
    if (around) return await aroundBoard(env, game, around, cutoff, verified);
    // friends scope: only this user's friends (+ self) — requires a session
    if (scope === 'friends') {
      const uid = request && await currentUserId(request, env);
      if (!uid) return json({ error: 'unauthorized' }, 401);
      const r = await env.DB.prepare(
        "SELECT CASE WHEN name <> '' THEN name ELSE 'anon' END AS name, MAX(score) AS score FROM scores " +
        "WHERE game = ?1 AND score > 0 AND created_at >= ?2" + verified +
        " AND user_id IN (SELECT friend_id FROM friendships WHERE user_id = ?3 UNION SELECT ?3) " +
        "GROUP BY user_id ORDER BY score DESC LIMIT ?4"
      ).bind(game, cutoff, uid, limit).all();
      return json({ game, period, scope: 'friends', verified: !!verified, top: r.results || [] });
    }
    const r = await env.DB.prepare(
      "SELECT CASE WHEN name <> '' THEN name ELSE 'anon' END AS name, MAX(score) AS score FROM scores " +
      "WHERE game = ?1 AND score > 0 AND created_at >= ?2" + verified + " GROUP BY " + LB_GROUP + " ORDER BY score DESC LIMIT ?3"
    ).bind(game, cutoff, limit).all();
    return json({ game, period, verified: !!verified, top: r.results || [] });
  }
  const out = {};
  for (const g of GAMES) {
    const r = await env.DB.prepare(
      "SELECT CASE WHEN name <> '' THEN name ELSE 'anon' END AS name, MAX(score) AS score FROM scores " +
      "WHERE game = ?1 AND score > 0 AND created_at >= ?2" + verified + " GROUP BY " + LB_GROUP + " ORDER BY score DESC LIMIT 5"
    ).bind(g, cutoff).all();
    out[g] = r.results || [];
  }
  return json({ boards: out, period, verified: !!verified });
}

async function stats(env) {
  const g = await env.DB.prepare("SELECT COALESCE(SUM(total_ms),0) AS ms FROM totals").first();
  const r = await env.DB.prepare(
    "SELECT game, SUM(total_ms) AS ms, SUM(plays) AS plays, COUNT(DISTINCT client_id) AS players " +
    "FROM totals GROUP BY game ORDER BY ms DESC"
  ).all();
  return json({ globalMs: (g && g.ms) || 0, perGame: r.results || [] });
}

async function admin(url, env) {
  if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) return json({ error: 'unauthorized' }, 401);
  const byRow = await env.DB.prepare(
    "SELECT name, game, total_ms, plays, best_score, client_id, updated_at FROM totals ORDER BY updated_at DESC LIMIT 1000"
  ).all();
  const byName = await env.DB.prepare(
    "SELECT name, SUM(total_ms) AS ms, SUM(plays) AS plays, COUNT(DISTINCT game) AS games " +
    "FROM totals WHERE name <> '' GROUP BY name ORDER BY ms DESC LIMIT 500"
  ).all();
  return json({ rows: byRow.results || [], byName: byName.results || [] });
}

// ===========================================================================
// Accounts — Sign in with Apple + our own session tokens + social features.
// ===========================================================================

const APPLE_ISS = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days
const te = new TextEncoder();

const b64urlToBytes = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const bytesToB64url = (bytes) => {
  let bin = '';
  const a = new Uint8Array(bytes);
  for (let i = 0; i < a.length; i++) bin += String.fromCharCode(a[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const decodeJwtPart = (p) => JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));

// ---- our session token: base64url(payload).hexHmacSHA256 ----
async function hmacKey(env) {
  const secret = env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not set');
  return crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signSession(env, userId) {
  const payload = bytesToB64url(te.encode(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_MS })));
  const key = await hmacKey(env);
  const sig = bytesToB64url(await crypto.subtle.sign('HMAC', key, te.encode(payload)));
  return payload + '.' + sig;
}
async function verifySession(env, token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const key = await hmacKey(env);
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), te.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    if (!data.uid || !(data.exp > Date.now())) return null;
    return data.uid;
  } catch (e) { return null; }
}
function bearer(request) {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}
async function currentUserId(request, env) {
  return await verifySession(env, bearer(request));
}
async function requireUser(request, env) {
  const uid = await currentUserId(request, env);
  if (!uid) return { error: json({ error: 'unauthorized' }, 401) };
  return { uid };
}

// ---- verify Apple's identity token (RS256 against Apple's JWKS) ----
async function verifyAppleToken(idToken, env) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (claims.iss !== APPLE_ISS) throw new Error('bad iss');
  const aud = env.APPLE_BUNDLE_ID;
  if (aud && claims.aud !== aud) throw new Error('bad aud');
  if (!(claims.exp * 1000 > Date.now())) throw new Error('token expired');

  const jwks = await (await fetch(APPLE_KEYS_URL)).json();
  const jwk = (jwks.keys || []).find(k => k.kid === header.kid);
  if (!jwk) throw new Error('signing key not found');
  const key = await crypto.subtle.importKey(
    'jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = te.encode(parts[0] + '.' + parts[1]);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), signed);
  if (!ok) throw new Error('bad signature');
  return claims;  // includes sub, email?
}

async function authApple(request, env) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  let claims;
  try { claims = await verifyAppleToken(b.identityToken, env); }
  catch (e) { return json({ error: 'apple verify failed: ' + e.message }, 401); }

  const sub = String(claims.sub);
  const email = String(claims.email || '').slice(0, 200);
  // Apple sends the name only on the very first authorization → client forwards it as fullName.
  const handle = cleanName(b.fullName || '');
  const now = Date.now();

  let row = await env.DB.prepare("SELECT id, handle FROM users WHERE apple_sub = ?1").bind(sub).first();
  let userId;
  if (row) {
    userId = row.id;
    if (handle && !row.handle)
      await env.DB.prepare("UPDATE users SET handle = ?2, updated_at = ?3 WHERE id = ?1").bind(userId, handle, now).run();
  } else {
    userId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users (id, apple_sub, handle, email, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?5)"
    ).bind(userId, sub, handle, email, now).run();
  }

  // Claim flow: re-point this device's anonymous totals to the user.
  const clientId = String(b.clientId || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  if (clientId)
    await env.DB.prepare("UPDATE totals SET user_id = ?1 WHERE client_id = ?2 AND user_id IS NULL").bind(userId, clientId).run();

  const token = await signSession(env, userId);
  const user = await env.DB.prepare("SELECT id, handle, email, created_at FROM users WHERE id = ?1").bind(userId).first();
  return json({ token, user });
}

async function me(request, env) {
  const { uid, error } = await requireUser(request, env);
  if (error) return error;
  const user = await env.DB.prepare("SELECT id, handle, email, created_at FROM users WHERE id = ?1").bind(uid).first();
  if (!user) return json({ error: 'not found' }, 404);
  const agg = await env.DB.prepare(
    "SELECT COALESCE(SUM(total_ms),0) AS ms, COALESCE(SUM(plays),0) AS plays, COUNT(DISTINCT game) AS games FROM totals WHERE user_id = ?1"
  ).bind(uid).first();
  const perGame = await env.DB.prepare(
    "SELECT game, SUM(total_ms) AS ms, SUM(plays) AS plays, MAX(best_score) AS best FROM totals WHERE user_id = ?1 GROUP BY game ORDER BY ms DESC"
  ).bind(uid).all();
  return json({ user, stats: agg, perGame: perGame.results || [] });
}

// ---- suggestions + voting ----
async function listSuggestions(env) {
  const r = await env.DB.prepare(
    "SELECT s.id, s.title, s.blurb, s.status, s.created_at, u.handle AS author, " +
    "  (SELECT COUNT(*) FROM votes v WHERE v.suggestion_id = s.id) AS votes " +
    "FROM suggestions s LEFT JOIN users u ON u.id = s.user_id " +
    "ORDER BY votes DESC, s.created_at DESC LIMIT 200"
  ).all();
  return json({ suggestions: r.results || [] });
}
async function createSuggestion(request, env) {
  const { uid, error } = await requireUser(request, env);
  if (error) return error;
  let b; try { b = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const title = String(b.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const blurb = String(b.blurb || '').trim().slice(0, 400);
  if (!title) return json({ error: 'title required' }, 400);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO suggestions (id, user_id, title, blurb, status, created_at) VALUES (?1,?2,?3,?4,'open',?5)"
  ).bind(id, uid, title, blurb, Date.now()).run();
  // creator implicitly votes for their own idea
  await env.DB.prepare("INSERT OR IGNORE INTO votes (suggestion_id, user_id, created_at) VALUES (?1,?2,?3)").bind(id, uid, Date.now()).run();
  return json({ ok: true, id });
}
async function voteSuggestion(request, env, id) {
  const { uid, error } = await requireUser(request, env);
  if (error) return error;
  const exists = await env.DB.prepare("SELECT 1 FROM votes WHERE suggestion_id = ?1 AND user_id = ?2").bind(id, uid).first();
  if (exists) {
    await env.DB.prepare("DELETE FROM votes WHERE suggestion_id = ?1 AND user_id = ?2").bind(id, uid).run();
    return json({ ok: true, voted: false });
  }
  await env.DB.prepare("INSERT INTO votes (suggestion_id, user_id, created_at) VALUES (?1,?2,?3)").bind(id, uid, Date.now()).run();
  return json({ ok: true, voted: true });
}

// ---- challenges ----
async function listChallenges(env) {
  const now = Date.now();
  const r = await env.DB.prepare(
    "SELECT id, game, title, seed, starts_at, ends_at FROM challenges WHERE ends_at > ?1 ORDER BY ends_at ASC LIMIT 50"
  ).bind(now).all();
  return json({ challenges: r.results || [] });
}
// Deterministic daily: same game + seed for everyone on a given UTC day (feature #8).
function dailyInfo() {
  const dayNo = Math.floor(Date.now() / 86400000);
  const rotation = ['CINDER', 'SHIFT', 'CONDUIT', 'HOMEOSTAT', 'NOVA', 'SURGE', 'CLEAVE', 'FLUX', 'WEAVE', 'PULSE'];
  const game = rotation[dayNo % rotation.length];
  const date = new Date(dayNo * 86400000).toISOString().slice(0, 10);
  return { date, game, seed: 'daily-' + date };
}
function daily() { return json(dailyInfo()); }
async function dailyBoard(env) {
  const info = dailyInfo();
  const r = await env.DB.prepare(
    "SELECT CASE WHEN name <> '' THEN name ELSE 'anon' END AS name, MAX(score) AS score FROM scores " +
    "WHERE seed = ?1 AND score > 0 GROUP BY " + LB_GROUP + " ORDER BY score DESC LIMIT 50"
  ).bind(info.seed).all();
  return json({ date: info.date, game: info.game, seed: info.seed, top: r.results || [] });
}

// Rank a score would achieve right now (for the top-N game-over celebration).
async function rank(url, env) {
  const game = String(url.searchParams.get('game') || '').toUpperCase();
  if (GAMES.indexOf(game) < 0) return json({ error: 'bad game' }, 400);
  const score = clampInt(url.searchParams.get('score') || 0, 0, SCORE_CAP);
  const period = String(url.searchParams.get('period') || 'all');
  const cutoff = periodCutoff(period);
  const higher = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM (SELECT MAX(score) m FROM scores WHERE game = ?1 AND score > 0 AND created_at >= ?2 GROUP BY " + LB_GROUP + " HAVING m > ?3)"
  ).bind(game, cutoff, score).first();
  const total = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM (SELECT 1 FROM scores WHERE game = ?1 AND score > 0 AND created_at >= ?2 GROUP BY " + LB_GROUP + ")"
  ).bind(game, cutoff).first();
  return json({ game, period, rank: ((higher && higher.n) || 0) + 1, players: (total && total.n) || 0 });
}

// A player's competitive profile: per-game best + world rank, and #-of-games-they-lead.
async function profile(url, env) {
  const nm = cleanName(url.searchParams.get('name') || '');
  if (!nm) return json({ error: 'name required' }, 400);
  const lc = nm.toLowerCase();
  const bests = await env.DB.prepare(
    "SELECT game, MAX(score) AS best FROM scores WHERE LOWER(name) = ?1 AND score > 0 GROUP BY game"
  ).bind(lc).all();
  const games = [];
  let worldNo1 = 0;
  let arcadeScore = 0;   // cross-game composite: Σ(101 − rank) over top-100 placements
  for (const row of (bests.results || [])) {
    const higher = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM (SELECT MAX(score) m FROM scores WHERE game = ?1 AND score > 0 GROUP BY " + LB_GROUP + " HAVING m > ?2)"
    ).bind(row.game, row.best).first();
    const rk = ((higher && higher.n) || 0) + 1;
    if (rk === 1) worldNo1++;
    if (rk <= 100) arcadeScore += (101 - rk);
    games.push({ game: row.game, best: row.best, rank: rk });
  }
  games.sort((a, b) => a.rank - b.rank || b.best - a.best);
  return json({ name: nm, worldNo1, arcadeScore, division: divisionFor(arcadeScore), games });
}

// ===========================================================================
// Arcade Score — the cross-game meta-leaderboard. Points reward beating people:
// a player earns (101 − rank) for every game they sit in the top 100 of, so the
// global #1 of a game is worth 100 and #100 is worth 1. This is the ladder a
// future revenue split rewards ("top 10–100 players"). Named players only.
// ===========================================================================
async function players(url, env) {
  const limit = clampInt(url.searchParams.get('limit') || 50, 1, 100);
  const r = await env.DB.prepare(
    "WITH best AS (" +
    "  SELECT game, LOWER(name) AS pkey, MAX(name) AS name, MAX(score) AS score" +
    "  FROM scores WHERE score > 0 AND name <> '' GROUP BY game, LOWER(name)" +
    "), ranked AS (" +
    "  SELECT pkey, name, RANK() OVER (PARTITION BY game ORDER BY score DESC) AS rk FROM best" +
    ") " +
    "SELECT MAX(name) AS name, SUM(101 - rk) AS arcade, COUNT(*) AS games, MIN(rk) AS bestRank " +
    "FROM ranked WHERE rk <= 100 GROUP BY pkey ORDER BY arcade DESC LIMIT ?1"
  ).bind(limit).all();
  return json({ players: r.results || [] });
}

// near-me board: the ±span window around a player's rank in one game.
async function aroundBoard(env, game, name, cutoff, verified) {
  const lc = name.toLowerCase();
  const span = 4;
  const pb = await env.DB.prepare(
    "SELECT MAX(score) AS s FROM scores WHERE game = ?1 AND LOWER(name) = ?2 AND score > 0 AND created_at >= ?3" + verified
  ).bind(game, lc, cutoff).first();
  if (!pb || !pb.s) return json({ game, you: null, from: 0, rows: [] });
  const higher = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM (SELECT MAX(score) m FROM scores WHERE game = ?1 AND score > 0 AND created_at >= ?2" + verified + " GROUP BY " + LB_GROUP + " HAVING m > ?3)"
  ).bind(game, cutoff, pb.s).first();
  const myRank = ((higher && higher.n) || 0) + 1;
  const from = Math.max(1, myRank - span);
  const r = await env.DB.prepare(
    "SELECT CASE WHEN name <> '' THEN name ELSE 'anon' END AS name, MAX(score) AS score FROM scores " +
    "WHERE game = ?1 AND score > 0 AND created_at >= ?2" + verified + " GROUP BY " + LB_GROUP + " ORDER BY score DESC LIMIT ?3 OFFSET ?4"
  ).bind(game, cutoff, span * 2 + 1, from - 1).all();
  return json({ game, you: { name, score: pb.s, rank: myRank }, from, rows: r.results || [] });
}

// ---- activity feed (events) ----
async function insertEvent(env, userId, kind, subjectUserId, game, payload, now) {
  if (!userId) return;
  await env.DB.prepare(
    "INSERT INTO events (user_id, kind, subject_user_id, game, payload, created_at) VALUES (?1,?2,?3,?4,?5,?6)"
  ).bind(userId, kind, subjectUserId || null, game || '', JSON.stringify(payload || {}), now).run();
}
// Called from sync on a signed-in player's *new* personal best. Cheap: a couple of
// extra queries only when there's something worth telling the feed about.
async function recordScoreEvents(env, { game, score, prevBest, actorUserId, actorName, now }) {
  const higher = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM (SELECT MAX(score) m FROM scores WHERE game = ?1 AND score > 0 GROUP BY " + LB_GROUP + " HAVING m > ?2)"
  ).bind(game, score).first();
  const rk = ((higher && higher.n) || 0) + 1;
  await insertEvent(env, actorUserId, rk === 1 ? 'no1' : 'best', null, game, { score, rank: rk }, now);
  // a genuinely leapfrogged player: their best sat above my old score and now below my new
  // one ("defend your spot"). Skip anyone I was already ahead of.
  const below = await env.DB.prepare(
    "SELECT user_id, MAX(score) AS s FROM scores WHERE game = ?1 AND score > 0 AND user_id IS NOT NULL AND user_id <> ?3 " +
    "GROUP BY user_id HAVING s < ?2 AND s > ?4 ORDER BY s DESC LIMIT 1"
  ).bind(game, score, actorUserId, prevBest || 0).first();
  if (below && below.user_id) await insertEvent(env, below.user_id, 'overtaken', actorUserId, game, { by: actorName, score, rank: rk }, now);
}
async function feed(request, env) {
  const { uid, error } = await requireUser(request, env);
  if (error) return error;
  // your own events (incl. being overtaken) + friends' bests / world-#1s
  const mine = await env.DB.prepare(
    "SELECT e.kind, e.game, e.payload, e.created_at, u.handle AS actor FROM events e " +
    "LEFT JOIN users u ON u.id = e.subject_user_id WHERE e.user_id = ?1 ORDER BY e.created_at DESC LIMIT 40"
  ).bind(uid).all();
  const friends = await env.DB.prepare(
    "SELECT e.kind, e.game, e.payload, e.created_at, u.handle AS actor FROM events e " +
    "JOIN friendships f ON f.friend_id = e.user_id AND f.user_id = ?1 " +
    "JOIN users u ON u.id = e.user_id WHERE e.kind IN ('best','no1') ORDER BY e.created_at DESC LIMIT 40"
  ).bind(uid).all();
  const merge = []
    .concat((mine.results || []).map(r => ({ ...r, own: true })))
    .concat((friends.results || []).map(r => ({ ...r, own: false })))
    .sort((a, b) => b.created_at - a.created_at).slice(0, 50);
  return json({ events: merge });
}

// ===========================================================================
// Seasons — the economic primitive. An arcade-wide calendar-month window; the
// frozen top-N at season close is exactly who a revenue split would reward.
// Seasons self-manage (lazy create current month; cron closes + freezes ended).
// ===========================================================================
function monthWindow(ts) {
  const d = new Date(ts);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1;   // last ms of the month
  const title = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { start, end, title };
}
async function currentSeason(env) {
  const now = Date.now();
  let s = await env.DB.prepare(
    "SELECT * FROM seasons WHERE game IS NULL AND status = 'active' AND starts_at <= ?1 AND ends_at >= ?1 ORDER BY ends_at DESC LIMIT 1"
  ).bind(now).first();
  if (s) return s;
  const w = monthWindow(now);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO seasons (id, game, title, starts_at, ends_at, status, created_at) VALUES (?1, NULL, ?2, ?3, ?4, 'active', ?5)"
  ).bind(id, 'Season · ' + w.title, w.start, w.end, now).run();
  return { id, game: null, title: 'Season · ' + w.title, starts_at: w.start, ends_at: w.end, status: 'active', created_at: now };
}
async function seasons(env) {
  const cur = await currentSeason(env);
  const past = await env.DB.prepare(
    "SELECT id, title, starts_at, ends_at FROM seasons WHERE status = 'closed' ORDER BY ends_at DESC LIMIT 6"
  ).all();
  const daysLeft = Math.max(0, Math.ceil((cur.ends_at - Date.now()) / 86400000));
  return json({ current: { id: cur.id, title: cur.title, starts_at: cur.starts_at, ends_at: cur.ends_at, daysLeft }, past: past.results || [] });
}
// Top-N of the active season for one game (the "top 10 gets rewarded" framing).
async function seasonStandings(url, env) {
  const game = String(url.searchParams.get('game') || '').toUpperCase();
  if (GAMES.indexOf(game) < 0) return json({ error: 'bad game' }, 400);
  const limit = clampInt(url.searchParams.get('limit') || 20, 1, 100);
  const cur = await currentSeason(env);
  const r = await env.DB.prepare(
    "SELECT CASE WHEN name <> '' THEN name ELSE 'anon' END AS name, MAX(score) AS score FROM scores " +
    "WHERE game = ?1 AND score > 0 AND created_at BETWEEN ?2 AND ?3 GROUP BY " + LB_GROUP + " ORDER BY score DESC LIMIT ?4"
  ).bind(game, cur.starts_at, cur.ends_at, limit).all();
  return json({ game, season: { id: cur.id, title: cur.title, ends_at: cur.ends_at }, top: r.results || [] });
}
// Nightly: close any season whose window has passed, freezing its top-100 per game
// into rank_snapshots (scope='season'). The next month's season is created on demand.
async function rolloverSeasons(env) {
  const now = Date.now();
  const ended = await env.DB.prepare(
    "SELECT id, starts_at, ends_at FROM seasons WHERE status = 'active' AND ends_at < ?1"
  ).bind(now).all();
  for (const s of (ended.results || [])) {
    for (const g of GAMES) {
      const r = await env.DB.prepare(
        "WITH best AS (SELECT LOWER(name) AS pkey, MAX(name) AS name, MAX(user_id) AS user_id, MAX(score) AS score " +
        "  FROM scores WHERE game = ?1 AND score > 0 AND name <> '' AND created_at BETWEEN ?2 AND ?3 GROUP BY LOWER(name)) " +
        "SELECT name, user_id, score, RANK() OVER (ORDER BY score DESC) AS rk FROM best ORDER BY rk LIMIT 100"
      ).bind(g, s.starts_at, s.ends_at).all();
      for (const row of (r.results || [])) {
        await env.DB.prepare(
          "INSERT INTO rank_snapshots (scope, season_id, game, user_id, name, rank, score, captured_at) VALUES ('season',?1,?2,?3,?4,?5,?6,?7)"
        ).bind(s.id, g, row.user_id || null, row.name, row.rk, row.score, now).run();
      }
    }
    await env.DB.prepare("UPDATE seasons SET status = 'closed' WHERE id = ?1").bind(s.id).run();
  }
  await currentSeason(env);   // ensure the new month's season exists
}

// ---- competitive division from Arcade Score (peers compete with peers) ----
function divisionFor(arcadeScore) {
  const a = arcadeScore || 0;
  if (a >= 700) return 'Diamond';
  if (a >= 400) return 'Platinum';
  if (a >= 200) return 'Gold';
  if (a >= 75)  return 'Silver';
  if (a > 0)    return 'Bronze';
  return '';
}

// ---- push token registration (sending needs an APNs key — see docs) ----
async function pushRegister(request, env) {
  const { uid, error } = await requireUser(request, env);
  if (error) return error;
  let b; try { b = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const tok = String(b.token || '').slice(0, 400);
  const platform = String(b.platform || 'ios').slice(0, 16);
  if (!tok) return json({ error: 'token required' }, 400);
  await env.DB.prepare(
    "INSERT INTO push_tokens (user_id, token, platform, created_at) VALUES (?1,?2,?3,?4) " +
    "ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id"
  ).bind(uid, tok, platform, Date.now()).run();
  return json({ ok: true });
}

// ---- unique, profanity-screened display names ----
const PROFANITY = ['fuck','shit','cunt','nigger','nigga','faggot','retard','bitch','dick','pussy','asshole','bastard','whore','slut','rape','nazi','kike','spic','chink','wank','prick','twat','cock'];
function isProfane(name) {
  const flat = String(name).toLowerCase()
    .replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/3/g, 'e').replace(/4@/g, 'a').replace(/5\$/g, 's').replace(/7/g, 't')
    .replace(/[^a-z]/g, '');
  return PROFANITY.some(w => flat.includes(w));
}
async function claimName(request, env) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const clientId = String(b.clientId || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  if (!clientId) return json({ error: 'bad client' }, 400);
  const userId = await currentUserId(request, env);
  const raw = cleanName(b.name);
  if (raw.length < 2) return json({ ok: false, reason: 'Too short' });
  if (isProfane(raw)) return json({ ok: false, reason: 'Not allowed' });
  const lc = raw.toLowerCase();
  const now = Date.now();
  const existing = await env.DB.prepare("SELECT client_id, user_id FROM names WHERE name_lc = ?1").bind(lc).first();
  if (existing) {
    const mine = existing.client_id === clientId || (userId && existing.user_id === userId);
    if (!mine) return json({ ok: false, reason: 'Taken' });
    await env.DB.prepare("UPDATE names SET name = ?2 WHERE name_lc = ?1").bind(lc, raw).run();
  } else {
    await env.DB.prepare("DELETE FROM names WHERE client_id = ?1").bind(clientId).run();  // one name per client
    await env.DB.prepare("INSERT INTO names (name_lc, name, client_id, user_id, created_at) VALUES (?1,?2,?3,?4,?5)").bind(lc, raw, clientId, userId, now).run();
  }
  // reflect the chosen name across this owner's existing rows so boards show it immediately
  await env.DB.prepare("UPDATE totals SET name = ?2 WHERE client_id = ?1").bind(clientId, raw).run();
  await env.DB.prepare("UPDATE scores SET name = ?2 WHERE client_id = ?1").bind(clientId, raw).run();
  return json({ ok: true, name: raw });
}

// ---- friends (feature #6) ----
async function addFriend(request, env) {
  const { uid, error } = await requireUser(request, env);
  if (error) return error;
  let b; try { b = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const handle = cleanName(b.handle);
  if (!handle) return json({ error: 'handle required' }, 400);
  // resolve handle -> the most-active matching user (handles are free-text, not unique)
  const target = await env.DB.prepare(
    "SELECT u.id FROM users u LEFT JOIN totals t ON t.user_id = u.id " +
    "WHERE u.handle = ?1 AND u.id <> ?2 GROUP BY u.id ORDER BY COALESCE(SUM(t.total_ms),0) DESC LIMIT 1"
  ).bind(handle, uid).first();
  if (!target) return json({ error: 'no player with that handle' }, 404);
  await env.DB.prepare("INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?1,?2,?3)")
    .bind(uid, target.id, Date.now()).run();
  return json({ ok: true });
}
async function listFriends(request, env) {
  const { uid, error } = await requireUser(request, env);
  if (error) return error;
  const r = await env.DB.prepare(
    "SELECT u.id, u.handle, COALESCE(SUM(t.total_ms),0) AS ms, COALESCE(SUM(t.plays),0) AS plays " +
    "FROM friendships f JOIN users u ON u.id = f.friend_id LEFT JOIN totals t ON t.user_id = u.id " +
    "WHERE f.user_id = ?1 GROUP BY u.id ORDER BY ms DESC LIMIT 200"
  ).bind(uid).all();
  return json({ friends: r.results || [] });
}

async function challengeScore(request, env, id) {
  const { uid, error } = await requireUser(request, env);
  if (error) return error;
  let b; try { b = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const score = clampInt(b.score, 0, SCORE_CAP);
  const now = Date.now();
  const ch = await env.DB.prepare("SELECT id, ends_at, starts_at FROM challenges WHERE id = ?1").bind(id).first();
  if (!ch) return json({ error: 'no such challenge' }, 404);
  if (now < ch.starts_at || now > ch.ends_at) return json({ error: 'challenge not active' }, 400);
  await env.DB.prepare(
    "INSERT INTO challenge_entries (challenge_id, user_id, best_score, updated_at) VALUES (?1,?2,?3,?4) " +
    "ON CONFLICT(challenge_id, user_id) DO UPDATE SET best_score = MAX(best_score, excluded.best_score), updated_at = excluded.updated_at"
  ).bind(id, uid, score, now).run();
  return json({ ok: true });
}
