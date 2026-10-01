import { derive, DATA, BENCH, blankStats } from './stats.js';
import { fmtC, prettyIds } from './deck.js';
// showModal, closeModal, renderStatsView imported from render.js — wired after render.js is created

/* ---------- pattern coaching (50+ hands) ---------- */
export function patternLeaks(){
  const d = derive(DATA.life);
  const L = [];
  const chk = (val, lo, hi, lowMsg, highMsg, label) => {
    if(val===null) return;
    if(val<lo) L.push({sev: val<lo*0.7?'high':'med', label, t:lowMsg});
    else if(val>hi) L.push({sev: val>hi*1.35?'high':'med', label, t:highMsg});
  };
  chk(d.vpip, ...BENCH.vpip,
    `<b>Too tight preflop.</b> VPIP ${d.vpip&&d.vpip.toFixed(1)}% (target 20 to 28). You are folding playable hands, especially in late position. Widen up on the button and cutoff.`,
    `<b>Playing too many hands.</b> VPIP ${d.vpip&&d.vpip.toFixed(1)}% (target 20 to 28). Loose preflop means weak ranges postflop. Tighten your opens, especially early.`, 'VPIP');
  chk(d.gap, ...BENCH.gap,
    `<b>Almost never calling.</b> Gap ${d.gap&&d.gap.toFixed(1)} (target 3 to 7). Fine if intentional, but some hands play best as calls in position.`,
    `<b>Calling too much, raising too little.</b> VPIP/PFR gap ${d.gap&&d.gap.toFixed(1)} (target 3 to 7). The classic passive leak. When a hand is worth playing, it is usually worth raising.`, 'VPIP/PFR GAP');
  chk(d.tb, ...BENCH.tb,
    `<b>3-betting too rarely.</b> ${d.tb&&d.tb.toFixed(1)}% (target 5 to 10). Opponents can open freely against you. Add 3-bets with your strongest hands plus some suited aces.`,
    `<b>3-betting very wide.</b> ${d.tb&&d.tb.toFixed(1)}% (target 5 to 10). Works against tight players, but bar-game callers will make you show up with it.`, '3-BET');
  chk(d.af, ...BENCH.af,
    `<b>Too passive postflop.</b> Aggression factor ${d.af&&d.af.toFixed(1)} (target about 2 to 4). You call far more than you bet or raise. Passive players only win at showdown; aggressive players win both ways.`,
    `<b>Hyper-aggressive postflop.</b> AF ${d.af&&d.af.toFixed(1)} (target about 2 to 4). Constant barreling gets picked off by calling stations. Slow down on rivers without value.`, 'AGGRESSION');
  chk(d.foldCbet, ...BENCH.foldCbet,
    `<b>Too sticky vs c-bets.</b> Folding ${d.foldCbet&&d.foldCbet.toFixed(0)}% (target 35 to 60). You are peeling flops with hands that cannot win. Missed flop, no draw, no plan: fold.`,
    `<b>Over-folding to c-bets.</b> Folding ${d.foldCbet&&d.foldCbet.toFixed(0)}% (target 35 to 60). Aggressive players print money c-betting you with anything. Defend pairs and decent draws more.`, 'VS C-BET');
  chk(d.wtsd, ...BENCH.wtsd,
    `<b>Giving up too often.</b> WTSD ${d.wtsd&&d.wtsd.toFixed(0)}% (target 22 to 30). You see flops then surrender. Either tighten preflop or fight harder after the flop.`,
    `<b>Going to showdown too much.</b> WTSD ${d.wtsd&&d.wtsd.toFixed(0)}% (target 22 to 30). Calling down light bleeds chips against value-heavy bettors.`, 'SHOWDOWN');
  if(d.bb100!==null && DATA.life.hands>=100){
    L.push({sev: d.bb100>=0?'good':'med', label:'WIN RATE',
      t:`<b>${d.bb100>=0?'+':''}${d.bb100.toFixed(1)} bb/100</b> over ${DATA.life.hands} hands. ${d.bb100>=0?'Beating the table so far. Keep the sample growing.':'Negative so far. Pick one leak above and fix it before worrying about the rest.'}`});
  }
  if(!L.length) L.push({sev:'good', label:'SOLID', t:`<b>No major statistical leaks.</b> Your core numbers sit inside winning ranges. The next layer is bet sizing, hand reading, and exploiting specific player types: tap any opponent's seat to review their profile.`});
  return L;
}

