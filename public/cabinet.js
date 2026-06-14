/* =====================================================================
   Anorak Arcade — game "cabinet" runtime (shared, zero-dependency).
   Opt-in via <body data-game="SHIFT">. Adds a sticky action bar,
   a bigger canvas on PC, an in-game per-game leaderboard, a mute
   toggle, fullscreen, and NEW-BEST feedback. Pairs with cabinet.css.
   Loads after juice.js + stats.js.
   ===================================================================== */
(() => {
  const GAME = (document.body && document.body.dataset && document.body.dataset.game || '').toUpperCase();
  if (!GAME) return;
  // Native app (Capacitor) shell: collapse the action bar into one ⚙ menu (the app sets .aa-native at document-start).
  const NATIVE = document.documentElement.classList.contains('aa-native');

  const COLORS = { CINDER:'#ff6a3d', SHIFT:'#5ad1ff', CONDUIT:'#b98cff', HOMEOSTAT:'#36d399', MOTHERLOAD:'#e8a13a' };
  const ACC = COLORS[GAME] || '#ffb13d';
  document.body.style.setProperty('--cab-acc', ACC);

  const esc = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- top action bar ---------- */
  const bar = document.createElement('div');
  bar.className = 'cab-bar';
  bar.innerHTML =
    '<a class="cab-home" href="index.html"><span class="dot"></span><span class="lbl">ARCADE</span></a>' +
    '<span class="cab-title">' + esc(GAME) + '</span>' +
    '<span class="cab-spacer"></span>' +
    '<button class="cab-btn cab-scores" type="button" title="This game’s leaderboard"><span class="ic">🏆</span><span class="lbl">SCORES</span><span class="badge"></span></button>' +
    '<a class="cab-btn cab-global" href="leaderboard.html" title="Global leaderboard — all games"><span class="ic">🌐</span><span class="lbl">GLOBAL</span></a>' +
    '<button class="cab-btn cab-sound" type="button" title="Sound"><span class="ic">🔊</span></button>' +
    '<button class="cab-btn cab-full" type="button" title="Fullscreen"><span class="ic">⛶</span></button>';
  document.body.insertBefore(bar, document.body.firstChild);
  const scoresBtn = bar.querySelector('.cab-scores');
  const soundBtn  = bar.querySelector('.cab-sound');
  const fullBtn   = bar.querySelector('.cab-full');

  /* ---------- bigger canvas on PC ---------- */
  const MAX_SCALE = 1.6;
  function canvasEl() { return document.querySelector('#wrap canvas') || document.querySelector('canvas'); }
  function fit() {
    const cv = canvasEl();
    if (!cv || !cv.width || !cv.height) return;
    // reset inline sizing first so we can measure the chrome (bar + header + HUD) above the canvas
    cv.style.width = cv.style.height = ''; cv.style.maxWidth = '';
    if (window.innerWidth < 760) return;      // phones/small tablets: each game's own CSS stays in charge
    const ar = cv.width / cv.height;
    const top = cv.getBoundingClientRect().top;          // vertical space already used above the canvas
    const availW = Math.min(window.innerWidth - 40, 1200);
    const availH = window.innerHeight - top - 18;        // leave the canvas fully on-screen
    const w = Math.max(cv.width * 0.6, Math.min(cv.width * MAX_SCALE, availW, availH * ar));
    cv.style.width = Math.round(w) + 'px';
    cv.style.height = Math.round(w / ar) + 'px';
    cv.style.maxWidth = '100%';
  }
  addEventListener('resize', fit, { passive: true });
  addEventListener('load', () => { fit(); requestAnimationFrame(fit); });
  if (document.readyState === 'complete') { fit(); requestAnimationFrame(fit); }
  // catch the game's own canvas init that runs just after us
  let tries = 0; const settle = setInterval(() => { fit(); if (++tries > 8) clearInterval(settle); }, 120);

  /* ---------- mute toggle (wraps Juice.tone — all sfx route through it) ---------- */
  const MKEY = 'aa.muted';
  let muted = false; try { muted = localStorage.getItem(MKEY) === '1'; } catch (e) {}
  let drawerSound = null;   // set in NATIVE mode: the sound control inside the menu drawer
  function applyMute() {
    soundBtn.querySelector('.ic').textContent = muted ? '🔇' : '🔊';
    soundBtn.style.color = muted ? 'var(--cab-dim)' : 'var(--cab-acc)';
    soundBtn.style.borderColor = muted ? '' : 'color-mix(in srgb,var(--cab-acc) 40%,var(--cab-line))';
    if (drawerSound) {
      drawerSound.querySelector('.ic').textContent = muted ? '🔇' : '🔊';
      drawerSound.classList.toggle('off', muted);
      const lbl = drawerSound.querySelector('.lbl'); if (lbl) lbl.textContent = muted ? 'MUTED' : 'SOUND';
    }
  }
  function toggleMute() {
    muted = !muted; try { localStorage.setItem(MKEY, muted ? '1' : '0'); } catch (e) {}
    if (!muted && window.Juice && Juice.unlock) Juice.unlock();
    if (window.Feel) Feel.tap();
    applyMute();
  }
  if (window.Juice && typeof Juice.tone === 'function') {
    const realTone = Juice.tone;
    Juice.tone = function () { if (muted) return; return realTone.apply(Juice, arguments); };
  }
  soundBtn.onclick = toggleMute;
  applyMute();

  /* ---------- fullscreen ---------- */
  fullBtn.onclick = () => {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen || function(){}).call(d);
    } else {
      (el.requestFullscreen || el.webkitRequestFullscreen || function(){}).call(el);
    }
  };
  document.addEventListener('fullscreenchange', () => requestAnimationFrame(fit));

  /* ---------- leaderboard drawer ---------- */
  const scrim = document.createElement('div');
  scrim.className = 'cab-scrim';
  scrim.innerHTML =
    '<div class="cab-drawer" role="dialog" aria-modal="true" aria-label="' + esc(GAME) + ' leaderboard">' +
      '<div class="cab-h"><span class="g">▶ ' + esc(GAME) + '</span> · HIGH SCORES' +
        '<button class="x" type="button" aria-label="Close">×</button></div>' +
      '<p class="cab-sub">Top scores on this game — climb the board, live.</p>' +
      '<div class="cab-you"><span class="lbl">YOU ARE</span> <span class="nm" id="cabYou">anonymous</span>' +
        '<button id="cabSetName" type="button">SET NAME</button></div>' +
      '<div id="cabBoard"><div class="cab-empty">Loading…</div></div>' +
      '<p class="cab-note">Names are arcade-style — pick anything. The full cross-game ' +
        '<a href="leaderboard.html">global leaderboard</a> lives on its own page.</p>' +
    '</div>';
  document.body.appendChild(scrim);
  const boardEl = scrim.querySelector('#cabBoard');
  const youEl   = scrim.querySelector('#cabYou');
  let open = false;

  function renderYou() {
    const n = window.GameStats && GameStats.getName && GameStats.getName();
    youEl.textContent = n || 'anonymous';
  }
  function rowHTML(rank, name, score, me) {
    return '<tr class="' + (me ? 'me' : '') + '"><td class="rank">' + rank + '</td>' +
           '<td class="nm">' + esc(name) + '</td>' +
           '<td class="sc">' + Number(score).toLocaleString() + '</td></tr>';
  }
  function refresh() {
    renderYou();
    if (!window.GameStats) { boardEl.innerHTML = '<div class="cab-empty">Scores unavailable.</div>'; return; }
    if (!GameStats.hasAPI) {
      const best = GameStats.localBest(GAME);
      boardEl.innerHTML = '<table class="cab-lb"><tr><th class="rank">#</th><th>NAME</th><th class="sc">SCORE</th></tr>' +
        (best > 0 ? rowHTML(1, GameStats.getName() || 'you', best, true)
                  : '<tr><td colspan="3" class="cab-empty">No local score yet — go play.</td></tr>') + '</table>';
      return;
    }
    boardEl.innerHTML = '<div class="cab-empty">Loading…</div>';
    GameStats.api('/api/leaderboard?game=' + GAME + '&limit=20').then(d => {
      const me = (GameStats.getName() || '').toLowerCase();
      const rows = d.top || [];
      if (!rows.length) { boardEl.innerHTML = '<div class="cab-empty">No scores yet — be the first.</div>'; return; }
      boardEl.innerHTML = '<table class="cab-lb"><tr><th class="rank">#</th><th>NAME</th><th class="sc">SCORE</th></tr>' +
        rows.map((r, i) => rowHTML(i + 1, r.name, r.score, r.name && r.name.toLowerCase() === me)).join('') + '</table>';
    }).catch(() => { boardEl.innerHTML = '<div class="cab-empty">Couldn’t reach the leaderboard.</div>'; });
  }
  function openDrawer() { open = true; if (window.Feel) Feel.select(); scrim.classList.add('open'); scoresBtn.classList.remove('flash'); refresh(); }
  function closeDrawer() { open = false; scrim.classList.remove('open'); }

  scoresBtn.onclick = openDrawer;
  scrim.querySelector('.x').onclick = closeDrawer;
  scrim.addEventListener('mousedown', e => { if (e.target === scrim) closeDrawer(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) closeDrawer(); });
  scrim.querySelector('#cabSetName').onclick = () => {
    if (window.GameStats && GameStats.promptName) GameStats.promptName(refresh); else refresh();
  };

  /* ---------- NEW BEST feedback (wrap submitScore) ---------- */
  const toast = document.createElement('div');
  toast.className = 'cab-toast';
  document.body.appendChild(toast);
  let toastT = 0;
  function showToast(msg) {
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 2200);
  }
  if (window.GameStats && typeof GameStats.submitScore === 'function') {
    const realSubmit = GameStats.submitScore;
    GameStats.submitScore = function (g, s) {
      const prev = (GameStats.localBest && GameStats.localBest(g)) || 0;
      const r = realSubmit.apply(GameStats, arguments);
      const sc = Math.max(0, Math.round(s || 0));
      if (sc > 0 && sc > prev && String(g).toUpperCase() === GAME) {
        showToast('★ NEW BEST · ' + sc.toLocaleString());
        if (window.Feel) Feel.success();
        scoresBtn.classList.add('flash');
        if (open) setTimeout(refresh, 600);
      }
      return r;
    };
  }

  /* ---------- native app shell: one ⚙ menu instead of the 4-button bar ---------- */
  if (NATIVE) {
    // turn the SCORES button into the single menu opener
    scoresBtn.querySelector('.ic').textContent = '⚙';
    scoresBtn.setAttribute('title', 'Menu — scores, sound, leaderboard');
    const lbl = scoresBtn.querySelector('.lbl'); if (lbl) lbl.textContent = 'MENU';
    // fold sound / global / back-to-arcade into the drawer as an options row (CSS hides the bar buttons)
    const opts = document.createElement('div');
    opts.className = 'cab-opts';
    opts.innerHTML =
      '<button type="button" class="cab-opt cab-opt-sound"><span class="ic">🔊</span><span class="lbl">SOUND</span></button>' +
      '<a class="cab-opt" href="leaderboard.html"><span class="ic">🌐</span><span class="lbl">GLOBAL</span></a>' +
      '<a class="cab-opt" href="index.html"><span class="ic">◂</span><span class="lbl">ARCADE</span></a>';
    const drawer = scrim.querySelector('.cab-drawer');
    drawer.insertBefore(opts, scrim.querySelector('#cabBoard'));
    drawerSound = opts.querySelector('.cab-opt-sound');
    drawerSound.onclick = toggleMute;
    applyMute();
  }

  renderYou();
})();
