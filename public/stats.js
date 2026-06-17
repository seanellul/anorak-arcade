// Anorak Arcade — playtime + leaderboard client.
// Local-first: tracks time/best per game in localStorage and works offline.
// If API is set (the deployed Worker URL), it also syncs to the global leaderboard.
(function(){
  // ===== set this to your deployed Worker URL to enable global leaderboards =====
  const API = 'https://anorak-arcade-api.sean-ellul.workers.dev';   // deployed Worker (leaderboard API)
  // ==============================================================================
  // Never WRITE to the live leaderboard from local dev (localhost / file://) — only the real
  // domain + the native app sync. The app runs on capacitor://localhost / anorak://localhost,
  // which is NOT dev and MUST submit scores (anonymous included).
  const NATIVE = !!(window.Capacitor && (typeof Capacitor.isNativePlatform !== 'function' || Capacitor.isNativePlatform()))
    || /^(capacitor|anorak):$/i.test(location.protocol);
  const LOCAL = !NATIVE && (location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|.*\.local)$/i.test(location.hostname));
  if (API && LOCAL) try { console.info('[GameStats] local dev — leaderboard writes disabled (reads still live).'); } catch (e) {}
  const SKEY='aa.stats', CKEY='aa.clientId', NKEY='aa.name';
  const GAMES=['CINDER','SHIFT','CONDUIT','HOMEOSTAT','NOVA','SURGE','CLEAVE','FLUX','WEAVE','PULSE','INTERCEPT','DESCENT','MOTHERLOAD','MOTHERLOAD_CASH'];

  const lget=k=>{ try{return localStorage.getItem(k);}catch(e){return null;} };
  const lset=(k,v)=>{ try{localStorage.setItem(k,v);}catch(e){} };
  function uuid(){ try{ if(window.crypto&&crypto.randomUUID) return crypto.randomUUID(); }catch(e){} return 'id-'+Math.random().toString(16).slice(2)+'-'+Date.now().toString(16); }

  let clientId=lget(CKEY); if(!clientId){ clientId=uuid(); lset(CKEY,clientId); }
  let name=lget(NKEY)||'';
  let data; try{ data=JSON.parse(lget(SKEY))||{}; }catch(e){ data={}; }
  function ensure(g){ if(!data[g]) data[g]={ms:0,sessions:0,last:0,best:0}; return data[g]; }
  const save=()=>lset(SKEY,JSON.stringify(data));
  const cleanName=v=>String(v||'').replace(/\s+/g,' ').trim().slice(0,16);

  // ---- server outbox ----
  const VER='2026-06-13';   // client build tag, stamped on scores for provenance
  const pending={};
  function pend(g){ if(!pending[g]) pending[g]={addMs:0,plays:0,score:0,force:false}; return pending[g]; }
  let lastFlush=Date.now(), lastPing={}, lastSave=Date.now(), promptedThisLoad=false;
  let nameConflict=false;   // server told us our handle is claimed by someone else → prompt for our own

  // ---- score integrity: server-issued play session per game, signed final score ----
  // Each run starts a session bound to (clientId, game, seed[, user]); we sign the
  // best score with the session secret so the Worker can stamp it 'verified'. All of
  // this is best-effort — if the network or crypto is unavailable, scores still flow
  // through the legacy /api/sync path exactly as before.
  const sess={};                 // game -> {id, secret, seed} | 'pending'
  // a duel/daily seed passed via the URL (?seed=duel-xxxx) tags this run for resolution
  let _urlSeed=''; try{ var qs=(new URLSearchParams(location.search)).get('seed')||''; if(/^(daily-\d{4}-\d{2}-\d{2}|duel-[a-z0-9]{1,32})$/.test(qs)) _urlSeed=qs; }catch(e){}
  function token(){ return lget('aa.token')||''; }
  function ensureSession(game, seed){
    if(!API || LOCAL || !game) return;
    if(sess[game]) return;       // already have one (or one in flight)
    sess[game]='pending';
    const sd = seed || _urlSeed || '';
    const h={'Content-Type':'application/json'}; if(token()) h.Authorization='Bearer '+token();
    fetch(API+'/api/session/start',{method:'POST',headers:h,body:JSON.stringify({clientId,game,seed:sd,clientVersion:VER})})
      .then(r=>r.json()).then(d=>{ sess[game]=(d&&d.sessionId&&d.secret)?{id:d.sessionId,secret:d.secret,seed:d.seed||''}:null; })
      .catch(()=>{ sess[game]=null; });
  }
  async function hmacHex(secret,msg){
    const enc=new TextEncoder();
    const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const s=await crypto.subtle.sign('HMAC',k,enc.encode(msg));
    const a=new Uint8Array(s); let out=''; for(let i=0;i<a.length;i++) out+=a[i].toString(16).padStart(2,'0'); return out;
  }
  function signScore(game,score){
    const s=sess[game]; if(!s||s==='pending'||!s.secret) return;
    if(!(window.crypto&&crypto.subtle)) return;
    const nonce=uuid(), seed=s.seed||'', sid=s.id;
    hmacHex(s.secret, sid+'.'+game+'.'+score+'.'+seed+'.'+nonce).then(sig=>{
      const p=pend(game); p.sig=sig; p.nonce=nonce; p.sigScore=score; p.sid=sid; p.seed=seed;
    }).catch(()=>{});
  }

  function ping(game, ms){ if(!game||!(ms>0)) return; const now=Date.now(); const e=ensure(game);
    if(!lastPing[game]||now-lastPing[game]>30000) e.sessions++;
    ensureSession(game);   // begin an integrity session the moment a run is active
    lastPing[game]=now; e.last=now; ms=Math.min(ms,2000); e.ms+=ms; pend(game).addMs+=ms;
    if(now-lastSave>1000){ save(); lastSave=now; }
    if(now-lastFlush>20000) flush(false);
  }
  // countPlay=false records a score without counting a "play" — used for extra
  // boards of the same run (e.g. MOTHERLOAD_CASH) so they don't double the play/time stats.
  function submitScore(game, score, countPlay){ if(countPlay===undefined) countPlay=true;
    score=Math.max(0,Math.round(score||0)); const e=ensure(game);
    const newBest = score>e.best;
    if(newBest) e.best=score;
    ensureSession(game);
    const p=pend(game); if(countPlay) p.plays+=1; p.score=Math.max(p.score,score); save();
    if(score>0) signScore(game, score);   // precompute the HMAC so flush can attach it
    // On a new personal best: if signed in, nudge for a handle once (the board name); if not
    // signed in, ask the shell to prompt sign-in so the score can be SAVED. On the web (no
    // sign-in handler) this is a graceful no-op — anonymous players keep their local best and
    // simply don't appear on a global board. This is the "frictionless play, sign in to save" UX.
    if(score>0 && newBest){
      // Signed in but no handle yet, OR the server flagged our name as someone else's →
      // prompt to claim our own (the conflict case explains why). Not signed in → ask to save.
      if(token() && (!name || nameConflict)) openNameModal(()=>flush(false), nameConflict?'taken':'');
      else if(!token()){ try{ window.dispatchEvent(new CustomEvent('aa:save-prompt',{detail:{game,score}})); }catch(e){} }
    }
    setTimeout(()=>flush(false),250);
  }

  function flush(useBeacon){ lastFlush=Date.now(); save();
    const games=Object.keys(pending).filter(g=>{ const p=pending[g]; return p&&(p.addMs>0||p.plays>0||p.score>0||p.force); });
    if(!games.length) return;
    for(const g of games){ const p=pending[g];
      const sb={clientId,name,game:g,addMs:Math.round(p.addMs),plays:p.plays,score:p.score,clientVersion:VER};
      // attach the signed-score proof only when it matches the exact score we're sending
      const signed = p.sig && p.sid && p.sigScore===p.score && p.score>0;
      if(signed){ sb.sessionId=p.sid; sb.sig=p.sig; sb.nonce=p.nonce; if(p.seed) sb.seed=p.seed; }
      const body=JSON.stringify(sb);
      pending[g]={addMs:0,plays:0,score:0,force:false};
      if(signed) sess[g]=null;   // session is single-use; next best starts a fresh one
      if(!API || LOCAL) continue;  // local-only mode / never write from local dev
      try{
        // Score integrity: a signed-in account must ALWAYS claim its scores. Send the auth
        // token so the server attributes by account, never by the locally-typed name.
        // sendBeacon can't carry headers, so when authed we use keepalive fetch (also fires
        // reliably on page-hide).
        const tok=token();
        const hdrs={'Content-Type':'application/json'}; if(tok) hdrs.Authorization='Bearer '+tok;
        if(useBeacon && navigator.sendBeacon && !tok){ navigator.sendBeacon(API+'/api/sync', new Blob([body],{type:'application/json'})); }
        else fetch(API+'/api/sync',{method:'POST',headers:hdrs,body,keepalive:true})
          .then(r=>r.json()).then(d=>{ if(d&&d.nameTaken) nameConflict=true; }).catch(()=>{});
      }catch(e){}
    }
  }

  function setName(v){ name=cleanName(v); lset(NKEY,name);
    for(const g of GAMES){ const e=data[g]; if(e&&(e.ms>0||e.best>0)){ const p=pend(g); p.force=true; p.score=Math.max(p.score, e.best||0); } }
    flush(false);
  }
  // claim a globally-unique, profanity-screened name. resolves {ok, name} or {ok:false, reason}.
  function claimName(v){
    v=cleanName(v);
    if(!v) return Promise.resolve({ok:false,reason:'Enter a name'});
    if(!API || LOCAL) return Promise.resolve({ok:true,name:v});   // dev/offline → accept locally
    if(!token()) return Promise.resolve({ok:false,reason:'signin'});  // a handle belongs to an account
    const h={'Content-Type':'application/json',Authorization:'Bearer '+token()};
    return fetch(API+'/api/name',{method:'POST',headers:h,body:JSON.stringify({name:v,clientId})})
      .then(r=>r.json()).then(d=>{
        if(d && d.ok===true){ nameConflict=false; return {ok:true,name:d.name||v,avatar:d.avatar}; }
        if(d && (d.error==='unauthorized')) return {ok:false,reason:'signin'};
        return {ok:false,reason:(d&&d.reason)||'taken'};           // server is authoritative on 'Taken'
      })
      .catch(()=>({ok:true,name:v,local:true}));                   // network fail → accept locally; sync reconciles
  }
  // set the chosen profile avatar (emoji). stored locally for instant display + synced.
  const AKEY2='aa.avatar';
  function setAvatar(av){ av=Array.from(String(av||'')).slice(0,4).join(''); lset(AKEY2,av);
    if(!API || LOCAL) return Promise.resolve({ok:true,avatar:av});
    const h={'Content-Type':'application/json'}; if(token()) h.Authorization='Bearer '+token();
    return fetch(API+'/api/avatar',{method:'POST',headers:h,body:JSON.stringify({avatar:av,clientId})})
      .then(r=>r.json()).catch(()=>({ok:true,avatar:av}));
  }

  // ---- name modal (injected; inline styles so it works on any page, incl. games) ----
  // one-time keyframes for the modal's feedback juice (shake on reject, pop on claim)
  function injectFX(){ if(document.getElementById('aa-fx'))return;
    const s=document.createElement('style'); s.id='aa-fx';
    s.textContent='@keyframes aaShake{10%,90%{transform:translateX(-2px)}30%,70%{transform:translateX(-5px)}50%{transform:translateX(5px)}40%,60%{transform:translateX(4px)}}'
      +'@keyframes aaPop{0%{transform:scale(.4);opacity:0}55%{transform:scale(1.18)}100%{transform:scale(1);opacity:1}}';
    document.head.appendChild(s);
  }
  // reason: ''=first claim, 'taken'=server says this handle is someone else's
  function openNameModal(cb, reason){
    if(document.getElementById('aa-name')) return;
    injectFX();
    const taken=reason==='taken';
    const title=taken?'HANDLE TAKEN':'CLAIM YOUR HANDLE';
    const sub=taken?'someone already owns that name &mdash; lock in one that&rsquo;s yours'
                   :'your identity on every leaderboard';
    const w=document.createElement('div'); w.id='aa-name';
    w.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(5,7,12,.82);font-family:ui-monospace,Menlo,Consolas,monospace';
    w.innerHTML='<div id="aa-name-card" style="background:#121826;border:1px solid '+(taken?'#5b3a3a':'#2a3447')+';border-radius:14px;padding:24px;width:300px;max-width:86vw;text-align:center;color:#e7ecf5;box-shadow:0 20px 60px rgba(0,0,0,.5)">'
      +'<div style="letter-spacing:.22em;color:'+(taken?'#ff8a5b':'#ffb13d')+';font-size:12px;margin-bottom:6px">'+title+'</div>'
      +'<div style="color:#7d8aa0;font-size:12px;margin-bottom:14px;line-height:1.5">'+sub+'</div>'
      +'<input id="aa-name-in" maxlength="16" placeholder="HANDLE" autocomplete="off" '
      +'style="width:100%;box-sizing:border-box;background:#0a0e14;border:1px solid #2a3447;border-radius:8px;color:#e7ecf5;font-family:inherit;font-size:16px;padding:11px;text-align:center;letter-spacing:.12em;outline:none">'
      +'<div id="aa-name-err" style="color:#ff6a6a;font-size:11px;min-height:13px;margin-top:7px;letter-spacing:.06em"></div>'
      +'<div style="display:flex;gap:8px;margin-top:8px">'
      +'<button id="aa-name-skip" style="flex:1;background:none;border:1px solid #2a3447;color:#7d8aa0;font-family:inherit;padding:10px;border-radius:8px;cursor:pointer">Skip</button>'
      +'<button id="aa-name-ok" style="flex:2;background:#ffb13d;border:0;color:#1a0d06;font-family:inherit;font-weight:700;padding:10px;border-radius:8px;cursor:pointer;letter-spacing:.1em">Claim</button>'
      +'</div></div>';
    document.body.appendChild(w);
    const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));  // names allow <>&" → escape before innerHTML
    const card=w.querySelector('#aa-name-card');
    const inp=w.querySelector('#aa-name-in'); inp.value=taken?'':name; setTimeout(()=>inp.focus(),30);
    const done=cb||function(){};
    const close=()=>w.remove();
    const errEl=w.querySelector('#aa-name-err');
    const okBtn=w.querySelector('#aa-name-ok');
    const reject=(msg)=>{ errEl.innerHTML=msg; inp.style.borderColor='#ff6a6a';
      card.style.animation='none'; void card.offsetWidth; card.style.animation='aaShake .4s';
      okBtn.disabled=false; okBtn.style.opacity=''; okBtn.textContent='Claim'; inp.focus(); };
    const succeed=(nm)=>{ setName(nm); nameConflict=false;
      card.innerHTML='<div style="font-size:40px;animation:aaPop .45s">&#10003;</div>'
        +'<div style="letter-spacing:.2em;color:#6ee7a8;font-size:13px;margin-top:8px">HANDLE SECURED</div>'
        +'<div style="color:#e7ecf5;font-size:18px;font-weight:700;margin-top:6px;letter-spacing:.08em">'+esc(nm)+'</div>';
      card.style.borderColor='#2f6b4a';
      setTimeout(()=>{ close(); done(); },820);
    };
    const ok=()=>{ const v=cleanName(inp.value);
      if(!v){ if(taken){ inp.focus(); return; } close(); done(); return; }   // can't skip past a conflict with a blank
      errEl.textContent=''; inp.style.borderColor='#2a3447'; okBtn.disabled=true; okBtn.style.opacity='.6'; okBtn.textContent='…';
      claimName(v).then(res=>{
        if(res && res.ok===true){ succeed(res.name||v); }
        else if(res && res.reason==='signin'){
          reject('Sign in to claim &amp; protect it');
          try{ window.dispatchEvent(new CustomEvent('aa:save-prompt',{detail:{reason:'claim',name:v}})); }catch(e){}
        }
        else { reject('&ldquo;'+esc(v)+'&rdquo; is taken — try another'); }
      });
    };
    okBtn.onclick=ok;
    w.querySelector('#aa-name-skip').onclick=()=>{ close(); done(); };
    if(!taken) w.addEventListener('mousedown',e=>{ if(e.target===w){ close(); done(); } });  // a conflict must be resolved, not dismissed by tap-away
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') ok(); else if(e.key==='Escape'){ close(); done(); } });
  }

  window.addEventListener('beforeunload',()=>flush(true));
  document.addEventListener('visibilitychange',()=>{ if(document.hidden) flush(true); });

  // ---- first-visit onboarding: ask new players for a leaderboard name (once) ----
  // Only on game pages — never the landing/info pages — so newcomers enjoy the arcade
  // first and get asked when they actually open a game. This also catches Motherload
  // players who quit a dig mid-run and otherwise never hit the on-new-best name nudge.
  const AKEY='aa.nameAsked';
  function onGamePage(){
    return !!(document.body && document.body.dataset && document.body.dataset.game)  // cabinet games
        || !!window.Juice                                                            // juice-based games
        || /\/motherload(\/|$)/i.test(location.pathname);                            // Motherload
  }
  function firstRunNamePrompt(){
    if(name || !token() || !onGamePage()) return;   // need an account to claim a board handle
    lset(AKEY,'1');                     // ask at most once per browser, even if they skip
    openNameModal(()=>flush(false));
  }
  if(!name && token() && !lget(AKEY)){
    const arm=()=>setTimeout(firstRunNamePrompt,1600);   // let the title / start screen settle first
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',arm); else arm();
  }

  window.GameStats={
    ping, submitScore, flush, setName, getName:()=>name, promptName:openNameModal, clientId, hasAPI:!!API,
    setAvatar, getAvatar:()=>lget('aa.avatar')||'',
    all(){ save(); return Object.keys(data).map(g=>({game:g,ms:data[g].ms||0,sessions:data[g].sessions||0,last:data[g].last||0,best:data[g].best||0})).sort((a,b)=>b.ms-a.ms); },
    total(){ return Object.values(data).reduce((s,d)=>s+(d.ms||0),0); },
    localBest(g){ return (data[g]&&data[g].best)||0; },
    reset(){ for(const k in data) delete data[k]; lastPing={}; save(); },   // LOCAL only — server keeps the global record
    fmt(ms){ const s=Math.round(ms/1000); if(s<60) return s+'s'; const m=Math.floor(s/60); if(m<60) return m+'m '+(s%60)+'s'; const h=Math.floor(m/60); return h+'h '+(m%60)+'m'; },
    // Authed by default: several GET endpoints (e.g. /api/compare, /api/friends) require the
    // account token. Without it they 401 and callers silently fail (the old "VS YOU stuck on
    // Comparing…" bug). Attach the Bearer token whenever we have one.
    api(path,headers){ if(!API) return Promise.reject(new Error('no-api'));
      const h=Object.assign({}, headers||{}); if(token() && !h.Authorization) h.Authorization='Bearer '+token();
      return fetch(API+path,{headers:h}).then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }); }
  };
})();
