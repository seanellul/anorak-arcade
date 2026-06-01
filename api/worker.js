// Anorak Arcade — leaderboard API (Cloudflare Worker + D1)
// Routes:
//   POST /api/sync          {clientId,name,game,addMs,plays,score}  -> upsert totals
//   GET  /api/leaderboard?game=CINDER&limit=20                      -> top names by best score
//   GET  /api/stats                                                 -> global time + per-game
//   GET  /api/admin?key=...                                         -> full name x game breakdown (secret)
// CORS-open so the games can be embedded anywhere.

const GAMES = ['CINDER', 'SHIFT', 'CONDUIT', 'HOMEOSTAT', 'NOVA', 'SURGE', 'CLEAVE', 'FLUX', 'MOTHERLOAD'];
const SCORE_CAP = 50000000;       // absurd-value guard (per-game scores stay well under this)
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
      if (request.method === 'GET'  && path === '/api/leaderboard') return await leaderboard(url, env);
      if (request.method === 'GET'  && path === '/api/stats')       return await stats(env);
      if (request.method === 'GET'  && path === '/api/admin')       return await admin(url, env);
      if (request.method === 'GET'  && path === '/api/health')      return json({ ok: true });
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, 500);
    }
    return json({ error: 'not found' }, 404);
  },
};

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

  await env.DB.prepare(
    "INSERT INTO totals (client_id, game, name, total_ms, plays, best_score, created_at, updated_at) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7) " +
    "ON CONFLICT(client_id, game) DO UPDATE SET " +
    "  total_ms = total_ms + excluded.total_ms, " +
    "  plays = plays + excluded.plays, " +
    "  best_score = MAX(best_score, excluded.best_score), " +
    "  name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE name END, " +
    "  updated_at = excluded.updated_at"
  ).bind(clientId, game, name, addMs, plays, score, now).run();

  return json({ ok: true });
}

async function leaderboard(url, env) {
  const limit = clampInt(url.searchParams.get('limit') || 20, 1, 100);
  const game = String(url.searchParams.get('game') || '').toUpperCase();
  if (game && GAMES.indexOf(game) >= 0) {
    const r = await env.DB.prepare(
      "SELECT CASE WHEN name <> '' THEN name ELSE 'anon' END AS name, MAX(best_score) AS score, SUM(total_ms) AS ms FROM totals " +
      "WHERE game = ?1 AND best_score > 0 " +
      "GROUP BY CASE WHEN name <> '' THEN name ELSE client_id END ORDER BY score DESC, ms DESC LIMIT ?2"
    ).bind(game, limit).all();
    return json({ game, top: r.results || [] });
  }
  const out = {};
  for (const g of GAMES) {
    const r = await env.DB.prepare(
      "SELECT CASE WHEN name <> '' THEN name ELSE 'anon' END AS name, MAX(best_score) AS score FROM totals " +
      "WHERE game = ?1 AND best_score > 0 " +
      "GROUP BY CASE WHEN name <> '' THEN name ELSE client_id END ORDER BY score DESC LIMIT 5"
    ).bind(g).all();
    out[g] = r.results || [];
  }
  return json({ boards: out });
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
