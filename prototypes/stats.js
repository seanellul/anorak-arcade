// Tiny shared playtime tracker for the Tetris Lab prototypes.
// Each game calls GameStats.ping('NAME', dtMs) every frame while actively playing.
// Data persists in localStorage (same origin across all prototype pages — serve over http).
(function(){
  const KEY='tetrislab.stats.v1';
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY))||{}; }catch(e){ return {}; } }
  const data=load();
  let buf={}, lastFlush=Date.now(), lastPing={};
  function ensure(g){ if(!data[g]) data[g]={ms:0,sessions:0,last:0}; return data[g]; }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){} }
  const API={
    ping(game, ms){ if(!game||!(ms>0)) return; const now=Date.now(); const e=ensure(game);
      if(!lastPing[game] || now-lastPing[game]>30000) e.sessions++;   // 30s gap => new session
      lastPing[game]=now; e.last=now; buf[game]=(buf[game]||0)+Math.min(ms,200);
      if(now-lastFlush>1000) API.flush(); },
    flush(){ for(const g in buf) ensure(g).ms+=buf[g]; buf={}; lastFlush=Date.now(); save(); },
    all(){ API.flush(); return Object.keys(data).map(g=>({game:g,...data[g]})).sort((a,b)=>b.ms-a.ms); },
    total(){ API.flush(); return Object.values(data).reduce((s,d)=>s+(d.ms||0),0); },
    reset(){ for(const k in data) delete data[k]; lastPing={}; buf={}; save(); },
    fmt(ms){ const s=Math.round(ms/1000); if(s<60) return s+'s'; const m=Math.floor(s/60); if(m<60) return m+'m '+(s%60)+'s'; const h=Math.floor(m/60); return h+'h '+(m%60)+'m'; }
  };
  window.addEventListener('beforeunload',()=>API.flush());
  document.addEventListener('visibilitychange',()=>{ if(document.hidden) API.flush(); });
  window.GameStats=API;
})();
