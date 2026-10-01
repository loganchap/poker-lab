// render functions (renderTicker, renderAll, renderStatsView, renderHistory, showModal, closeModal)
// are imported from render.js — wired up after render.js is created

/* ---------- stats ---------- */
export function blankStats(){
  return {hands:0,vpip:0,pfr:0,limped:0,tbOpp:0,tb:0,f3bOpp:0,f3b:0,
          cbetFaced:0,foldCbet:0,sawFlop:0,wtsd:0,wonSd:0,
          pBets:0,pCalls:0,netBB:0,won:0};
}
export const BENCH = {
  vpip:[20,28], pfr:[16,24], gap:[3,7], tb:[5,10], f3b:[45,65],
  af:[1.8,4], foldCbet:[35,60], wtsd:[22,30], wsd:[48,56]
};
export function derive(s){
  const pct = (a,b)=> b>0 ? a/b*100 : null;
  const gap = s.hands>0 ? (s.vpip-s.pfr)/s.hands*100 : null;
  return {
    hands:s.hands,
    vpip:pct(s.vpip,s.hands), pfr:pct(s.pfr,s.hands), gap,
    tb:pct(s.tb,s.tbOpp), f3b:pct(s.f3b,s.f3bOpp),
    af: s.pCalls>0 ? (s.pBets/s.pCalls) : (s.pBets>0?99:null),
    foldCbet:pct(s.foldCbet,s.cbetFaced),
    wtsd:pct(s.wtsd,s.sawFlop), wsd:pct(s.wonSd,s.wtsd),
    bb100: s.hands>0 ? s.netBB/s.hands*100 : null
  };
}

/* ---------- persistence (localStorage) ---------- */
export const DKEY = 'pokerlab:data';
export let DATA = { v:2, life:blankStats(), settings:{showEquity:false, hintMode:'question'}, hands:[] };
export let saveState = 'ok';

export function loadData(){
  try{
    const raw = localStorage.getItem(DKEY);
    if(raw){
      const d = JSON.parse(raw);
      if(d && d.life){
        DATA.life = Object.assign(blankStats(), d.life);
        DATA.settings = Object.assign(DATA.settings, d.settings||{});
        DATA.hands = Array.isArray(d.hands) ? d.hands : [];
      }
    }
    saveState = 'ok';
  }catch(e){
    saveState = 'err';
    console.error('load failed', e);
  }
}

let saveTimer = null;
export function saveData(renderTicker){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    try{
      if(DATA.hands.length > 500) DATA.hands = DATA.hands.slice(-500);
      localStorage.setItem(DKEY, JSON.stringify(DATA));
      saveState = 'ok';
    }catch(e){
      saveState = 'err';
      console.error('save failed', e);
    }
    renderTicker();
  }, 150);
}

export function exportData(){
  const blob = new Blob([JSON.stringify(DATA, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pokerlab-backup-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function importData(saveData, renderAll, renderStatsView, renderHistory, showModal, closeModal){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try{
        const d = JSON.parse(evt.target.result);
        if(!d || !d.life) throw new Error('Invalid file');
        DATA.life = Object.assign(blankStats(), d.life);
        DATA.settings = Object.assign(DATA.settings, d.settings||{});
        DATA.hands = Array.isArray(d.hands) ? d.hands : [];
        saveData();
        renderAll();
        renderStatsView();
        renderHistory();
        showModal('Import successful', `<p>Loaded <b>${DATA.life.hands}</b> lifetime hands and <b>${DATA.hands.length}</b> hand records.</p>`,
          [{label:'Close', cb:closeModal}]);
      }catch(err){
        showModal('Import failed', `<p>Could not read that file. Make sure it is a Poker Lab backup.</p>`,
          [{label:'Close', cb:closeModal}]);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
