/* =====================================================================
   Anorak Arcade — native app shell (app-only; loaded by the Capacitor
   shell on every page). Inert/absent on the web. Implements, against the
   design philosophy in docs/native-experience.md:
     #2 spatial nav (page enter + outgoing accent veil)
     #3 zero-dead-air loading veil
     #4 bottom tab bar + home hub
     #5 profile (You) sheet + generative avatar
     #6 friends sheet  #7 share/invite  #8 daily challenge card + streak
     #9 swipe-back, sheets, settings (Feel level), 44pt targets
     #10 universal new-best confetti + Feel
   ===================================================================== */
(function () {
  if (!document.documentElement.classList.contains('aa-native')) return;
  var API = 'https://anorak-arcade-api.sean-ellul.workers.dev';
  var GAMES = ['CINDER','SHIFT','CONDUIT','HOMEOSTAT','NOVA','SURGE','CLEAVE','FLUX','WEAVE','PULSE'];
  var ACCENT = { cinder:'#ff6a3d', shift:'#5ad1ff', conduit:'#b98cff', homeostat:'#36d399',
    nova:'#ff5ec7', surge:'#ffd23f', cleave:'#3fe0c2', flux:'#6c8cff', weave:'#d6f84a',
    pulse:'#ff2e4d', motherload:'#e8a13a', ecotone:'#7fc24a' };
  var SLUG_OF = { CINDER:'cinder', SHIFT:'shift', CONDUIT:'conduit', HOMEOSTAT:'homeostat',
    NOVA:'nova', SURGE:'surge', CLEAVE:'cleave', FLUX:'flux', WEAVE:'weave', PULSE:'pulse',
    MOTHERLOAD:'motherload', ECOTONE:'ecotone' };
  var de = document.documentElement;
  var isGame = de.classList.contains('aa-game');
  var path = location.pathname.split('/').pop() || 'index.html';
  var feel = function (verb) { try { if (window.Feel && Feel[verb]) Feel[verb](); } catch (e) {} };

  // ---- token + tiny API ----
  var lget = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var token = function () { return lget('aa.token') || ''; };
  function api(method, p, body) {
    var h = { 'Content-Type': 'application/json' };
    if (token()) h['Authorization'] = 'Bearer ' + token();
    return fetch(API + p, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .catch(function () { return null; });
  }

  /* ===================================================================
     #2/#3 — outgoing accent veil on navigations (masks the document swap)
     =================================================================== */
  var veil = document.createElement('div'); veil.className = 'aa-veil';
  veil.innerHTML = '<span class="mark"></span><span class="nm"></span>';
  document.body.appendChild(veil);
  function showVeil(accent, name) {
    veil.style.setProperty('--aa-veil-acc', accent || '#e8a13a');
    veil.querySelector('.nm').textContent = name || '';
    veil.classList.add('show');
  }
  // intercept same-origin link clicks to other pages → flash the target's accent, then go
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href[0] === '#' || /^(https?:|mailto:|tel:)/.test(href) || a.target === '_blank') return;
    var slug = (href.replace(/index\.html$/, '').replace(/\/$/, '').replace(/\.html$/, '').split('/').pop() || '').toLowerCase();
    var acc = ACCENT[slug];
    if (acc) showVeil(acc, slug.toUpperCase());          // a game link → branded veil
    else showVeil('#e8a13a', '');                         // a shell link → brand veil
    // let navigation proceed normally (veil is painted this frame, new doc replaces it)
  }, true);
  // pageshow from bfcache: hide any stale veil
  window.addEventListener('pageshow', function () { veil.classList.remove('show'); });

  /* ===================================================================
     Sheets framework (#5/#6/#9)
     =================================================================== */
  function makeSheet(title, sub) {
    var scrim = document.createElement('div'); scrim.className = 'aa-scrim';
    var sheet = document.createElement('div'); sheet.className = 'aa-sheet';
    sheet.innerHTML = '<div class="grab"></div><h3>' + title + '</h3>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '<div class="body"></div>';
    scrim.appendChild(sheet); document.body.appendChild(scrim);
    function close() { scrim.classList.remove('open'); }
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    // swipe-down to dismiss
    var sy = 0, dy = 0, drag = false;
    sheet.addEventListener('touchstart', function (e) { sy = e.touches[0].clientY; drag = sheet.scrollTop <= 0; dy = 0; }, { passive: true });
    sheet.addEventListener('touchmove', function (e) { if (!drag) return; dy = e.touches[0].clientY - sy; if (dy > 0) sheet.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
    sheet.addEventListener('touchend', function () { sheet.style.transform = ''; if (dy > 90) close(); });
    return {
      el: scrim, body: sheet.querySelector('.body'), close: close,
      open: function () { feel('select'); scrim.classList.add('open'); }
    };
  }

  /* ---- generative avatar (deterministic from a handle) ---- */
  function avatar(name) {
    var s = String(name || 'anon'); var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    var hue = h % 360, hue2 = (hue + 60 + (h >> 8) % 120) % 360;
    var c1 = 'hsl(' + hue + ',70%,58%)', c2 = 'hsl(' + hue2 + ',65%,48%)', bg = 'hsl(' + hue + ',30%,12%)';
    var cells = ''; var r = h;
    for (var y = 0; y < 5; y++) for (var x = 0; x < 3; x++) {
      r = (r * 1103515245 + 12345) >>> 0;
      if (r % 2) { var col = (r >> 3) % 2 ? c1 : c2; cells += '<rect x="' + (x * 20) + '" y="' + (y * 20) + '" width="20" height="20" fill="' + col + '"/>'; cells += '<rect x="' + ((4 - x) * 20) + '" y="' + (y * 20) + '" width="20" height="20" fill="' + col + '"/>'; }
    }
    return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="' + bg + '"/><g transform="translate(0,0)">' + cells + '</g></svg>';
  }

  /* ---- local stats helpers (work offline / signed-out) ---- */
  function localStats() {
    var d = {}; try { d = JSON.parse(lget('aa.stats')) || {}; } catch (e) {}
    var ms = 0, plays = 0, played = 0, last = null, lastG = null;
    for (var g in d) { var e = d[g]; ms += e.ms || 0; plays += e.sessions || 0; if ((e.ms || 0) > 0) played++; if (e.last && (!last || e.last > last)) { last = e.last; lastG = g; } }
    return { ms: ms, plays: plays, played: played, lastGame: lastG, raw: d };
  }
  function fmtTime(ms) { var m = Math.floor(ms / 60000); if (m < 60) return m + 'm'; var h = Math.floor(m / 60); return h + 'h ' + (m % 60) + 'm'; }

  /* ===================================================================
     #5 — Profile (You) sheet  (+ #1/#10 settings: Feel level)
     =================================================================== */
  var profileSheet;
  function openProfile() {
    if (!profileSheet) profileSheet = makeSheet('YOU', 'Your arcade — progress, settings, sign-in.');
    profileSheet.open();
    renderProfile();
  }
  function settingsBlock() {
    var hOn = lget('aa.haptics') !== '0';
    var juice = lget('aa.juice') || 'full';
    return '<div class="aa-row"><span class="lbl">Haptics</span>' +
        '<div class="aa-seg" data-set="haptics"><button data-v="1" class="' + (hOn ? 'on' : '') + '">ON</button><button data-v="0" class="' + (!hOn ? 'on' : '') + '">OFF</button></div></div>' +
      '<div class="aa-row"><span class="lbl">Feel / juice</span>' +
        '<div class="aa-seg" data-set="juice"><button data-v="full" class="' + (juice === 'full' ? 'on' : '') + '">FULL</button><button data-v="subtle" class="' + (juice === 'subtle' ? 'on' : '') + '">SUBTLE</button><button data-v="off" class="' + (juice === 'off' ? 'on' : '') + '">OFF</button></div></div>';
  }
  function wireSettings(root) {
    root.querySelectorAll('.aa-seg').forEach(function (seg) {
      seg.querySelectorAll('button').forEach(function (b) {
        b.onclick = function () {
          feel('tap');
          var key = seg.getAttribute('data-set'), v = b.getAttribute('data-v');
          if (key === 'haptics') { try { localStorage.setItem('aa.haptics', v === '1' ? '1' : '0'); } catch (e) {} }
          if (key === 'juice') { try { localStorage.setItem('aa.juice', v); } catch (e) {} de.setAttribute('data-juice', v); }
          seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
        };
      });
    });
  }
  function renderProfile() {
    var b = profileSheet.body;
    var s = localStats();
    var signedIn = !!token();
    b.innerHTML =
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:6px">' +
        '<div class="aa-avatar">' + avatar(lget('aa.name') || 'anon') + '</div>' +
        '<div style="flex:1"><div style="font-size:18px;font-weight:700;letter-spacing:.04em">' + (lget('aa.name') || 'anonymous') + '</div>' +
        '<div class="hint">' + (signedIn ? 'Signed in with Apple' : 'Guest — progress saved on this device') + '</div></div></div>' +
      '<div class="aa-stats">' +
        '<div class="aa-stat"><b>' + fmtTime(s.ms) + '</b><span>PLAYED</span></div>' +
        '<div class="aa-stat"><b>' + s.played + '</b><span>GAMES</span></div>' +
        '<div class="aa-stat"><b>' + s.plays + '</b><span>RUNS</span></div>' +
      '</div>' +
      (signedIn ? '' : '<button class="aa-btn" id="aaSignIn"> Sign in with Apple</button>') +
      '<div id="aaCompete"></div>' +
      '<h3 style="margin-top:20px;font-size:12px;letter-spacing:.18em;color:var(--aa-dim)">SETTINGS</h3>' +
      settingsBlock();
    wireSettings(b);
    var si = b.querySelector('#aaSignIn'); if (si) si.onclick = signInWithApple;
    // signed in: the PLAYED/GAMES/RUNS tiles show the ACCOUNT totals (server), not just
    // this device — otherwise a reinstall wrongly reads 0.
    if (token()) api('GET', '/api/me').then(function (d) {
      if (!d || !d.stats) return;
      var grid = b.querySelector('.aa-stats'); if (!grid) return;
      grid.innerHTML =
        '<div class="aa-stat"><b>' + fmtTime(d.stats.ms || 0) + '</b><span>PLAYED</span></div>' +
        '<div class="aa-stat"><b>' + (d.stats.games || 0) + '</b><span>GAMES</span></div>' +
        '<div class="aa-stat"><b>' + (d.stats.plays || 0) + '</b><span>RUNS</span></div>';
    });
    // competitive standing — world ranks per game + #games you lead
    var nm = lget('aa.name');
    if (nm) api('GET', '/api/profile?name=' + encodeURIComponent(nm)).then(function (d) {
      var box = b.querySelector('#aaCompete'); if (!box || !d || !d.games) return;
      var lead = d.worldNo1 || 0;
      var arcade = d.arcadeScore || 0;
      var division = d.division || '';
      var top = d.games.slice(0, 6);
      box.innerHTML =
        (arcade > 0 ? '<div class="aa-arcade"><span class="lab">ARCADE SCORE</span><span class="val">' + Number(arcade).toLocaleString() + '</span><span class="sub">' + (division ? '<span class="aa-div div-' + division.toLowerCase() + '">' + esc(division) + '</span> · ' : '') + 'across ' + top.length + ' game' + (top.length > 1 ? 's' : '') + '</span></div>' : '') +
        (lead > 0 ? '<div class="aa-crown">👑 World #1 in <b>' + lead + '</b> game' + (lead > 1 ? 's' : '') + '</div>' : '') +
        '<h3 style="margin-top:18px;font-size:12px;letter-spacing:.18em;color:var(--aa-dim)">YOUR RANKS</h3>' +
        (top.length ? '<div class="aa-list">' + top.map(function (g) {
          var medal = g.rank === 1 ? '🥇' : g.rank === 2 ? '🥈' : g.rank === 3 ? '🥉' : '#' + g.rank;
          return '<div class="li"><span class="rk" style="width:34px">' + medal + '</span><span class="nm">' + esc(g.game) + '</span><span class="sc">' + Number(g.best).toLocaleString() + '</span></div>';
        }).join('') + '</div>' : '<div class="aa-empty">Play a game to get ranked.</div>');
    });
    if (signedIn) {
      api('GET', '/api/me').then(function (d) {
        if (d && d.user) {
          var grid = b.querySelector('.aa-stats');
          if (d.stats) grid.innerHTML =
            '<div class="aa-stat"><b>' + fmtTime(d.stats.ms || 0) + '</b><span>PLAYED</span></div>' +
            '<div class="aa-stat"><b>' + (d.stats.games || 0) + '</b><span>GAMES</span></div>' +
            '<div class="aa-stat"><b>' + (d.stats.plays || 0) + '</b><span>RUNS</span></div>';
        }
      });
    }
  }

  /* ===================================================================
     #6 — Friends sheet   #7 — invite/share
     =================================================================== */
  var friendsSheet;
  function openFriends() {
    if (!friendsSheet) friendsSheet = makeSheet('FRIENDS', 'Add friends, see their bests, climb past them.');
    friendsSheet.open(); renderFriends();
  }
  function renderFriends() {
    var b = friendsSheet.body;
    if (!token()) {
      b.innerHTML = '<p class="aa-empty">Sign in to add friends and share a board.</p>' +
        '<button class="aa-btn" id="aaFSignIn"> Sign in with Apple</button>' +
        '<button class="aa-btn ghost" id="aaInvite" style="margin-top:10px">Invite a friend</button>';
      b.querySelector('#aaFSignIn').onclick = signInWithApple;
      b.querySelector('#aaInvite').onclick = shareInvite;
      return;
    }
    b.innerHTML =
      '<div class="aa-row" style="gap:8px"><input class="aa-input" id="aaAddF" placeholder="add by handle"/>' +
        '<button class="aa-btn" style="width:auto;padding:0 16px" id="aaAddBtn">ADD</button></div>' +
      '<div class="aa-list" id="aaFList"><div class="aa-empty">Loading…</div></div>' +
      '<h3 style="margin-top:18px;font-size:12px;letter-spacing:.18em;color:var(--aa-dim)">ACTIVITY</h3>' +
      '<div class="aa-feed" id="aaFeed"><div class="aa-empty">Loading…</div></div>' +
      '<button class="aa-btn ghost" id="aaInvite" style="margin-top:14px">Invite a friend</button>';
    b.querySelector('#aaInvite').onclick = shareInvite;
    b.querySelector('#aaAddBtn').onclick = function () {
      var v = b.querySelector('#aaAddF').value.trim(); if (!v) return; feel('commit');
      api('POST', '/api/friends/add', { handle: v }).then(function () { renderFriends(); });
    };
    api('GET', '/api/friends').then(function (d) {
      var list = b.querySelector('#aaFList'); if (!list) return;
      var fr = (d && d.friends) || [];
      if (!fr.length) { list.innerHTML = '<div class="aa-empty">No friends yet — add one above or invite.</div>'; return; }
      list.innerHTML = fr.map(function (f, i) {
        return '<div class="li"><span class="rk">' + (i + 1) + '</span><span class="nm">' + esc(f.handle) + '</span><span class="sc">' + (f.ms ? fmtTime(f.ms) : '') + '</span></div>';
      }).join('');
    });
    renderFeed(b.querySelector('#aaFeed'));
  }
  // turn raw events into a human activity line ("Kai passed you in CINDER")
  function feedLine(e) {
    var pay = {}; try { pay = JSON.parse(e.payload || '{}'); } catch (x) {}
    var g = esc(e.game || ''), who = esc(e.actor || 'someone'), sc = pay.score ? Number(pay.score).toLocaleString() : '';
    if (e.own && e.kind === 'overtaken') return '<span class="ic">⚔</span><span class="tx"><b>' + who + '</b> passed you in <b>' + g + '</b> — defend your spot</span>';
    if (e.own && e.kind === 'no1') return '<span class="ic">👑</span><span class="tx">You took <b>#1</b> in <b>' + g + '</b></span>';
    if (!e.own && e.kind === 'no1') return '<span class="ic">👑</span><span class="tx"><b>' + who + '</b> is <b>#1</b> in <b>' + g + '</b></span>';
    if (!e.own && e.kind === 'best') return '<span class="ic">▲</span><span class="tx"><b>' + who + '</b> set a new <b>' + g + '</b> best' + (sc ? ' · ' + sc : '') + '</span>';
    return '';
  }
  function renderFeed(box) {
    if (!box) return;
    api('GET', '/api/feed').then(function (d) {
      var evs = ((d && d.events) || []).filter(function (e) { return !(e.own && e.kind === 'best'); });   // own bests are noise
      var lines = evs.map(feedLine).filter(Boolean);
      box.innerHTML = lines.length ? lines.map(function (l) { return '<div class="fi">' + l + '</div>'; }).join('') : '<div class="aa-empty">No activity yet — play a game or add friends.</div>';
    }).catch(function () { box.innerHTML = '<div class="aa-empty">Couldn’t load activity.</div>'; });
  }
  function shareInvite() {
    feel('tap');
    var ref = encodeURIComponent(lget('aa.name') || 'a friend');
    var url = 'https://anorak-arcade.pages.dev/?ref=' + ref;
    doShare('Play Anorak Arcade with me', ref + ' challenges you to beat their scores in Anorak Arcade — a pocket arcade of tiny games.', url);
  }
  function shareScore(game, score) {
    var slug = SLUG_OF[String(game).toUpperCase()] || '';
    var url = 'https://anorak-arcade.pages.dev/' + (slug ? (['motherload', 'ecotone'].indexOf(slug) >= 0 ? slug + '/index.html' : slug + '.html') : '');
    doShare(game + ' — Anorak Arcade', 'I just scored ' + Number(score).toLocaleString() + ' in ' + game + '. Can you beat it?', url);
  }
  function doShare(title, text, url) {
    if (navigator.share) { navigator.share({ title: title, text: text, url: url }).catch(function () {}); }
    else { try { navigator.clipboard.writeText(text + ' ' + url); } catch (e) {} }
  }

  /* ---- Sign in with Apple (needs the SiwA capability enabled in Xcode) ---- */
  function signInWithApple() {
    feel('tap');
    var Cap = window.Capacitor, P = Cap && Cap.Plugins && Cap.Plugins.SignInWithApple;
    if (!P) { alert('Sign-in needs the native app build.'); return Promise.resolve(false); }
    return P.authorize({ requestedScopes: [0, 1] }).then(function (res) {
      var r = res && res.response || {};
      var fullName = [r.givenName, r.familyName].filter(Boolean).join(' ');
      return api('POST', '/api/auth/apple', { identityToken: r.identityToken, fullName: fullName, clientId: lget('aa.clientId') || '' });
    }).then(function (d) {
      if (d && d.token) { try { localStorage.setItem('aa.token', d.token); if (d.user && d.user.handle) localStorage.setItem('aa.name', d.user.handle); } catch (e) {} feel('success'); if (profileSheet) renderProfile(); if (friendsSheet) renderFriends(); return true; }
      return false;
    }).catch(function () { return false; });
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }

  /* ===================================================================
     #4 — bottom tab bar (shell pages) + home hub (#8 daily, continue)
     =================================================================== */
  function buildTabBar() {
    de.classList.add('aa-shell');
    var bar = document.createElement('nav'); bar.className = 'aa-tabbar';
    function tab(ic, label, active, onclick, href) {
      var el = href ? document.createElement('a') : document.createElement('button');
      el.className = 'aa-tab' + (active ? ' active' : '');
      if (href) el.href = href;
      el.innerHTML = '<span class="ic">' + ic + '</span><span>' + label + '</span>';
      if (onclick) el.onclick = function (e) { e.preventDefault(); feel('select'); onclick(); };
      else el.addEventListener('click', function () { feel('select'); });
      return el;
    }
    var onHome = path === 'index.html' || path === '';
    var onBoard = path === 'leaderboard.html';
    var onYou = path === 'profile.html';
    bar.appendChild(tab('◈', 'PLAY', onHome, null, 'index.html'));
    bar.appendChild(tab('🏆', 'BOARD', onBoard, null, 'leaderboard.html'));
    bar.appendChild(tab('👥', 'FRIENDS', false, openFriends));
    bar.appendChild(tab('◐', 'YOU', onYou, null, 'profile.html'));   // dedicated profile page (self)
    document.body.appendChild(bar);
  }
  /* ---- favourites ---- */
  function favs() { try { return JSON.parse(lget('aa.favs')) || []; } catch (e) { return []; } }
  function isFav(slug) { return favs().indexOf(slug) >= 0; }
  function toggleFav(slug) { var f = favs(); var i = f.indexOf(slug); if (i >= 0) f.splice(i, 1); else f.push(slug); try { localStorage.setItem('aa.favs', JSON.stringify(f)); } catch (e) {} return i < 0; }
  function bestOf(id) { try { return (window.GameStats && GameStats.localBest && GameStats.localBest(id)) || 0; } catch (e) { return 0; } }
  function entryHref(g) { return g.entry || (g.slug + '.html'); }

  /* ---- home hub (daily + continue + streak) ---- */
  function hubHTML() {
    var s = localStats();
    var dayNo = Math.floor(Date.now() / 86400000);
    var daily = GAMES[dayNo % GAMES.length], dslug = SLUG_OF[daily], dacc = ACCENT[dslug];
    var streak = parseInt(lget('aa.streak') || '0', 10) || 0;
    var sDay = parseInt(lget('aa.streakDay') || '0', 10) || 0;
    if (sDay !== dayNo) { streak = (sDay === dayNo - 1) ? streak + 1 : 1; try { localStorage.setItem('aa.streak', String(streak)); localStorage.setItem('aa.streakDay', String(dayNo)); } catch (e) {} }
    var streakStr = streak > 1 ? '🔥 ' + streak + '-day · ' : '';
    var h = '<div class="aa-hub"><a class="card" href="' + dslug + '.html" style="--aa-card-acc:' + dacc + '">' +
      '<span class="ic">📅</span><span class="t"><b>DAILY · ' + daily + '</b><span>' + streakStr + 'Same seed for everyone today</span></span><span class="go">▶</span></a>';
    if (s.lastGame) {
      var lslug = SLUG_OF[s.lastGame] || s.lastGame.toLowerCase(), lacc = ACCENT[lslug] || '#e8a13a';
      var lhref = ['motherload', 'ecotone'].indexOf(lslug) >= 0 ? lslug + '/index.html' : lslug + '.html';
      h += '<a class="card" href="' + lhref + '" style="--aa-card-acc:' + lacc + '"><span class="ic">↺</span><span class="t"><b>CONTINUE · ' + s.lastGame + '</b><span>Back to your last game</span></span><span class="go">▶</span></a>';
    }
    return h + '</div>';
  }

  /* ---- #4 native mobile home rendered from catalog.json ---- */
  var _catalog = null, _filter = 'all';
  function buildHome() {
    de.classList.add('aa-home');
    var root = document.createElement('div'); root.className = 'aa-home';
    document.body.appendChild(root);
    fetch('/catalog.json').then(function (r) { return r.json(); }).then(function (c) {
      _catalog = (c && c.games) || []; renderHome(root);
    }).catch(function () { _catalog = []; renderHome(root); });
  }
  function gcard(g, i) {
    var mobile = (g.platforms || []).indexOf('mobile') >= 0;
    var best = bestOf(g.id);
    // card = live preview (reusing the home demo engine) + a compact caption
    return '<div class="aa-gcard' + (mobile ? '' : ' locked') + '" role="button" tabindex="0" data-slug="' + g.slug + '" style="--ga:' + g.accent + ';animation-delay:' + (i * 28) + 'ms">' +
      '<span class="prevwrap"><canvas class="aa-prev" data-demo="' + g.slug + '"></canvas>' +
        (mobile ? '' : '<span class="tagd">DESKTOP</span>') +
        (best > 0 ? '<span class="bestov">' + Number(best).toLocaleString() + '</span>' : '') + '</span>' +
      '<div class="cap"><h4>' + esc(g.title) + '</h4>' +
        '<span class="fav' + (isFav(g.slug) ? ' on' : '') + '" role="button" data-fav="' + g.slug + '" aria-label="favourite">' + (isFav(g.slug) ? '★' : '☆') + '</span></div>' +
      '</div>';
  }
  function renderHome(root) {
    var all = _catalog;
    var playable = all.filter(function (g) { return (g.platforms || []).indexOf('mobile') >= 0; });
    var desktop = all.filter(function (g) { return (g.platforms || []).indexOf('mobile') < 0; });
    var list = _filter === 'fav' ? playable.filter(function (g) { return isFav(g.slug); }) : playable;
    var html = '<div class="top"><span class="dot"></span><span class="wm">ARCADE</span><span class="count">' + playable.length + ' games</span></div>';
    html += hubHTML();
    html += '<div class="aa-filter"><button data-f="all" class="' + (_filter === 'all' ? 'on' : '') + '">ALL</button><button data-f="fav" class="' + (_filter === 'fav' ? 'on' : '') + '">★ FAVES</button></div>';
    html += '<div class="aa-grid">' + (list.length ? list.map(gcard).join('') : '<div class="aa-empty" style="grid-column:1/-1">No favourites yet — tap ☆ on a game.</div>') + '</div>';
    if (_filter === 'all' && desktop.length) html += '<div class="aa-sec">FULL GAMES · DESKTOP</div><div class="aa-grid">' + desktop.map(gcard).join('') + '</div>';
    root.innerHTML = html;
    // wire
    root.querySelectorAll('.aa-filter button').forEach(function (b) { b.onclick = function () { feel('select'); _filter = b.getAttribute('data-f'); renderHome(root); }; });
    root.querySelectorAll('.fav').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); var on = toggleFav(b.getAttribute('data-fav')); feel('tap'); b.classList.toggle('on', on); b.textContent = on ? '★' : '☆'; if (_filter === 'fav') renderHome(root); }; });
    root.querySelectorAll('.aa-gcard').forEach(function (b) { b.onclick = function () { var g = all.find(function (x) { return x.slug === b.getAttribute('data-slug'); }); if (g) openGameDetail(g); }; });
    // paint the live previews (reuse the home demo engine) once laid out
    requestAnimationFrame(function () {
      root.querySelectorAll('canvas.aa-prev').forEach(function (cv) {
        if (window.AABootDemo) window.AABootDemo(cv, cv.getAttribute('data-demo'));
      });
    });
  }
  var detailSheet;
  function openGameDetail(g) {
    if (!detailSheet) {
      detailSheet = makeSheet('', '');
      var ds = detailSheet.el.querySelector('.aa-sheet'); ds.classList.add('aa-detail');
      var oh = ds.querySelector('h3'); if (oh) oh.style.display = 'none';
    }
    var best = bestOf(g.id);
    var mobile = (g.platforms || []).indexOf('mobile') >= 0;
    detailSheet.body.innerHTML =
      '<div class="hdr" style="--gd:' + g.accent + '"><span class="badge"></span><div><div class="v">' + esc(g.verb || '') + '</div><h3>' + esc(g.title) + '</h3></div></div>' +
      '<p class="blurb">' + esc(g.blurb || g.tag || '') + '</p>' +
      (best > 0 ? '<div class="best">Your best · <b>' + Number(best).toLocaleString() + '</b></div>' : '') +
      '<button class="aa-btn" id="aaPlay">' + (mobile ? '▶ PLAY' : '▶ PLAY · desktop-built') + '</button>' +
      (mobile ? '' : '<p class="best" style="margin-top:10px;text-align:center">Best on a computer — touch controls aren’t ready yet.</p>');
    detailSheet.body.parentNode.style.setProperty('--gd', g.accent);
    var play = detailSheet.body.querySelector('#aaPlay');
    play.onclick = function () { feel('commit'); showVeil(g.accent, g.title); location.href = entryHref(g); };
    detailSheet.open();
  }

  /* ---- game pages: one floating PAUSE button → a pause menu with
          Resume / Scores / Settings / Home (replaces the back + ⚙ buttons) ---- */
  function gameId() { return (document.body && document.body.dataset && document.body.dataset.game) || path.replace(/\.html$/, '').toUpperCase(); }
  function pauseGame() { try { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' })); } catch (e) {} }
  var pauseEl;
  // Every game's game-over screen is `#over` with an `#again` restart button — give them
  // all a consistent HOME button right after it (no per-game edits needed).
  function wireGameOverHome() {
    var again = document.getElementById('again');
    if (!again || again.parentNode.querySelector('.aa-overhome')) return;
    var home = document.createElement('a');
    home.className = 'aa-overhome'; home.href = 'index.html'; home.textContent = '⌂ HOME';
    home.onclick = function () { feel('select'); showVeil('#e8a13a', ''); };
    again.parentNode.insertBefore(home, again.nextSibling);
  }
  function buildPause() {
    var btn = document.createElement('button'); btn.className = 'aa-pausebtn'; btn.innerHTML = '❙❙'; btn.setAttribute('aria-label', 'Pause');
    btn.onclick = openPause; document.body.appendChild(btn);
    pauseEl = document.createElement('div'); pauseEl.className = 'aa-pause';
    pauseEl.innerHTML =
      '<div class="pt">PAUSED · ' + esc(gameId()) + '</div>' +
      '<button class="aa-btn" id="aaResume">▶ RESUME</button>' +
      '<div class="pmenu">' +
        '<a class="pbtn" id="aaPHome" href="index.html"><span class="ic">⌂</span><span>HOME</span></a>' +
        '<button class="pbtn" id="aaPScores"><span class="ic">🏆</span><span>SCORES</span></button>' +
        '<button class="pbtn" id="aaPSettings"><span class="ic">⚙</span><span>SETTINGS</span></button>' +
      '</div>';
    document.body.appendChild(pauseEl);
    pauseEl.querySelector('#aaResume').onclick = resumeGame;
    pauseEl.querySelector('#aaPScores').onclick = function () { feel('select'); openScores(gameId()); };
    pauseEl.querySelector('#aaPSettings').onclick = function () { feel('select'); openSettings(); };
    pauseEl.querySelector('#aaPHome').onclick = function () { feel('select'); showVeil('#e8a13a', ''); };
  }
  function openPause() { feel('select'); pauseGame(); pauseEl.classList.add('open'); }
  function resumeGame() { feel('tap'); pauseEl.classList.remove('open'); pauseGame(); }

  /* ---- settings sheet (reused by profile + pause) ---- */
  var settingsSheet;
  function openSettings() {
    if (!settingsSheet) settingsSheet = makeSheet('SETTINGS', 'Tune the feel — applies everywhere.');
    settingsSheet.body.innerHTML = settingsBlock();
    wireSettings(settingsSheet.body);
    settingsSheet.open();
  }
  /* ---- per-game scores sheet with time filters + daily (reused by pause) ---- */
  var scoresSheet, _sc = { gid: '', period: 'all', scope: 'global' };
  var PERIODS = [['today', 'TODAY'], ['week', 'WEEK'], ['month', 'MONTH'], ['all', 'ALL']];
  var SCOPES = [['global', 'GLOBAL'], ['near', 'NEAR ME'], ['friends', 'FRIENDS']];
  function openScores(gid) {
    if (!scoresSheet) scoresSheet = makeSheet('HIGH SCORES', '');
    _sc.gid = gid; _sc.period = 'all'; _sc.scope = 'global';
    scoresSheet.el.querySelector('h3').textContent = gid + ' · HIGH SCORES';
    scoresSheet.body.innerHTML =
      '<div class="aa-scope">' +
        SCOPES.map(function (s) { return '<button data-s="' + s[0] + '" class="' + (s[0] === 'global' ? 'on' : '') + '">' + s[1] + '</button>'; }).join('') +
      '</div>' +
      '<div class="aa-period">' +
        PERIODS.map(function (p) { return '<button data-p="' + p[0] + '" class="' + (p[0] === 'all' ? 'on' : '') + '">' + p[1] + '</button>'; }).join('') +
        '<button data-p="season" class="daily">◆ SEASON</button>' +
        '<button data-p="daily" class="daily">★ DAILY</button>' +
      '</div><div id="aaBoard"><div class="aa-empty">Loading…</div></div>';
    scoresSheet.body.querySelectorAll('.aa-scope button').forEach(function (b) {
      b.onclick = function () { feel('tap'); _sc.scope = b.getAttribute('data-s');
        if (_sc.scope !== 'global' && (_sc.period === 'daily' || _sc.period === 'season')) _sc.period = 'all';   // daily/season are global-only
        scoresSheet.body.querySelectorAll('.aa-scope button').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on');
        scoresSheet.body.querySelectorAll('.aa-period button').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-p') === _sc.period); });
        renderScores(); };
    });
    scoresSheet.body.querySelectorAll('.aa-period button').forEach(function (b) {
      b.onclick = function () { feel('tap'); _sc.period = b.getAttribute('data-p');
        if (b.getAttribute('data-p') === 'daily' || b.getAttribute('data-p') === 'season') _sc.scope = 'global';   // daily/season imply global
        scoresSheet.body.querySelectorAll('.aa-period button').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on');
        scoresSheet.body.querySelectorAll('.aa-scope button').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-s') === _sc.scope); });
        renderScores(); };
    });
    scoresSheet.open(); renderScores();
  }
  function boardRow(r, rank, meLc) {
    var name = r.name, av = r.avatar || '';
    var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    var tap = (name && name !== 'anon') ? ' data-prof="' + esc(name) + '"' : '';
    return '<div class="li' + (name && name.toLowerCase() === meLc ? ' me' : '') + '"' + tap + '>' +
      '<span class="rk">' + medal + '</span>' + (av ? '<span class="av">' + av + '</span>' : '') +
      '<span class="nm">' + esc(name) + '</span><span class="sc">' + Number(r.score).toLocaleString() + '</span></div>';
  }
  function renderScores() {
    var board = scoresSheet.body.querySelector('#aaBoard'); if (!board) return;
    // tapping a player → their profile (delegated; survives innerHTML swaps)
    board.onclick = function (e) {
      var li = e.target.closest && e.target.closest('.li[data-prof]'); if (!li) return;
      feel('tap'); showVeil('#e8a13a', ''); location.href = 'profile.html?name=' + encodeURIComponent(li.getAttribute('data-prof'));
    };
    board.innerHTML = '<div class="aa-empty">Loading…</div>';
    var me = (lget('aa.name') || '').toLowerCase();
    var p = _sc.period, daily = p === 'daily', season = p === 'season', scope = _sc.scope;
    // NEAR ME and FRIENDS need an identity / sign-in respectively
    if (scope === 'near' && !me) { board.innerHTML = '<div class="aa-empty">Set a name to see who’s right above and below you.</div>'; return; }
    if (scope === 'friends' && !token()) { board.innerHTML = '<div class="aa-empty">Sign in to race your friends’ scores.</div>'; return; }
    var url;
    if (daily) url = '/api/daily/leaderboard';
    else if (season) url = '/api/season/standings?game=' + encodeURIComponent(_sc.gid) + '&limit=25';
    else if (scope === 'near') url = '/api/leaderboard?game=' + encodeURIComponent(_sc.gid) + '&around=' + encodeURIComponent(lget('aa.name') || '') + '&period=' + p;
    else if (scope === 'friends') url = '/api/leaderboard?game=' + encodeURIComponent(_sc.gid) + '&scope=friends&period=' + p + '&limit=25';
    else url = '/api/leaderboard?game=' + encodeURIComponent(_sc.gid) + '&period=' + p + '&limit=25';
    api('GET', url).then(function (d) {
      if (season && d && d.season) {
        var rows = d.top || [];
        var ends = d.season.ends_at ? Math.max(0, Math.ceil((d.season.ends_at - Date.now()) / 86400000)) : 0;
        board.innerHTML = '<div class="aa-empty" style="padding:6px 2px 12px"><b style="color:var(--aa-brand)">' + esc(d.season.title || 'Season') + '</b> · ' + ends + ' day' + (ends === 1 ? '' : 's') + ' left · top 10 ranked</div>' +
          (rows.length ? '<div class="aa-list">' + rows.map(function (r, i) { return boardRow(r, i + 1, me); }).join('') + '</div>' : '<div class="aa-empty">No season scores yet — be first.</div>');
        return;
      }
      if (scope === 'near' && d && d.you) {
        var rows = d.rows || [], from = d.from || 1;
        board.innerHTML = '<div class="aa-empty" style="padding:6px 2px 12px">You’re <b style="color:var(--aa-brand)">#' + d.you.rank + '</b> · ' + Number(d.you.score).toLocaleString() + '</div>' +
          (rows.length ? '<div class="aa-list">' + rows.map(function (r, i) { return boardRow(r, from + i, me); }).join('') + '</div>' : '');
        return;
      }
      var rows = (d && d.top) || [];
      var note = daily && d && d.game ? '<div class="aa-empty" style="padding:6px 2px 12px">Today’s daily · <b style="color:var(--aa-brand)">' + esc(d.game) + '</b></div>' : '';
      board.innerHTML = note + (rows.length
        ? '<div class="aa-list">' + rows.map(function (r, i) { return boardRow(r, i + 1, me); }).join('') + '</div>'
        : '<div class="aa-empty">' + (scope === 'friends' ? 'No friends on this board yet — add some.' : daily ? 'No daily scores yet — be first.' : 'No scores in this window yet — be first.') + '</div>');
    }).catch(function () { board.innerHTML = '<div class="aa-empty">Couldn’t reach the leaderboard.</div>'; });
  }

  /* ---- leaderboard: stagger the cards in (#6/#10) ---- */
  function leaderboardStagger() {
    var apply = function () {
      var cards = document.querySelectorAll('.bcard');
      cards.forEach(function (c, i) { if (c.classList.contains('aa-stagger')) return; c.style.animationDelay = (i * 55) + 'ms'; c.classList.add('aa-stagger'); });
    };
    apply();
    // boards load async — re-apply as cards appear
    var mo = new MutationObserver(apply);
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 6000);
  }

  /* ===================================================================
     #10 — universal new-best confetti + Feel (all games)
     =================================================================== */
  function confetti(accent) {
    if ((lget('aa.juice') || 'full') === 'off') return;
    var wrap = document.createElement('div'); wrap.className = 'aa-confetti';
    var cols = [accent || '#e8a13a', '#ffd23f', '#5ad1ff', '#ff5ec7', '#36d399'];
    var n = (lget('aa.juice') === 'subtle') ? 14 : 36;
    for (var i = 0; i < n; i++) {
      var p = document.createElement('i');
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.background = cols[i % cols.length];
      p.style.animationDelay = (Math.random() * 0.25) + 's';
      p.style.transform = 'translateY(0) rotate(' + (Math.random() * 360) + 'deg)';
      wrap.appendChild(p);
    }
    document.body.appendChild(wrap);
    setTimeout(function () { wrap.remove(); }, 1800);
  }
  function wireUniversalJuice() {
    if (!window.GameStats || typeof GameStats.submitScore !== 'function') return;
    var slug = (path.replace(/\.html$/, '') || '').toLowerCase();
    var accent = ACCENT[slug] || '#e8a13a';
    var isCabinet = !!(document.body && document.body.dataset && document.body.dataset.game);
    var real = GameStats.submitScore;
    var lastCelebrate = 0;
    GameStats.submitScore = function (g, s) {
      var prev = (GameStats.localBest && GameStats.localBest(g)) || 0;
      var r = real.apply(GameStats, arguments);
      var sc = Math.max(0, Math.round(s || 0));
      if (sc > 0 && sc > prev) {
        confetti(accent);
        if (!isCabinet) feel('success');   // cabinet games already fire success themselves
      }
      // #competitive — celebrate a top-10 global placement on game over (debounced per run)
      if (sc > 0 && Date.now() - lastCelebrate > 4000) {
        lastCelebrate = Date.now();
        var gid = String(g).toUpperCase();
        api('GET', '/api/rank?game=' + encodeURIComponent(gid) + '&score=' + sc).then(function (d) {
          if (d && d.rank && d.rank <= 10) showTop10(gid, d.rank, d.players, sc, accent);
        });
      }
      return r;
    };
  }
  /* ---- top-10 global placement celebration ---- */
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function showTop10(gid, rk, players, score, accent) {
    var el = document.createElement('div'); el.className = 'aa-top10'; el.style.setProperty('--t10', accent);
    el.innerHTML =
      '<div class="card">' +
        '<div class="kick">' + (rk === 1 ? '👑 WORLD #1' : 'TOP 10 WORLDWIDE') + '</div>' +
        '<div class="rank">' + ordinal(rk) + '</div>' +
        '<div class="sub">' + (rk === 1 ? 'Best ' + esc(gid) + ' player in the world' : esc(gid) + ' · ' + Number(score).toLocaleString() + (players ? ' · of ' + players + ' players' : '')) + '</div>' +
        '<button class="aa-btn" id="t10view">VIEW BOARD</button>' +
        '<button class="t10close">dismiss</button>' +
      '</div>';
    document.body.appendChild(el);
    feel(rk === 1 ? 'heavy' : 'success'); confetti(accent);
    requestAnimationFrame(function () { el.classList.add('show'); });
    var kill = function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 300); };
    el.querySelector('#t10view').onclick = function () { feel('select'); kill(); openScores(gid); };
    el.querySelector('.t10close').onclick = kill;
    el.addEventListener('click', function (e) { if (e.target === el) kill(); });
  }

  /* ===================================================================
     #9 — edge swipe closes an open SHEET only (never a game — that was
     accidentally closing games; removed). Games are left/exited via the
     pause menu's HOME button.
     =================================================================== */
  if (!isGame) {
    var tsx = 0, tsy = 0, edge = false;
    document.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; tsx = t.clientX; tsy = t.clientY; edge = tsx < 24;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (!edge) return;
      var t = e.changedTouches[0];
      if (t.clientX - tsx > 70 && Math.abs(t.clientY - tsy) < 60) {
        var openScrim = document.querySelector('.aa-scrim.open');
        if (openScrim) openScrim.classList.remove('open');
      }
    }, { passive: true });
  }

  /* ===================================================================
     init
     =================================================================== */
  function init() {
    de.setAttribute('data-juice', lget('aa.juice') || 'full');
    // suppress iOS's keyboard accessory bar (the ^ v Done toolbar over inputs)
    try {
      var K = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Keyboard;
      if (K && K.setAccessoryBarVisible) K.setAccessoryBarVisible({ isVisible: false });
    } catch (e) {}
    if (isGame) { wireUniversalJuice(); buildPause(); wireGameOverHome(); }
    else {
      buildTabBar();
      if (path === 'index.html' || path === '') buildHome();
      else if (path === 'leaderboard.html') leaderboardStagger();
    }
    // expose for in-game hooks
    window.AnorakNative = { shareScore: shareScore, openProfile: openProfile, openFriends: openFriends, openSettings: openSettings, openScores: openScores, signInWithApple: signInWithApple };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
