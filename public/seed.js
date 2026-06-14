// Anorak Arcade — deterministic RNG + daily seed.  window.AASeed
// Lets a game run a "Daily" board (everyone gets the same layout today, leaderboard is a fair
// race) or a "Free" board (fresh every run). All gameplay randomness should draw from a seeded
// rng so a daily run is reproducible; cosmetic jitter (particles, shake) can stay Math.random().
(function () {
  // string -> 32-bit seed generator (xmur3)
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  // 32-bit seed -> uniform [0,1) generator (mulberry32)
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFrom(seedStr) {
    const s = xmur3(String(seedStr));
    const r = mulberry32(s());
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.int = (lo, hi) => Math.floor(r.range(lo, hi + 1));   // inclusive both ends
    r.pick = a => a[Math.floor(r() * a.length)];
    r.chance = p => r() < p;
    r.seedStr = String(seedStr);
    return r;
  }
  // UTC day key so "today's board" is the same for everyone regardless of timezone.
  function dailyKey() {
    const d = new Date();
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  }
  function uuid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'r' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
  }
  window.AASeed = {
    rngFrom, dailyKey, uuid,
    daily(game) { return rngFrom(game + '|' + dailyKey()); },
    free(game) { return rngFrom(game + '|' + uuid()); },
  };
})();