/* ---------- coach panel ---------- */
export function showCoach(H, S, showModal, closeModal){
  const el = document.getElementById('coachpanel');
  if(!H || (S.players[0].out && S.finished)){ el.style.display='none'; return; }
  const resCls = H.netC>0?'pos':H.netC<0?'neg':'';
  const resultLabel = H.netC>0 ? `You won ${fmtC(H.netC)} chips` : H.netC<0 ? `You lost ${fmtC(Math.abs(H.netC))} chips` : 'Broke even';
  let inner = `<div class="eyebrow">Post-hand review · ${H.pos} · ${prettyIds(H.hole)}</div>`;
  inner += `<div class="res ${resCls}">${resultLabel}</div>`;
  inner += H.notes.map(n=>`<p>${n}</p>`).join('');

  const terms = [];
  const noteText = H.notes.join(' ').toLowerCase();
  if(noteText.includes('c-bet')||noteText.includes('continuation bet')) terms.push('<b>C-bet (continuation bet):</b> a follow-up bet on the flop after you raised preflop, representing a strong hand.');
  if(noteText.includes('fold equity')) terms.push('<b>Fold equity:</b> the extra value you get from a bet when there is a chance your opponent folds and you win without a showdown.');
  if(noteText.includes('pot odds')) terms.push('<b>Pot odds:</b> the ratio of what you must call to what is in the pot. If the pot is 100 and you call 25, you are getting 4-to-1 odds.');
  if(noteText.includes('vpip')) terms.push('<b>VPIP:</b> the percentage of hands where you voluntarily put chips in preflop. A measure of how loose or tight you play.');
  if(noteText.includes('3-bet')) terms.push('<b>3-bet:</b> re-raising someone who already raised. First bet = blind, second bet = open raise, third bet = 3-bet.');
  if(noteText.includes('outs')) terms.push('<b>Outs:</b> the number of cards left in the deck that would complete your drawing hand.');
  if(noteText.includes('equity')) terms.push('<b>Equity:</b> your percentage chance of winning the hand if all the cards were dealt out right now.');
  if(noteText.includes('range')) terms.push('<b>Range:</b> the full set of hands an opponent might have in a given situation, not just one specific hand.');
  if(terms.length){
    inner += `<div style="margin-top:10px;padding-top:9px;border-top:1px solid var(--line);font-size:10px;color:var(--dim);line-height:1.7">${terms.join('<br>')}</div>`;
  }

  el.innerHTML = inner;
  el.style.display = '';
}
export function hideCoach(){ document.getElementById('coachpanel').style.display='none'; }

/* ---------- session ---------- */
export function endSession(SESSION, showModal, closeModal, renderStatsView){
  const d = derive(SESSION);
  if(d.hands===0){ showModal('Session', '<p>No hands played this session yet.</p>', [{label:'Close', cb:closeModal}]); return; }
  const l = derive(DATA.life);
  const f = v=>v===null?'·':v.toFixed(1);
  const leak = topSessionLeak(d);
  showModal('Session summary',
    `<p><b>${d.hands}</b> hands · net <b>${SESSION.netBB>=0?'+':''}${SESSION.netBB.toFixed(1)} big blinds</b> (${d.bb100>=0?'+':''}${f(d.bb100)} bb/100)</p>
     <p>VPIP <b>${f(d.vpip)}</b> (life ${f(l.vpip)}) · PFR <b>${f(d.pfr)}</b> (life ${f(l.pfr)}) · AF <b>${d.af===null?'·':d.af.toFixed(1)}</b></p>
     <p>${leak}</p>`,
    [{label:'Start new session', cb:()=>{ SESSION=blankStats(); closeModal(); renderStatsView(); }},
     {label:'Keep playing', cb:closeModal}]);
}
export function topSessionLeak(d){
  if(d.hands<15) return 'Small sample this session. Stat reads need more hands.';
  if(d.gap!==null && d.gap>8) return `<b>Session leak:</b> VPIP/PFR gap of ${d.gap.toFixed(1)}. You called too much preflop today. Raise or fold.`;
  if(d.af!==null && d.af<1.5) return `<b>Session leak:</b> AF ${d.af.toFixed(1)}. Very passive postflop today.`;
  if(d.vpip!==null && d.vpip>32) return `<b>Session leak:</b> VPIP ${d.vpip.toFixed(1)}%. Loose day at the office.`;
  return 'No glaring session leak. Solid work.';
}
