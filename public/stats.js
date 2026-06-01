// Anorak Arcade — playtime + leaderboard client.
// Local-first: tracks time/best per game in localStorage and works offline.
// If API is set (the deployed Worker URL), it also syncs to the global leaderboard.
(function(){
  // ===== set this to your deployed Worker URL to enable global leaderboards =====
  const API = 'https://anorak-arcade-api.sean-ellul.workers.dev';   // deployed Worker (leaderboard API)
  // ==============================================================================
  const SKEY='aa.stats', CKEY='aa.clientId', NKEY='aa.name';
  const GAMES=['CINDER','STRATA','CONDUIT','HOMEOSTAT'];

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
  const pending={};
  function pend(g){ if(!pending[g]) pending[g]={addMs:0,plays:0,score:0,force:false}; return pending[g]; }
  let lastFlush=Date.now(), lastPing={}, lastSave=Date.now(), promptedThisLoad=false;

  function ping(game, ms){ if(!game||!(ms>0)) return; const now=Date.now(); const e=ensure(game);
    if(!lastPing[game]||now-lastPing[game]>30000) e.sessions++;
    lastPing[game]=now; e.last=now; ms=Math.min(ms,200); e.ms+=ms; pend(game).addMs+=ms;
    if(now-lastSave>1000){ save(); lastSave=now; }
    if(now-lastFlush>20000) flush(false);
  }
  function submitScore(game, score){ score=Math.max(0,Math.round(score||0)); const e=ensure(game);
    const newBest = score>e.best;
    if(newBest) e.best=score;
    const p=pend(game); p.plays+=1; p.score=Math.max(p.score,score); save();
    // nudge for a name on every new personal best while still anonymous (openNameModal self-guards against stacking)
    if(!name && score>0 && newBest) openNameModal(()=>flush(false));
    setTimeout(()=>flush(false),250);
  }

  function flush(useBeacon){ lastFlush=Date.now(); save();
    const games=Object.keys(pending).filter(g=>{ const p=pending[g]; return p&&(p.addMs>0||p.plays>0||p.score>0||p.force); });
    if(!games.length) return;
    for(const g of games){ const p=pending[g];
      const body=JSON.stringify({clientId,name,game:g,addMs:Math.round(p.addMs),plays:p.plays,score:p.score});
      pending[g]={addMs:0,plays:0,score:0,force:false};
      if(!API) continue;  // local-only mode
      try{
        if(useBeacon && navigator.sendBeacon){ navigator.sendBeacon(API+'/api/sync', new Blob([body],{type:'application/json'})); }
        else fetch(API+'/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
      }catch(e){}
    }
  }

  function setName(v){ name=cleanName(v); lset(NKEY,name);
    for(const g of GAMES){ const e=data[g]; if(e&&(e.ms>0||e.best>0)){ const p=pend(g); p.force=true; p.score=Math.max(p.score, e.best||0); } }
    flush(false);
  }

  // ---- name modal (injected; inline styles so it works on any page, incl. games) ----
  function openNameModal(cb){
    if(document.getElementById('aa-name')) return;
    const w=document.createElement('div'); w.id='aa-name';
    w.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(5,7,12,.82);font-family:ui-monospace,Menlo,Consolas,monospace';
    w.innerHTML='<div style="background:#121826;border:1px solid #2a3447;border-radius:14px;padding:24px;width:300px;max-width:86vw;text-align:center;color:#e7ecf5;box-shadow:0 20px 60px rgba(0,0,0,.5)">'
      +'<div style="letter-spacing:.22em;color:#ffb13d;font-size:12px;margin-bottom:6px">ENTER YOUR NAME</div>'
      +'<div style="color:#7d8aa0;font-size:12px;margin-bottom:14px;line-height:1.5">for the leaderboard &mdash; pick anything</div>'
      +'<input id="aa-name-in" maxlength="16" placeholder="HANDLE" autocomplete="off" '
      +'style="width:100%;box-sizing:border-box;background:#0a0e14;border:1px solid #2a3447;border-radius:8px;color:#e7ecf5;font-family:inherit;font-size:16px;padding:11px;text-align:center;letter-spacing:.12em;outline:none">'
      +'<div style="display:flex;gap:8px;margin-top:14px">'
      +'<button id="aa-name-skip" style="flex:1;background:none;border:1px solid #2a3447;color:#7d8aa0;font-family:inherit;padding:10px;border-radius:8px;cursor:pointer">Skip</button>'
      +'<button id="aa-name-ok" style="flex:2;background:#ffb13d;border:0;color:#1a0d06;font-family:inherit;font-weight:700;padding:10px;border-radius:8px;cursor:pointer;letter-spacing:.1em">Save</button>'
      +'</div></div>';
    document.body.appendChild(w);
    const inp=w.querySelector('#aa-name-in'); inp.value=name; setTimeout(()=>inp.focus(),30);
    const done=cb||function(){};
    const close=()=>w.remove();
    const ok=()=>{ const v=cleanName(inp.value); if(v) setName(v); close(); done(); };
    w.querySelector('#aa-name-ok').onclick=ok;
    w.querySelector('#aa-name-skip').onclick=()=>{ close(); done(); };
    w.addEventListener('mousedown',e=>{ if(e.target===w){ close(); done(); } });
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') ok(); else if(e.key==='Escape'){ close(); done(); } });
  }

  window.addEventListener('beforeunload',()=>flush(true));
  document.addEventListener('visibilitychange',()=>{ if(document.hidden) flush(true); });

  window.GameStats={
    ping, submitScore, flush, setName, getName:()=>name, promptName:openNameModal, clientId, hasAPI:!!API,
    all(){ save(); return Object.keys(data).map(g=>({game:g,ms:data[g].ms||0,sessions:data[g].sessions||0,last:data[g].last||0,best:data[g].best||0})).sort((a,b)=>b.ms-a.ms); },
    total(){ return Object.values(data).reduce((s,d)=>s+(d.ms||0),0); },
    localBest(g){ return (data[g]&&data[g].best)||0; },
    reset(){ for(const k in data) delete data[k]; lastPing={}; save(); },   // LOCAL only — server keeps the global record
    fmt(ms){ const s=Math.round(ms/1000); if(s<60) return s+'s'; const m=Math.floor(s/60); if(m<60) return m+'m '+(s%60)+'s'; const h=Math.floor(m/60); return h+'h '+(m%60)+'m'; },
    api(path){ if(!API) return Promise.reject(new Error('no-api')); return fetch(API+path).then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }); }
  };
})();
