'use strict';

/* =====================================================
   POKER LAB v2  ·  game engine + render layer
   ===================================================== */

import { SUITCH, RANKCH, CAT_NAMES, rand, pick, sleep, newDeck, cstr, cid, prettyIds, fmtC } from './deck.js';
import { evalBest, heroEquity, tierOf, bucketOf, BUCKET_PHRASE } from './equity.js';
import { PROF, POS_ADJ, AI_ROSTER, VILLAIN_INFO, POSINFO, AI_AGG, aiPre as _aiPre, aiPost as _aiPost } from './ai.js';
import { blankStats, BENCH, derive, DATA, saveState, loadData, saveData as _saveData, exportData, importData as _importData } from './stats.js';
import { patternLeaks, showCoach as _showCoach, hideCoach, topSessionLeak } from './coach.js';

/* ---- internal wrappers that supply render callbacks ---- */
function saveData(){ _saveData(renderTicker); }
function importDataWrapper(){
  _importData(saveData, renderAll, renderStatsView, renderHistory, showModal, closeModal);
}

/* =====================================================
   GAME STATE
   ===================================================== */
let S       = null;
let SESSION = blankStats();
let H       = null;
let userResolve = null;
let dealing     = false;
let recentNoteKeys = [];

/* =====================================================
   POSITION / SEAT HELPERS
   ===================================================== */
function posLabels(n){
  if(n===2) return ['BTN','BB'];
  if(n===3) return ['BTN','SB','BB'];
  if(n===4) return ['BTN','SB','BB','UTG'];
  if(n===5) return ['BTN','SB','BB','UTG','CO'];
  if(n===6) return ['BTN','SB','BB','UTG','HJ','CO'];
  if(n===7) return ['BTN','SB','BB','UTG','UTG+1','HJ','CO'];
  if(n===8) return ['BTN','SB','BB','UTG','UTG+1','UTG+2','HJ','CO'];
  return ['BTN','SB','BB','UTG','UTG+1','UTG+2','LJ','HJ','CO'];
}
function liveSeats(){ return S.players.filter(p=>!p.out); }
function seatOrderFromBtn(){
  const ordered=[], n=S.players.length;
  for(let k=0;k<n;k++){
    const p=S.players[(S.btn+k)%n];
    if(!p.out) ordered.push(p);
  }
  return ordered;
}
function positionOf(p){
  const ord=seatOrderFromBtn(), labels=posLabels(ord.length);
  return labels[ord.indexOf(p)]||'·';
}
function nextLive(fromId, pred){
  const n=S.players.length;
  for(let k=1;k<=n;k++){
    const p=S.players[(fromId+k)%n];
    if(!p.out && pred(p)) return p;
  }
  return null;
}
function potTotal(){ return S.players.reduce((a,p)=>a+p.handPut,0); }
function unfolded(){ return S.players.filter(p=>!p.out&&!p.folded); }

/* =====================================================
   FRESH STATE
   ===================================================== */
function freshState(mode, cfg){
  cfg = cfg||{};
  const tourney=mode==='tourney';
  const numPlayers=Math.min(9,Math.max(2,cfg.numPlayers||6));
  const startStack=cfg.startStack||(tourney?1500:300);
  const sbVal=cfg.sb||(tourney?10:1);
  const bbVal=cfg.bb||(tourney?20:3);
  const schedule=cfg.schedule||[[10,20],[15,30],[20,40],[30,60],[50,100],[75,150],[100,200],[150,300],[200,400],[300,600],[400,800],[500,1000]];
  const handsPerLevel=cfg.handsPerLevel||8;
  const aiRoster=cfg.aiRoster||AI_ROSTER.slice(0,numPlayers-1);
  const players=[];
  players.push({id:0,name:'YOU',type:'user',user:true,stack:startStack,hole:[],folded:false,allIn:false,out:false,streetPut:0,handPut:0,acted:false,revealed:false,lastAct:''});
  for(let i=0;i<numPlayers-1;i++){
    const a=aiRoster[i]||AI_ROSTER[i%AI_ROSTER.length];
    players.push({id:i+1,name:a.name,type:a.type,user:false,stack:startStack,hole:[],folded:false,allIn:false,out:false,streetPut:0,handPut:0,acted:false,revealed:false,lastAct:''});
  }
  return {
    mode,players,numPlayers,startStack,
    cfg0:{numPlayers,startStack,sb:sbVal,bb:bbVal,schedule,handsPerLevel,aiRoster},
    btn:Math.floor(rand()*numPlayers),
    sb:sbVal,bb:bbVal,level:0,handsAtLevel:0,
    schedule,handsPerLevel,
    deck:[],board:[],street:'pre',
    currentBet:0,lastRaiseSize:0,preRaises:0,preAggressor:null,lastAgg:null,
    cbetLive:false,handActive:false,finished:false,acting:null,
    logLines:[],lastWin:[]
  };
}

/* =====================================================
   HAND RECORD
   ===================================================== */
function newHandRecord(){
  const me=S.players[0], ord=seatOrderFromBtn(), hu=ord.length===2;
  const sbP=hu?ord[0]:ord[1], bbP=hu?ord[1]:ord[2];
  H={
    id:Date.now()+'-'+Math.floor(rand()*1e4),
    t:Date.now(),mode:S.mode,bb:S.bb,
    pos:positionOf(me),stackBefore:me.stack,
    blinds:[{n:sbP.name,t:sbP.type},{n:bbP.name,t:bbP.type}],
    hole:'',board:'',net:0,netC:0,
    flags:{vpip:false,pfr:false,limped:false,threeBet:false,tbOpp:false,f3b:false,f3bOpp:false,
           cbetFaced:false,foldCbet:false,sawFlop:false,wtsd:false,wonSd:false,won:false},
    pBets:0,pCalls:0,
    acts:[],log:[],notes:[],result:''
  };
}
function log(line, hl){
  S.logLines.push({line,hl:!!hl});
  if(H&&S.handActive) H.log.push(line);
  renderLog();
}

/* =====================================================
   HAND FLOW
   ===================================================== */
async function startHand(){
  if(dealing||S.finished) return;
  const me=S.players[0];
  if(S.mode==='cash'&&me.stack<=0){ renderAll(); return; }
  dealing=true;
  hideCoach();

  if(S.mode==='cash'){
    S.players.forEach(p=>{ if(!p.user&&p.stack<S.startStack*0.3) p.stack=S.startStack; });
  }
  if(S.mode==='tourney'){
    if(S.handsAtLevel>=S.handsPerLevel&&S.level<S.schedule.length-1){
      S.level++; S.handsAtLevel=0;
      [S.sb,S.bb]=S.schedule[S.level];
    }
  }
  const nxt=nextLive(S.btn,p=>true);
  if(nxt) S.btn=nxt.id;

  S.players.forEach(p=>{
    p.hole=[]; p.folded=p.out; p.allIn=false; p.streetPut=0; p.handPut=0;
    p.acted=false; p.revealed=false; p.lastAct=''; p.sdName=''; p.sdScore=0;
  });
  S.deck=newDeck(); S.board=[]; S.street='pre';
  S.currentBet=0; S.lastRaiseSize=S.bb; S.preRaises=0; S.preAggressor=null; S.lastAgg=null;
  S.cbetLive=false; S.logLines=[]; S.lastWin=[]; S.handActive=true;

  newHandRecord();

  const ord=seatOrderFromBtn(), hu=ord.length===2;
  const sbP=hu?ord[0]:ord[1], bbP=hu?ord[1]:ord[2];
  post(sbP,Math.min(S.sb,sbP.stack));
  post(bbP,Math.min(S.bb,bbP.stack));
  S.currentBet=S.bb;
  if(S.mode==='tourney') log(`Level ${S.level+1}: blinds ${S.sb}/${S.bb}`);
  log(`New hand · ${ord.length} players · ${sbP.name} posts SB ${fmtC(S.sb)}, ${bbP.name} posts BB ${fmtC(S.bb)}`);

  for(const p of ord){ p.hole=[S.deck.pop(),S.deck.pop()]; }
  H.hole=S.players[0].out?'':S.players[0].hole.map(cid).join(' ');
  renderAll();

  const ok=await runBetting(bbP.id);
  if(!ok){ await finishByFolds(); dealing=false; return; }

  for(const st of ['flop','turn','river']){
    if(unfolded().length<2) break;
    dealStreet(st);
    if(actorsLeft()<2){ await runout(); break; }
    const cont=await runBetting(S.btn);
    if(!cont){ await finishByFolds(); dealing=false; return; }
  }
  if(unfolded().length>=2){ await ensureFullBoard(); await showdown(); }
  dealing=false;
}

function post(p,amt){
  amt=Math.min(amt,p.stack);
  p.stack-=amt; p.streetPut+=amt; p.handPut+=amt;
  if(p.stack===0) p.allIn=true;
}
function actorsLeft(){ return unfolded().filter(p=>!p.allIn).length; }

function dealStreet(st){
  S.street=st;
  S.players.forEach(p=>{ p.streetPut=0; p.acted=false; if(!p.folded&&!p.out&&!p.allIn) p.lastAct=''; });
  S.currentBet=0; S.lastRaiseSize=S.bb; S.lastAgg=null;
  if(st==='flop'){ S.board.push(S.deck.pop(),S.deck.pop(),S.deck.pop()); }
  else S.board.push(S.deck.pop());
  H.board=S.board.map(cid).join(' ');
  if(st==='flop'&&!S.players[0].folded&&!S.players[0].out) H.flags.sawFlop=true;
  const streetLabel=st==='flop'?'FLOP':st==='turn'?'TURN':'RIVER';
  log(`${streetLabel}: ${S.board.map(cstr).join(' ')}`,true);
  renderAll();
}

async function runBetting(startAfterId){
  let pointer=startAfterId, guard=0;
  while(guard++<300){
    if(unfolded().length<2) return false;
    const actors=unfolded().filter(p=>!p.allIn);
    if(actors.length===0) return true;
    if(actors.every(p=>p.acted&&p.streetPut===S.currentBet)) return true;
    if(actors.length===1&&actors[0].streetPut>=S.currentBet&&actors[0].acted) return true;
    const p=nextLive(pointer,x=>!x.folded&&!x.allIn);
    if(!p) return true;
    pointer=p.id;
    if(p.acted&&p.streetPut===S.currentBet) continue;
    await takeTurn(p);
    renderAll();
  }
  return true;
}

async function takeTurn(p){
  S.acting=p.id; renderAll();
  const toCall=S.currentBet-p.streetPut;
  let decision;
  if(p.user){
    decision=await userTurn(p,toCall);
  } else {
    const userOut=S.players[0].folded||S.players[0].out;
    await sleep(userOut?120:(380+rand()*420));
    decision=S.street==='pre'
      ? _aiPre(p,toCall,S,potTotal,seatOrderFromBtn,positionOf)
      : _aiPost(p,toCall,S,potTotal);
  }
  S.acting=null;
  applyAction(p,decision,toCall);
}

function legalMinRaiseTo(){ return S.currentBet+S.lastRaiseSize; }

function applyAction(p,d,toCall){
  const pot=potTotal();
  const snap={raises:S.preRaises,agg:S.preAggressor,cbetLive:S.cbetLive,lastAgg:S.lastAgg};
  if(d.act==='fold'&&toCall<=0) d={act:'check'};

  if(d.act==='fold'){
    p.folded=true; p.acted=true; p.lastAct='fold';
    log(`${p.name} folds`);
    if(p.user) recordUserAct(p,'fold',toCall,pot,0,0,snap);
    return;
  }
  if(d.act==='check'){
    p.acted=true; p.lastAct='check';
    log(`${p.name} checks`);
    if(p.user) recordUserAct(p,'check',0,pot,0,0,snap);
    return;
  }
  if(d.act==='call'){
    const amt=Math.min(toCall,p.stack);
    post(p,amt); p.acted=true; p.lastAct='call '+fmtC(amt);
    log(`${p.name} calls ${fmtC(amt)}${p.allIn?' (all-in)':''}`);
    if(p.user) recordUserAct(p,'call',toCall,pot,amt,0,snap);
    return;
  }
  let to=Math.max(d.to,S.currentBet>0?legalMinRaiseTo():S.bb);
  to=Math.min(to,p.streetPut+p.stack);
  const isAllIn=(to===p.streetPut+p.stack);
  if(!isAllIn&&to<=S.currentBet) return applyAction(p,{act:toCall>0?'call':'check'},toCall);
  if(isAllIn&&to<=S.currentBet) return applyAction(p,{act:'call'},toCall);
  const add=to-p.streetPut;
  const wasBet=S.currentBet===0;
  if(to>S.currentBet){
    const inc=to-S.currentBet;
    if(inc>=S.lastRaiseSize){ S.lastRaiseSize=inc; S.players.forEach(o=>{ if(o!==p) o.acted=false; }); }
    S.currentBet=to; S.lastAgg=p.id;
    if(S.street==='pre'){ S.preRaises++; S.preAggressor=p.id; }
    else if(S.street==='flop'){
      if(wasBet&&p.id===S.preAggressor) S.cbetLive=true;
      else if(!wasBet) S.cbetLive=false;
    }
  }
  post(p,add); p.acted=true;
  p.lastAct=(wasBet&&S.street!=='pre'?'bet ':'raise to ')+fmtC(to);
  log(`${p.name} ${wasBet&&S.street!=='pre'?'bets':'raises to'} ${fmtC(to)}${p.allIn?' (all-in)':''}`);
  if(p.user) recordUserAct(p,wasBet&&S.street!=='pre'?'bet':'raise',toCall,pot,add,to,snap);
}

/* =====================================================
   USER STAT INSTRUMENTATION
   ===================================================== */
function villainOf(id){
  const v=S.players.find(x=>x.id===id);
  return v&&!v.user?{n:v.name,t:v.type}:null;
}
function recordUserAct(p,act,toCall,potBefore,amt,to,snap){
  const st=S.street;
  const ctx={street:st,act,toCall,pot:potBefore,amt,to:to||0,pos:H.pos};
  const vs=toCall>0?villainOf(snap.lastAgg):null;
  if(vs){ ctx.vs=vs.n; ctx.vsType=vs.t; }
  ctx.opp=unfolded().filter(x=>!x.user&&!x.folded).map(x=>x.name+':'+x.type);
  if(st==='pre'){
    ctx.tier=tierOf(p.hole); ctx.unopened=snap.raises===0;
    const wasPfr=H.flags.pfr;
    const voluntary=(act==='call'||act==='raise'||act==='bet');
    if(voluntary) H.flags.vpip=true;
    if(act==='raise') H.flags.pfr=true;
    if(act==='call'&&snap.raises===0&&S.currentBet===S.bb&&H.pos!=='BB') H.flags.limped=true;
    if(snap.raises===1&&!H.flags.threeBet){
      H.flags.tbOpp=true;
      if(act==='raise') H.flags.threeBet=true;
    }
    if(wasPfr&&snap.raises>=2&&toCall>0&&!H.f3bSeen){
      if(snap.agg!==p.id){ H.f3bSeen=true; H.flags.f3bOpp=true; if(act==='fold') H.flags.f3b=true; }
    }
  } else {
    const b=bucketOf(p.hole,S.board);
    ctx.bucket=b.bucket; ctx.outs=b.outs; ctx.draws=b.draws;
    if(act==='bet'||act==='raise') H.pBets++;
    if(act==='call') H.pCalls++;
    if(st==='flop'&&snap.cbetLive&&toCall>0&&p.id!==snap.agg&&!H.cbetSeen){
      H.cbetSeen=true; H.flags.cbetFaced=true;
      if(act==='fold') H.flags.foldCbet=true;
    }
  }
  H.acts.push(ctx);
}

/* =====================================================
   USER TURN UI
   ===================================================== */
function userTurn(p,toCall){
  return new Promise(res=>{
    userResolve=res;
    renderActions(p,toCall);
    if(DATA.settings.showEquity) updateEquity(p);
    if((DATA.settings.hintMode||'question')==='question') maybeShowHint(p,toCall);
  });
}
function uact(d){
  if(!userResolve) return;
  const r=userResolve; userResolve=null;
  document.getElementById('actbar').innerHTML='';
  hideHint();
  r(d);
}
function customBet(minTo,maxTo){
  const el=document.getElementById('betin');
  if(!el) return;
  let v=parseInt(el.value);
  if(isNaN(v)||v<=0) return;
  v=Math.max(minTo,Math.min(v,maxTo));
  uact({act:'raise',to:v});
}
function hideHint(){
  const el=document.getElementById('hintpanel');
  if(el) el.style.display='none';
}
function updateEquity(p){
  const badge=document.getElementById('eqbadge');
  badge.style.display=''; badge.textContent='win % ...';
  const nOpp=unfolded().filter(x=>!x.user).length;
  setTimeout(()=>{ badge.textContent=`win ~${heroEquity(p.hole,S.board,nOpp).toFixed(0)}% vs ${nOpp} random`; },30);
}
function maybeShowHint(p,toCall){
  const el=document.getElementById('hintpanel');
  if(!el) return;
  const pot=potTotal();
  const b=S.board.length?bucketOf(p.hole,S.board):null;
  const pos=H?H.pos:positionOf(p);
  const hole=H?prettyIds(H.hole):'';
  const boardP=S.board.length?S.board.map(cstr).join(' '):'';
  const opp=S.players.find(x=>x.id===S.lastAgg&&!x.user);
  const oppName=opp?opp.name:null;
  const oppType=opp?opp.type:null;
  const stackBB=Math.round(p.stack/S.bb);
  let q=null;

  if(toCall>0&&b&&(b.bucket==='air'||b.bucket==='weak')&&toCall>pot*0.35){
    const need=Math.round(toCall/(pot+toCall)*100);
    const oppDesc=oppType==='station'?`${oppName} rarely bluffs`:oppType==='nit'?`${oppName} only bets strong hands`:oppType==='lag'?`${oppName} fires with a wide range`:oppType==='maniac'?`${oppName} bets almost anything`:oppName?`${oppName} bet into you`:'';
    const drawNote=b.draws&&b.draws.length?`You have a ${b.draws[0]} — about ${Math.round((b.outs||0)*2)}% to improve next card.`:'';
    q=pick([
      `About to call ${fmtC(toCall)} into ${fmtC(pot)} on the ${S.street} with ${BUCKET_PHRASE[b.bucket]} (${boardP}). You need roughly ${need}% equity. ${oppDesc?oppDesc+'.':''} Can you name two worse hands they might have that you beat?`,
      `Before you call: the break-even price here is ${need}% equity and you have ${BUCKET_PHRASE[b.bucket]} on ${boardP}. ${oppDesc?oppDesc+'.':''} Is this a real bluff-catch or are you just hoping to be right?`,
      `${fmtC(toCall)} to call into ${fmtC(pot)}, needing ${need}% equity. You have ${BUCKET_PHRASE[b.bucket]}. ${drawNote||'What is your plan if the next card does not help?'}`,
      `Calling ${fmtC(toCall)} needs ${need}% equity to break even. With ${BUCKET_PHRASE[b.bucket]} on ${boardP}, what hands worse than yours would ${oppName||'your opponent'} bet here? If you cannot name two, this is a fold.`,
    ]);
  }
  else if(toCall<=0&&S.street==='flop'&&H&&H.flags.pfr&&b&&(b.bucket==='strong'||b.bucket==='monster')){
    const bet=fmtC(Math.round(pot*0.6));
    q=pick([
      `You raised preflop and have ${BUCKET_PHRASE[b.bucket]} on ${boardP}. Before checking: what happens if you bet ${bet}? Who at this table calls with worse hands?`,
      `${BUCKET_PHRASE[b.bucket]} on ${boardP} as the preflop raiser. Checking gives everyone a free card. Who is most likely to bet if you check? Is that what you want?`,
      `Strong hand on ${boardP}. Bet now to build the pot, or check to trap an aggressive player? Think about who is still in and how they play.`,
    ]);
  }
  else if(toCall>=p.stack*0.65&&b){
    q=pick([
      `Facing an all-in call with ${BUCKET_PHRASE[b.bucket]} on ${boardP}. ${oppName?`What does ${oppName}'s shoving range look like?`:'What hands would your opponent shove here?'} Are you ahead of most of those or behind?`,
      `Stack commitment decision. ${BUCKET_PHRASE[b.bucket]} on ${boardP}. ${oppName&&oppType?`${oppName} is ${oppType==='maniac'?'a maniac who shoves wide':oppType==='nit'?'a nit whose shoves are almost always strong':oppType==='lag'?'a LAG who shoves draws and value':'playing solid poker'}.`:''} Enough equity to go all-in?`,
    ]);
  }
  else if(S.mode==='tourney'&&S.street==='pre'&&stackBB<=15&&toCall<=0){
    q=pick([
      `You have ${stackBB} big blinds with ${hole} from ${pos}. Short stack means shove or fold. Is this hand strong enough to go all-in and be happy getting called? If yes, shove. If no, fold.`,
      `${stackBB} BB with ${hole} from ${pos}. Limping or calling small wastes fold equity. Either your hand is worth shoving everything, or it is a fold.`,
    ]);
  }
  else if(toCall<=0&&S.street==='flop'&&H&&H.flags.pfr&&b&&b.bucket==='air'&&!H.cbetHintShown){
    H.cbetHintShown=true;
    const third=fmtC(Math.round(pot*0.4)), half=fmtC(Math.round(pot/2));
    q=pick([
      `You raised preflop and missed the flop (${boardP}). A c-bet of ${third} to ${half} continues the story you told preflop. Do you want to bet and represent strength, or check and see the turn free?`,
      `Preflop raiser on ${boardP} with nothing. A c-bet says you still have a hand. Opponents who missed have to fold. The bet only needs to work about 40% of the time to be profitable. Fire or check?`,
    ]);
  }
  else if(S.street==='pre'&&toCall>S.bb*3&&p.hole.length&&tierOf(p.hole)>=5){
    q=pick([
      `Facing a raise of ${fmtC(toCall)} with ${hole} from ${pos}. Does this hand play well against the raiser's range? What is your plan if you miss the flop out of position?`,
      `${hole} facing a ${fmtC(toCall)} raise. Is this hand worth shoving all-in over the raise? Or is it a fold? Calling and then folding flops is a slow chip drain.`,
    ]);
  }
  else if(S.street==='river'&&toCall>0&&b&&(b.bucket==='medium'||b.bucket==='weak')){
    q=pick([
      `River call on ${boardP} with ${BUCKET_PHRASE[b.bucket]}. Does ${oppName||'your opponent'} ever bluff here? If they only bet rivers with strong hands, fold. If they fire rivers wide, call.`,
      `${BUCKET_PHRASE[b.bucket]} on the river (${boardP}). Think about their entire line: flop, turn, river. Does that betting pattern look more like a value hand or a missed draw turned bluff?`,
    ]);
  }
  else if(toCall<=0&&S.street!=='pre'&&b&&(b.bucket==='strong'||b.bucket==='monster')){
    q=pick([
      `${BUCKET_PHRASE[b.bucket]} on ${boardP}. How much should you bet? Small bets build small pots. Big bets build big pots but may fold weaker hands. What size gets called by hands you beat?`,
      `You have ${BUCKET_PHRASE[b.bucket]} and first to act on ${boardP}. Who is most likely to call a bet here and what might they have?`,
    ]);
  }

  if(!q){ el.style.display='none'; return; }
  el.innerHTML=`<div class="eyebrow">Coach question</div>
    <div class="question">${q}</div>
    <div class="hint-actions">
      <button class="hbtn dismiss" onclick="hideHint()">Got it, continue</button>
    </div>`;
  el.style.display='';
}

/* =====================================================
   ENDINGS
   ===================================================== */
async function finishByFolds(){
  const w=unfolded()[0], pot=potTotal();
  w.stack+=pot; S.lastWin=[w.id]; w.lastAct='wins '+fmtC(pot);
  log(`${w.name} wins ${fmtC(pot)} — everyone else folded, no showdown needed`,true);
  await endHand(false);
}
async function ensureFullBoard(){
  while(S.board.length<5){
    await sleep(450);
    if(S.board.length===0){ S.street='flop'; S.board.push(S.deck.pop(),S.deck.pop(),S.deck.pop()); }
    else{ S.street=S.board.length===3?'turn':'river'; S.board.push(S.deck.pop()); }
    H.board=S.board.map(cid).join(' ');
    const stl=S.street==='flop'?'FLOP':S.street==='turn'?'TURN':'RIVER';
    log(`${stl}: ${S.board.map(cstr).join(' ')}`,true);
    renderAll();
  }
}
async function runout(){ unfolded().forEach(p=>p.revealed=true); renderAll(); await ensureFullBoard(); }
async function showdown(){
  const inHand=unfolded();
  inHand.forEach(p=>{ p.revealed=true; });
  if(!S.players[0].folded&&!S.players[0].out) H.flags.wtsd=true;
  inHand.forEach(p=>{ const ev=evalBest(p.hole.concat(S.board)); p.sdScore=ev.score; p.sdName=CAT_NAMES[ev.cat]; });
  const contributors=S.players.filter(p=>p.handPut>0);
  const levels=[...new Set(inHand.map(p=>p.handPut))].sort((a,b)=>a-b);
  let prev=0;
  const winners=new Set();
  for(const lvl of levels){
    let potAmt=0;
    contributors.forEach(p=>{ potAmt+=Math.max(0,Math.min(p.handPut,lvl)-prev); });
    const elig=inHand.filter(p=>p.handPut>=lvl);
    const best=Math.max(...elig.map(p=>p.sdScore));
    const ws=elig.filter(p=>p.sdScore===best);
    const share=Math.floor(potAmt/ws.length);
    ws.forEach((w,i)=>{ w.stack+=share+(i===0?potAmt-share*ws.length:0); winners.add(w.id); });
    prev=lvl;
  }
  S.lastWin=[...winners];
  const wNames=inHand.filter(p=>winners.has(p.id));
  wNames.forEach(w=>{ w.lastAct='wins'; });
  const allHandsStr=inHand.map(w=>`${w.name}: ${w.sdName}`).join(', ');
  let resultMsg;
  if(wNames.length>1){
    const potAmt=S.players.reduce((a,p)=>a+p.handPut,0);
    resultMsg=`Showdown, cards revealed: ${allHandsStr}. Split pot: both had ${wNames[0].sdName}. ${fmtC(potAmt)} divided equally.`;
  } else if(wNames.length===1){
    const loserStr=inHand.filter(p=>!winners.has(p.id)).map(p=>`${p.name} had ${p.sdName}`).join(', ');
    resultMsg=`Showdown: ${wNames[0].name} wins with ${wNames[0].sdName}${loserStr?` (${loserStr})`:''}`;
  } else { resultMsg=`Showdown: ${allHandsStr}`; }
  log(resultMsg,true);
  if(winners.has(0)) H.flags.wonSd=true;
  renderAll();
  await endHand(true);
}

async function endHand(wasShowdown){
  S.handActive=false;
  const me=S.players[0];
  const netC=me.stack-H.stackBefore;
  H.netC=netC; H.net=+(netC/S.bb).toFixed(2);
  H.flags.won=netC>0;
  H.result=netC>0?`won ${fmtC(netC)}`:netC<0?`lost ${fmtC(Math.abs(netC))}`:'broke even';

  if(!me.out){
    const tally=s=>{
      s.hands++;
      if(H.flags.vpip)s.vpip++; if(H.flags.pfr)s.pfr++; if(H.flags.limped)s.limped++;
      if(H.flags.tbOpp)s.tbOpp++; if(H.flags.threeBet)s.tb++;
      if(H.flags.f3bOpp)s.f3bOpp++; if(H.flags.f3b)s.f3b++;
      if(H.flags.cbetFaced)s.cbetFaced++; if(H.flags.foldCbet)s.foldCbet++;
      if(H.flags.sawFlop)s.sawFlop++; if(H.flags.wtsd)s.wtsd++; if(H.flags.wonSd)s.wonSd++;
      s.pBets+=H.pBets; s.pCalls+=H.pCalls;
      s.netBB+=H.net; if(H.flags.won)s.won++;
    };
    tally(SESSION); tally(DATA.life);
    H.notes=coachNotes();
    DATA.hands.push(compactRecord());
    saveData();
  }

  if(S.mode==='tourney'){
    S.handsAtLevel++;
    S.players.forEach(p=>{ if(!p.out&&p.stack<=0){ p.out=true; log(`${p.name} is eliminated`); } });
    const alive=liveSeats();
    if(me.out){
      const place=alive.length+1;
      S.finished=true;
      log(`Tournament over. You finished ${ordinal(place)} of ${S.numPlayers}. Start a new game below.`,true);
      endGameButtons();
    } else if(alive.length===1){
      S.finished=true;
      log(`Tournament over. You win. Last player standing.`,true);
      endGameButtons();
    }
  }

  renderAll();
  _showCoach(H,S,showModal,closeModal);
}

function compactRecord(){
  return {id:H.id,t:H.t,mode:H.mode,pos:H.pos,bb:H.bb,hole:H.hole,board:H.board,
          net:H.net,netC:H.netC,flags:H.flags,notes:H.notes,log:H.log.slice(0,60),result:H.result};
}
function ordinal(n){ return n+(['th','st','nd','rd'][((n%100-20)%10)]||['th','st','nd','rd'][n%100]||'th'); }

/* =====================================================
   COACHING ENGINE
   ===================================================== */
function needPct(toCall,pot){ return Math.round(toCall/(pot+toCall)*100); }
function stationIn(opp){ const s=(opp||[]).find(o=>o.endsWith(':station')); return s?s.split(':')[0]:null; }

function coachNotes(){
  const cands=[];
  const A=H.acts;
  const pre=A.filter(a=>a.street==='pre');
  const post=A.filter(a=>a.street!=='pre');
  const hole=prettyIds(H.hole);
  const boardP=prettyIds(H.board);
  const stackBB=Math.round(H.stackBefore/H.bb);

  if(H.flags.limped){
    cands.push({key:'limp',p:1,t:pick([
      `You limped ${hole} from ${H.pos}. Raise to about ${fmtC(H.bb*3)} or fold. Limping builds no pot when you are ahead, gives the blinds a free look, and announces a weak hand.`,
      `Limping ${hole} from ${H.pos} is a recurring leak. A raise to ${fmtC(H.bb*3)} does three things limping never can: it builds a pot while you are ahead, it can take the pot down preflop, and it gives you the initiative on the flop.`,
    ]),short:pick([
      `Limped again (${hole} from ${H.pos}). Same leak: raise or fold, no limping.`,
      `Another limp (${hole}, ${H.pos}). Raise to ${fmtC(H.bb*3)} or fold every time.`,
    ])});
  }
  const firstVol=pre.find(a=>a.act==='call'||a.act==='raise');
  if(firstVol&&firstVol.tier>=6&&(H.pos==='UTG'||H.pos==='HJ')&&!H.flags.limped){
    cands.push({key:'looseEarly',p:2,t:pick([
      `${hole} from ${H.pos} is outside a solid opening range with ${H.pos==='UTG'?'five':'four'} players still behind you. Up front, stick to pairs, big aces, and strong broadways.`,
      `Opening ${hole} from ${H.pos} is too loose. Early position ranges need to be tight because you play the whole hand without information.`,
    ]),short:`${hole} from ${H.pos}: too loose for early position again.`});
  }
  const coldCall=pre.find(a=>a.act==='call'&&a.toCall>H.bb);
  if(coldCall&&coldCall.tier>=6){
    const v=coldCall.vs||'the raiser';
    cands.push({key:'coldCall',p:2,t:pick([
      `Flat-calling ${v}'s raise with ${hole} is a long-term loser: you are paying ${fmtC(coldCall.toCall)} to play a weak hand against a range that has you beat. Fold it.`,
      `Calling ${v}'s raise with ${hole} is the passive play with a hand that does not warrant it. You paid a big price to enter a pot against a stronger range, likely out of position.`,
    ]),short:`Called a raise with ${hole} again. Weak hands vs raising ranges bleed chips.`});
  }
  for(const a of post){
    if(a.act==='call'&&(a.bucket==='air'||a.bucket==='weak')&&a.outs>0&&a.street!=='river'){
      const eq=Math.round(a.outs*2.1), need=needPct(a.toCall,a.pot);
      if(need>eq+10){
        cands.push({key:'chase',p:1,t:pick([
          `${a.street.charAt(0).toUpperCase()+a.street.slice(1)}, board ${boardP}: you called ${fmtC(a.toCall)} into a pot of ${fmtC(a.pot)} chasing your ${a.draws.join(' and ')}. The price required about ${need}% equity; ${a.outs} outs is roughly ${eq}%. Outs times 2 per card to come.`,
          `Chasing your ${a.draws.join(' and ')} on the ${a.street} cost ${fmtC(a.toCall)} into ${fmtC(a.pot)}. You needed ${need}% equity but had about ${eq}%. Rule: outs × 2 = approximate equity per card.`,
        ])});
        break;
      }
    }
  }
  for(const a of post){
    if(a.act==='call'&&(a.bucket==='air'||a.bucket==='weak')&&a.outs<4&&a.toCall>a.pot*0.55){
      const v=a.vs||'your opponent', vt=a.vsType||'';
      let read='';
      if(vt==='station'||vt==='nit'||vt==='tag') read=` ${v} is ${vt==='station'?'a calling station':vt==='nit'?'a nit':'a TAG'}; big bets from passive or tight players are almost pure value.`;
      else if(vt==='lag'||vt==='maniac') read=` ${v} bluffs plenty, but with ${BUCKET_PHRASE[a.bucket]} you lose to their value hands anyway.`;
      cands.push({key:'bigCallWeak',p:1,t:pick([
        `You called ${fmtC(a.toCall)} on the ${a.street} (board ${boardP}) holding ${BUCKET_PHRASE[a.bucket]}.${read} Without equity or fold equity, the chips just transfer.`,
        `${fmtC(a.toCall)} call on the ${a.street} with ${BUCKET_PHRASE[a.bucket]} on ${boardP}.${read} Save those chips for spots where you can win.`,
      ])});
      break;
    }
  }
  const monsterActs=post.filter(a=>a.bucket==='monster');
  if(monsterActs.length>=2&&!monsterActs.some(a=>a.act==='bet'||a.act==='raise')){
    const sIn=stationIn(monsterActs[0].opp);
    cands.push({key:'passiveMonster',p:2,t:pick([
      `You made ${BUCKET_PHRASE.monster} on ${boardP} and never bet or raised. One slowplay street can be fine; passive lines all hand leave money behind${sIn?` — ${sIn} the calling station would have paid you on every street`:''}.`,
      `${BUCKET_PHRASE.monster} on ${boardP} and you checked through multiple streets. The risk of slowplaying is that opponents do not improve enough to pay you. Bet big hands.`,
    ])});
  }
  const rv=post.find(a=>a.street==='river'&&(a.bucket==='strong'||a.bucket==='monster')&&a.act==='check');
  if(rv&&!cands.some(c=>c.key==='passiveMonster')){
    const half=fmtC(Math.round(rv.pot/2)), sIn=stationIn(rv.opp);
    cands.push({key:'missedValue',p:3,t:pick([
      `River, board ${boardP}: you checked ${BUCKET_PHRASE[rv.bucket]}. A bet around ${half} gets paid more often than it gets punished. ${sIn?`Against ${sIn} the answer is yes every time.`:''}`,
      `You checked back ${BUCKET_PHRASE[rv.bucket]} on the river (${boardP}). That is a missed value bet. On the river, your hand does not get better. Either bet now or accept you gave up a bet.`,
    ])});
  }
  const flopCheck=post.find(a=>a.street==='flop'&&a.act==='check'&&a.toCall===0);
  if(H.flags.pfr&&flopCheck&&flopCheck.bucket!=='monster'&&H.flags.sawFlop){
    const third=fmtC(Math.round(flopCheck.pot/3)), half=fmtC(Math.round(flopCheck.pot/2));
    const boardCards=prettyIds(H.board.split(' ').slice(0,3).join(' '));
    cands.push({key:'missedCbet',p:3,t:pick([
      `You raised preflop (taking the lead) then checked the flop ${boardCards} without betting. A c-bet of ${third} to ${half} continues your preflop story. Betting ${third} makes opponents decide whether to call. Many fold.`,
      `Raised preflop then checked the flop ${boardCards}. A c-bet of ${third} to ${half} continues your preflop story. Even when you miss, opponents have to worry about overpairs and sets in your range.`,
    ])});
  }
  for(const a of post){
    if((a.act==='bet'||a.act==='raise')&&a.bucket==='air'&&a.outs<4){
      const sIn=stationIn(a.opp);
      if(sIn){
        cands.push({key:'bluffStation',p:2,t:pick([
          `You fired ${fmtC(a.amt)} at the ${a.street} with ${BUCKET_PHRASE.air}, with ${sIn} still in the hand. ${sIn} is a calling station: stations call, so bluffs into them are burned money.`,
          `Bluffed ${sIn} on the ${a.street} with ${BUCKET_PHRASE.air}. Calling stations do not fold to bets — that is literally their defining trait.`,
        ])});
        break;
      }
    }
  }
  if(H.mode==='tourney'&&stackBB<=15&&(H.flags.limped||(coldCall&&coldCall.toCall<=H.bb*3))){
    cands.push({key:'shortStack',p:1,t:pick([
      `You started this hand with ${stackBB} big blinds. That is shove-or-fold territory: limping and flat-calling burn the fold equity a short stack lives on.`,
      `${stackBB} big blinds is push-or-fold depth. Limping or calling small is the worst of both worlds.`,
    ])});
  }
  if(!H.flags.vpip&&pre.length&&pre[0].unopened&&(H.pos==='BTN'||H.pos==='CO'||H.pos==='SB')){
    const t1=H.blinds&&H.blinds[0]?H.blinds[0]:null, t2=H.blinds&&H.blinds[1]?H.blinds[1]:null;
    const tightBlinds=[t1,t2].filter(x=>x&&(x.t==='nit'||x.t==='tag'));
    if(pre[0].tier<=6&&tightBlinds.length>=1&&rand()<.6){
      cands.push({key:'steal',p:3,t:pick([
        `Folded ${hole} from the ${H.pos} when it was unopened with ${tightBlinds.map(x=>x.n).join(' and ')} in the blinds. Raising a wide range here picks up the blinds over and over. Stealing is where late position prints.`,
        `${H.pos} with ${hole} unopened and tight players in the blinds. This is exactly the spot to raise. A raise to ${fmtC(H.bb*3)} wins the pot more often than not.`,
      ])});
    }
  }
  const userOpen=pre.find(a=>a.act==='raise'&&a.unopened);
  if(userOpen&&userOpen.to>0){
    const xBB=userOpen.to/H.bb;
    if(xBB<=2.1&&H.stackBefore/H.bb>12){
      cands.push({key:'minRaise',p:3,t:pick([
        `You opened ${hole} with a min-raise to ${fmtC(userOpen.to)}. Min-raises give the blinds an irresistible price. Standard opens are 2.5x to 3x (${fmtC(Math.round(H.bb*2.5))} to ${fmtC(H.bb*3)}).`,
        `Min-raised ${hole} to ${fmtC(userOpen.to)}. That price is too cheap. Standard opens run ${fmtC(Math.round(H.bb*2.5))} to ${fmtC(H.bb*3)} for a reason.`,
      ])});
    } else if(xBB>=4.6&&userOpen.to<H.stackBefore*0.5){
      cands.push({key:'overOpen',p:3,t:pick([
        `Your open with ${hole} was ${fmtC(userOpen.to)}, about ${Math.round(xBB*10)/10}x. Oversized opens fold out all the worse hands that would have paid you. Stick to 2.5x to 3.5x.`,
        `Opened ${hole} to ${fmtC(userOpen.to)} (${Math.round(xBB*10)/10}x BB) — too big. You scare away weaker hands and only get called by hands that have you in trouble.`,
      ])});
    }
  }
  const multiAct=post.find(a=>(a.act==='call'||a.act==='bet')&&(a.bucket==='weak'||a.bucket==='medium')&&a.opp&&a.opp.length>=3);
  if(multiAct){
    cands.push({key:'multiway',p:3,t:pick([
      `You put chips in on the ${multiAct.street} with ${BUCKET_PHRASE[multiAct.bucket]} against ${multiAct.opp.length} opponents. Hand values drop sharply multiway. In multiway pots, tighten up.`,
      `${BUCKET_PHRASE[multiAct.bucket]} in a ${multiAct.opp.length}-way pot on the ${multiAct.street}. Every extra opponent cuts into your equity.`,
    ])});
  }
  const rivBet=post.find(a=>a.street==='river'&&(a.act==='bet'||a.act==='raise')&&(a.bucket==='strong'||a.bucket==='monster'));
  if(rivBet&&H.flags.won&&rand()<.5){
    cands.push({key:'riverValue',p:4,t:pick([
      `Nice river bet of ${fmtC(rivBet.amt||rivBet.to)} with ${BUCKET_PHRASE[rivBet.bucket]}. The river is where the money is made: most players check back strong hands and miss a full bet of value.`,
      `Good river value bet with ${BUCKET_PHRASE[rivBet.bucket]}. Most players check strong river hands out of fear. You bet and got paid.`,
    ])});
  }
  if(H.pos==='BB'&&!H.flags.pfr&&H.flags.sawFlop&&H.flags.won&&pre.every(a=>a.act==='check'||a.toCall===0)&&rand()<.4){
    cands.push({key:'bbFree',p:4,t:pick([
      `Won with ${hole} from the BB after checking your option. Free flops in the big blind are pure profit opportunities. The skill is recognizing when your free flop connected and betting it.`,
      `Big blind free play with ${hole} — and you won it. The key is acting on it when the board connects. You did.`,
    ])});
  }
  if(!H.flags.wtsd&&H.flags.won&&H.pBets>0){
    cands.push({key:'goodAggro',p:4,t:pick([
      `Won ${fmtC(Math.abs(H.netC))} without showdown after taking the lead. That is the whole point of aggression: you collect pots you would have lost at showdown.`,
      `Won the hand before showdown with ${hole}. Aggression wins pots two ways: best hand at showdown, or everyone folds.`,
    ])});
  }
  const goodFold=post.find(a=>a.act==='fold'&&(a.bucket==='air'||a.bucket==='weak')&&a.toCall>a.pot*0.5&&a.pot>H.bb*8);
  if(goodFold&&rand()<.5){
    cands.push({key:'goodFold',p:4,t:pick([
      `Disciplined fold on the ${goodFold.street} holding ${BUCKET_PHRASE[goodFold.bucket]} against ${goodFold.vs||'a big bet'} of ${fmtC(goodFold.toCall)}. Chips you do not lose count exactly the same as chips you win.`,
      `Good laydown on the ${goodFold.street} with ${BUCKET_PHRASE[goodFold.bucket]}. Folding is the only play that profits over time here.`,
    ])});
  }
  if(!cands.length){
    const fb=keyDecisionNote(hole,boardP);
    if(fb) cands.push(fb);
  }
  cands.sort((a,b)=>a.p-b.p);
  const fresh=cands.filter(c=>!recentNoteKeys.includes(c.key));
  let picked=(fresh.length?fresh:cands).slice(0,2);
  if(!fresh.length&&picked[0]&&picked[0].short) picked=[Object.assign({},picked[0],{t:picked[0].short})];
  picked.forEach(c=>recentNoteKeys.push(c.key));
  if(recentNoteKeys.length>10) recentNoteKeys=recentNoteKeys.slice(-10);
  return picked.map(c=>c.t);
}

function keyDecisionNote(hole,boardP){
  const A=H.acts;
  if(!A.length) return null;
  if(!H.flags.vpip){
    const a=A[0], t=a.tier||8, pos=H.pos;
    const edgeMap={UTG:'strong pairs (77+), big aces (AJ+), and KQs','UTG+1':'pairs 66+, ATs+, AJo+, and KQs','UTG+2':'pairs 55+, A9s+, ATo+, KQs, KJs',LJ:'pairs 44+, any suited ace, ATo+, KQs, KJs',HJ:'pairs 33+, any suited ace, ATo+, KJs, QJs',CO:'any pair, any ace, KT+, QJ+, suited connectors',BTN:'roughly the top 40%: any pair, any ace, any broadway, suited connectors',SB:'any pair, any ace, K9+, Q9+, and suited hands',BB:'you already paid, so defend any pair, suited hands, connected cards, and broadway'};
    const edge=edgeMap[pos]||'strong hands from your position';
    if(t<=3) return {key:'preFoldClose',p:3,t:pick([`${hole} from ${pos} is borderline. A solid ${pos} range includes ${edge}. This hand sits right at the edge.`,`${hole} from ${pos}: a fold most of the time but barely. The ${pos} range includes ${edge}.`])};
    const pool=[`${hole} from ${pos}: correct fold. The ${pos} opening range is ${edge}. This hand does not reach that threshold.`,`Folded ${hole} from ${pos}. Smart. Save the chips for when you have a real hand from a better seat.`];
    return {key:'preFold',p:5,t:pool[Math.floor(rand()*pool.length)]};
  }
  const a=A.reduce((m,x)=>(Math.max(x.toCall,x.amt,x.to)>Math.max(m.toCall,m.amt,m.to)?x:m),A[0]);
  const stName=a.street==='pre'?'preflop':a.street;
  if(a.street!=='pre'){
    const bp=BUCKET_PHRASE[a.bucket]||'your hand';
    const drawTxt=a.draws&&a.draws.length?` plus a ${a.draws[0]}`:'';
    const opp=a.vs||'your opponent';
    const need=needPct(a.toCall,a.pot);
    if(a.act==='call') return {key:'reviewCall',p:5,t:pick([`Key decision: ${stName} on ${boardP}. You called ${fmtC(a.toCall)} into ${fmtC(a.pot)} with ${bp}${drawTxt}. You needed about ${need}% equity. Before every call ask: what worse hands does ${opp} have here?`,`${stName} call check: ${fmtC(a.toCall)} into ${fmtC(a.pot)} with ${bp}${drawTxt}. Break-even equity: ${need}%.`])};
    if(a.act==='bet'||a.act==='raise') return {key:'reviewBet',p:5,t:pick([`${stName}, board ${boardP}: you bet ${fmtC(a.amt||a.to)} with ${bp}${drawTxt}. Taking the initiative is usually right.`,`You bet ${fmtC(a.amt||a.to)} on the ${stName} with ${bp}${drawTxt} on ${boardP}. Aggression with a made hand or draw is correct.`])};
    if(a.act==='fold'){
      const tight=(a.bucket==='medium'||a.bucket==='strong');
      return {key:'reviewFold',p:5,t:tight?pick([`Key decision: you folded ${bp} on the ${stName} (${boardP}) to a bet of ${fmtC(a.toCall)}. You only needed ${need}% equity. With a made hand that fold is likely too tight.`,`Folded ${bp} on the ${stName}. The price was ${need}% equity needed.`]):pick([`Folded ${bp} on the ${stName} (${boardP}) to ${fmtC(a.toCall)}. With ${bp}, letting it go is correct.`,`Good fold on the ${stName} with ${bp}. You needed ${need}% equity and ${bp} rarely has that.`])};
    }
  }
  if(H.flags.pfr&&!H.flags.sawFlop) return {key:'reviewSteal',p:5,t:pick([`Your ${hole} raise from ${H.pos} took it down preflop. That is a profitable result: you risked ${fmtC(H.bb*3)} and picked up ${fmtC(H.bb*1.5)} in blinds without a showdown.`,`Raised ${hole} from ${H.pos} and everyone folded. This is exactly what late position raises are for.`])};
  return {key:'reviewGeneric',p:6,t:pick([`Played ${hole} from ${H.pos} for ${H.result}. Go back through the hand in History and identify the one decision you are least sure about.`,`${hole} from ${H.pos}: ${H.result}. The habit to build is thinking in ranges, not hands.`])};
}

/* =====================================================
   RENDER LAYER
   ===================================================== */
export function renderAll(){ renderTicker(); renderMode(); renderSeats(); renderCenter(); renderMe(); }

export function renderTicker(){
  const d=derive(DATA.life), f=(v)=>v===null?'·':v.toFixed(1);
  const bbCls=d.bb100===null?'':(d.bb100>=0?'pos':'neg');
  const saveTxt=saveState==='ok'?'<b class="pos">saved</b>':'<b class="warn">error</b>';
  document.getElementById('ticker').innerHTML=
    `<span>VPIP<b>${f(d.vpip)}</b></span>`+
    `<span>PFR<b>${f(d.pfr)}</b></span>`+
    `<span>AF<b>${d.af===null?'·':d.af.toFixed(1)}</b></span>`+
    `<span>BB/100<b class="${bbCls}">${d.bb100===null?'·':(d.bb100>=0?'+':'')+d.bb100.toFixed(1)}</b></span>`+
    `<span>HANDS<b>${DATA.life.hands}</b></span>`+
    `<span>SAVE${saveTxt}</span>`;
}
export function renderMode(){
  const el=document.getElementById('modeinfo');
  if(S.mode==='cash'){
    el.innerHTML=`blinds <b>${fmtC(S.sb)} / ${fmtC(S.bb)}</b> · stacks ${fmtC(S.startStack)} · <b>${S.numPlayers}</b> players`;
  } else {
    const next=S.handsPerLevel-S.handsAtLevel;
    el.innerHTML=`level <b>${S.level+1}</b> · blinds <b>${S.sb}/${S.bb}</b> · up in ${next} · <b>${S.numPlayers}</b> players`;
  }
  document.getElementById('mode-cash').classList.toggle('on',S.mode==='cash');
  document.getElementById('mode-tourney').classList.toggle('on',S.mode==='tourney');
  const me=S.players[0];
  document.getElementById('rebuyBtn').style.display=(S.mode==='cash'&&me.stack<S.startStack&&!S.handActive)?'':'none';
  const eqBtn=document.getElementById('eqToggle');
  eqBtn.textContent='Win %: '+(DATA.settings.showEquity?'on':'off');
  eqBtn.classList.toggle('active',!!DATA.settings.showEquity);
}
export function cardHTML(c,cls){
  const red=(c.s==='h'||c.s==='d')?' red':'';
  return `<span class="card${red} ${cls||''}">${RANKCH[c.r]}${SUITCH[c.s]}</span>`;
}
export function renderSeats(){
  const players=S.players.slice(1), n=players.length;
  const halfArc=Math.min(60+Math.max(0,n-2)*20,140);
  const startDeg=270-halfArc, rx=38, ry=37;
  const html=players.map((p,i)=>{
    const deg=n===1?270:startDeg+(i/(n-1))*halfArc*2;
    const rad=deg*Math.PI/180;
    const x=(50+rx*Math.cos(rad)).toFixed(1), y=(50+ry*Math.sin(rad)).toFixed(1);
    const acting=S.acting===p.id?' acting':'';
    const folded=p.folded&&!p.out?' folded':'';
    const out=(p.out&&!p.revealed)?' out':'';
    const isBtn=S.btn===p.id;
    let cards='';
    if(!p.folded&&p.hole.length&&(p.revealed||!p.out)){
      cards=p.revealed
        ?`<span class="cards">${cardHTML(p.hole[0],'sm')}${cardHTML(p.hole[1],'sm')}</span>`
        :`<span class="cards"><span class="card sm back"></span><span class="card sm back"></span></span>`;
    }
    const won=S.lastWin.includes(p.id);
    const actCls=p.lastAct==='fold'?'act-fold':(won?'act-win':'');
    return `<button class="seat${acting}${folded}${out}" onclick="villainCard('${p.type}')" ${p.out?'disabled':''} style="left:${x}%;top:${y}%">
      ${isBtn?'<span class="dbtn">D</span>':''}
      <div class="nm"><b>${p.name}</b><span class="tag">${PROF[p.type].label}</span></div>
      <div class="row2">${cards||'<span></span>'}<span class="stk">${p.out?'OUT':fmtC(p.stack)}</span></div>
      <div class="bet ${actCls}">${p.out?'':(p.lastAct||(p.streetPut>0?fmtC(p.streetPut):''))}</div>
      ${p.revealed&&p.sdName?`<div class="hand-name">${p.sdName}</div>`:''}
    </button>`;
  }).join('');
  document.getElementById('seats').innerHTML=html;
}
export function renderCenter(){
  document.getElementById('potline').innerHTML=`Pot <b>${fmtC(potTotal())}</b>`;
  let bh=S.board.map(c=>cardHTML(c,'lg')).join('');
  for(let i=S.board.length;i<5;i++) bh+='<span class="slot"></span>';
  document.getElementById('board').innerHTML=bh;
}
export function renderLog(){
  document.getElementById('log').innerHTML=S.logLines.slice(-30).map(l=>`<div class="${l.hl?'hl':''}">${l.line}</div>`).join('');
}
export function renderMe(){
  const me=S.players[0];
  const pos=me.out?'OUT':positionOf(me);
  document.getElementById('mepos').textContent=pos;
  document.getElementById('mestk').innerHTML=`stack <b>${fmtC(me.stack)}</b>${me.streetPut>0?` · in ${fmtC(me.streetPut)}`:''}`;
  const mc=document.getElementById('mecards');
  if(me.hole.length&&!me.out){
    mc.innerHTML=cardHTML(me.hole[0],'lg')+cardHTML(me.hole[1],'lg');
    mc.style.opacity=me.folded?.35:1;
  } else mc.innerHTML='';
  const tc=document.getElementById('metocall');
  if(S.acting===0){ const toCall=S.currentBet-me.streetPut; tc.textContent=toCall>0?`${fmtC(toCall)} to call`:''; }
  else tc.textContent='';
  if(!DATA.settings.showEquity||S.acting!==0) document.getElementById('eqbadge').style.display='none';
  const hint=document.getElementById('poshint');
  hint.textContent=(S.handActive&&!me.out&&POSINFO[pos])?POSINFO[pos].hint:'';
  if(S.acting!==0&&!userResolve){
    const bar=document.getElementById('actbar');
    if(!S.handActive&&!S.finished){
      const canDeal=!(S.mode==='cash'&&me.stack<=0);
      bar.innerHTML=`<button class="abtn primary" onclick="startHand()" ${canDeal?'':'disabled'}>Deal next hand</button>`+
        (canDeal?'':'<span class="tocall" style="align-self:center">Rebuy to keep playing</span>');
    } else if(S.handActive){ bar.innerHTML=''; }
  }
}
export function renderActions(p,toCall){
  const pot=potTotal(), bar=document.getElementById('actbar');
  let html='';
  if(toCall>0) html+=`<button class="abtn fold" onclick='uact({act:"fold"})'>Fold</button>`;
  if(toCall<=0) html+=`<button class="abtn call" onclick='uact({act:"check"})'>Check</button>`;
  else html+=`<button class="abtn call" onclick='uact({act:"call"})'>Call ${fmtC(Math.min(toCall,p.stack))}</button>`;
  const maxTo=p.streetPut+p.stack, chips=[];
  const addChip=(label,to)=>{
    to=Math.round(to);
    const minTo=S.currentBet>0?legalMinRaiseTo():S.bb;
    if(to<minTo) to=minTo;
    if(to>=maxTo) return;
    if(chips.some(c=>c.to===to)) return;
    chips.push({label,to});
  };
  if(S.street==='pre'){
    if(S.preRaises===0){ addChip('3x',S.bb*3); addChip('4x',S.bb*4); addChip('5x',S.bb*5); }
    else { addChip('3x',S.currentBet*3); addChip('4.5x',S.currentBet*4.5); }
  } else {
    if(S.currentBet===0){ addChip('⅓',pot/3); addChip('½',pot/2); addChip('¾',pot*0.75); addChip('pot',pot); }
    else { addChip('2.5x',S.currentBet*2.5); addChip('3.5x',S.currentBet*3.5); }
  }
  let sz=`<span class="sizes"><span class="lbl">${S.currentBet>0?'raise to':'bet'}</span>`;
  chips.forEach(c=>{ sz+=`<button class="chip" onclick='uact({act:"raise",to:${c.to}})'>${c.label} ${fmtC(c.to)}</button>`; });
  sz+=`<button class="chip" onclick='uact({act:"raise",to:${maxTo}})'>all-in ${fmtC(maxTo)}</button>`;
  const minTo=S.currentBet>0?legalMinRaiseTo():S.bb;
  sz+=`<input class="betin" id="betin" inputmode="numeric" placeholder="custom" onkeydown="if(event.key==='Enter')customBet(${minTo},${maxTo})">`;
  sz+=`<button class="chip" onclick="customBet(${minTo},${maxTo})">Go</button></span>`;
  bar.innerHTML=html+sz;
}

/* ---- stats view ---- */
let scope='life';
export function setScope(s){
  scope=s;
  document.getElementById('scope-life').classList.toggle('on',s==='life');
  document.getElementById('scope-sess').classList.toggle('on',s==='sess');
  renderStatsView();
}
export function statusDot(val,lo,hi){
  if(val===null) return '<span class="sdot na"></span>';
  return (val>=lo&&val<=hi)?'<span class="sdot ok"></span>':'<span class="sdot off"></span>';
}
export function renderStatsView(){
  const src=scope==='life'?DATA.life:SESSION;
  const d=derive(src);
  document.getElementById('statsub').innerHTML=`<b>${d.hands}</b> hands ${scope==='life'?'lifetime':'this session'}`;
  const f=(v,dec)=>v===null?'·':v.toFixed(dec===undefined?1:dec);
  const cards=[
    {lab:'VPIP %',v:f(d.vpip),b:'target 20 to 28',dot:statusDot(d.vpip,...BENCH.vpip),desc:'How often you voluntarily put chips in preflop.'},
    {lab:'PFR %',v:f(d.pfr),b:'target 16 to 24',dot:statusDot(d.pfr,...BENCH.pfr),desc:'How often you raise preflop.'},
    {lab:'VPIP/PFR gap',v:f(d.gap),b:'target 3 to 7',dot:statusDot(d.gap,...BENCH.gap),desc:'Big gap = calling too much.'},
    {lab:'3-bet %',v:f(d.tb),b:'target 5 to 10',dot:statusDot(d.tb,...BENCH.tb),desc:'How often you re-raise a preflop raise.'},
    {lab:'Fold to 3-bet %',v:f(d.f3b,0),b:'target 45 to 65',dot:statusDot(d.f3b,...BENCH.f3b),desc:'When your raise gets re-raised, how often you give up.'},
    {lab:'Aggression factor',v:d.af===null?'·':d.af.toFixed(1),b:'target 1.8 to 4',dot:statusDot(d.af,...BENCH.af),desc:'Postflop bets and raises divided by calls.'},
    {lab:'Fold to c-bet %',v:f(d.foldCbet,0),b:'target 35 to 60',dot:statusDot(d.foldCbet,...BENCH.foldCbet),desc:'How often you fold the flop when the preflop raiser bets.'},
    {lab:'WTSD %',v:f(d.wtsd,0),b:'target 22 to 30',dot:statusDot(d.wtsd,...BENCH.wtsd),desc:'Of flops seen, how often you reach showdown.'},
    {lab:'Won at showdown %',v:f(d.wsd,0),b:'target 48 to 56',dot:statusDot(d.wsd,...BENCH.wsd),desc:'Low = calling down too light.'},
    {lab:'bb / 100 hands',v:d.bb100===null?'·':(d.bb100>=0?'+':'')+d.bb100.toFixed(1),b:'the bottom line',dot:'<span class="sdot '+(d.bb100===null?'na':d.bb100>=0?'ok':'off')+'"></span>',desc:'Net win rate in big blinds per 100 hands.'}
  ];
  document.getElementById('statgrid').innerHTML=cards.map(c=>`<div class="statcard"><div class="lab">${c.lab}${c.dot}</div><div class="val">${c.v}</div><div class="bench">${c.b}</div><div class="desc">${c.desc}</div></div>`).join('');
  const lp=document.getElementById('leakpanel');
  const n=DATA.life.hands;
  if(n<50){
    lp.innerHTML=`<h3>Pattern coaching <span class="cnt">locked</span></h3>
      <div class="lockmsg">Unlocks at 50 lifetime hands. ${n}/50 so far.</div>
      <div class="lockbar"><i style="width:${n*2}%"></i></div>`;
  } else {
    const leaks=patternLeaks();
    lp.innerHTML=`<h3>Pattern coaching <span class="cnt">${DATA.life.hands} hand sample</span></h3>`+
      leaks.map(l=>`<div class="leak"><span class="sev ${l.sev}">${l.sev==='good'?'solid':l.sev}</span><span style="color:var(--dim);font-size:10px;letter-spacing:.08em">${l.label}</span><div style="margin-top:4px">${l.t}</div></div>`).join('');
  }
}
export function toggleEquity(){
  DATA.settings.showEquity=!DATA.settings.showEquity;
  saveData(); renderMode();
  if(!DATA.settings.showEquity) document.getElementById('eqbadge').style.display='none';
  else if(S.acting===0&&userResolve) updateEquity(S.players[0]);
}
export function clearHistory(){
  showModal('Clear hand history','<p>This deletes all saved hand records but keeps your lifetime stats.</p>',
    [{label:'Clear it',cb:()=>{ DATA.hands=[]; saveData(); closeModal(); renderHistory(); },danger:true},
     {label:'Cancel',cb:closeModal}]);
}
export function resetAll(){
  showModal('Reset all data','<p>This wipes lifetime stats and all hand history. No undo.</p>',
    [{label:'Wipe it',cb:()=>{
        DATA.v=2; DATA.life=blankStats(); DATA.hands=[];
        SESSION=blankStats();
        try{ localStorage.setItem(DATA.DKEY||'pokerlab:data',JSON.stringify(DATA)); }catch(e){}
        closeModal(); renderAll(); renderStatsView(); renderHistory();
      },danger:true},
     {label:'Cancel',cb:closeModal}]);
}

/* ---- modals: positions & villains ---- */
export function positionGuide(){
  const me=S.players[0], cur=me.out?'':positionOf(me);
  const liveOrd=seatOrderFromBtn(), allPos=liveOrd.map(p=>positionOf(p));
  const sorted=cur&&allPos.includes(cur)?[cur,...allPos.filter(x=>x!==cur)]:allPos;
  const body=sorted.map(k=>{
    const p=POSINFO[k]; if(!p) return '';
    return `<div class="posblock${k===cur?' cur':''}"><h4>${k}${k===cur?' · you are here':''}</h4><p>${p.s}</p><p>${p.w}</p><p><b>Range:</b> ${p.range}</p></div>`;
  }).join('');
  showModal('Positions',body,[{label:'Close',cb:closeModal}]);
}
export function villainCard(type){
  const v=VILLAIN_INFO[type]; if(!v) return;
  const body=`<div class="vline"><b>${v.sub}</b></div><p>${v.desc}</p><p><b>How to exploit:</b></p><ul>${v.exploit.map(e=>`<li>${e}</li>`).join('')}</ul><p>${v.watch}</p>`;
  showModal(v.title,body,[{label:'Close',cb:closeModal}]);
}

/* ---- history view ---- */
let expanded=null;
export function renderHistory(){
  const pos=document.getElementById('f-pos').value;
  const flag=document.getElementById('f-flag').value;
  const mode=document.getElementById('f-mode').value;
  let rows=[...DATA.hands].reverse();
  if(pos) rows=rows.filter(h=>h.pos===pos);
  if(mode) rows=rows.filter(h=>h.mode===mode);
  if(flag==='won') rows=rows.filter(h=>(h.netC??h.net)>0);
  else if(flag==='lost') rows=rows.filter(h=>(h.netC??h.net)<0);
  else if(flag==='noted') rows=rows.filter(h=>h.notes&&h.notes.length);
  else if(flag) rows=rows.filter(h=>h.flags&&h.flags[flag]);
  const el=document.getElementById('histlist');
  if(!rows.length){ el.innerHTML='<div class="empty">No hands match. Go play some.</div>'; return; }
  el.innerHTML=rows.slice(0,80).map(h=>{
    const dt=new Date(h.t);
    const when=`${dt.getMonth()+1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2,'0')}`;
    const netV=h.netC!==undefined?h.netC:h.net;
    const netCls=netV>0?'pos':netV<0?'neg':'';
    const holeH=(h.hole||'').split(' ').filter(Boolean).map(cs=>{
      const red=cs.endsWith('h')||cs.endsWith('d');
      return `<span class="card sm${red?' red':''}">${cs[0]}${SUITCH[cs.slice(-1)]||''}</span>`;
    }).join('');
    const chips=[];
    if(h.flags){ if(h.flags.threeBet)chips.push('3-bet'); if(h.flags.foldCbet)chips.push('fold v cbet'); if(h.flags.wtsd)chips.push('showdown'); }
    if(h.notes&&h.notes.length)chips.push('note');
    const isOpen=expanded===h.id;
    let detail='';
    if(isOpen){ detail=`<div class="hdetail" onclick="event.stopPropagation()"><div class="lines">${(h.log||[]).map(l=>`<div>${l}</div>`).join('')}</div>${h.notes&&h.notes.length?`<div class="notes">${h.notes.map(n=>`<div>${n}</div>`).join('')}</div>`:''}</div>`; }
    return `<div class="hrowi"><div class="hsum" onclick="toggleHand('${h.id}')"><span class="when">${when} · ${h.mode==='tourney'?'TRN':'CASH'}</span><span class="hpos">${h.pos}</span><span class="cards">${holeH}</span>${chips.slice(0,2).map(c=>`<span class="flagchip">${c}</span>`).join('')}<span class="net ${netCls}">${netV>0?'+':''}${fmtC(netV)}</span></div>${detail}</div>`;
  }).join('');
}
export function toggleHand(id){ expanded=expanded===id?null:id; renderHistory(); }

/* ---- views / modes ---- */
export function showView(v){
  ['table','stats','history'].forEach(x=>{
    document.getElementById('view-'+x).style.display=x===v?'':'none';
    document.getElementById('tab-'+x).classList.toggle('on',x===v);
  });
  if(v==='stats') renderStatsView();
  if(v==='history') renderHistory();
}
export function setMode(m){
  if(S.mode===m) return;
  if(S.handActive){
    showModal('Switch mode','<p>A hand is in progress. Switching now abandons it.</p>',
      [{label:'Switch anyway',cb:()=>{ if(userResolve){const r=userResolve;userResolve=null;r({act:'fold'});} openSetup(); closeModal(); }},
       {label:'Cancel',cb:closeModal}]);
    return;
  }
  openSetup();
}
export function setModeForce(m,cfg){
  dealing=false; userResolve=null;
  S=freshState(m,cfg);
  document.getElementById('mode-cash').classList.toggle('on',m==='cash');
  document.getElementById('mode-tourney').classList.toggle('on',m==='tourney');
  hideCoach();
  renderAll();
  document.getElementById('actbar').innerHTML=`<button class="abtn primary" onclick="startHand()">Deal first hand</button>`;
  document.getElementById('log').innerHTML=`<div>${m==='tourney'
    ?`Tournament: ${S.numPlayers} players, ${fmtC(S.startStack)} chips, blinds ${S.sb}/${S.bb}, up every ${S.handsPerLevel} hands.`
    :`Cash game: ${fmtC(S.sb)}/${fmtC(S.bb)} blinds, ${fmtC(S.startStack)} stacks, ${S.numPlayers} players.`
  }</div><div>Tap any opponent for their profile. Tap your position badge for the position guide.</div>`;
}
export function rebuy(){
  const me=S.players[0];
  me.stack+=S.startStack;
  log('You rebuy. Stack '+fmtC(me.stack));
  renderAll();
}
export function endGameButtons(){
  setTimeout(()=>{
    document.getElementById('actbar').innerHTML=
      `<button class="abtn primary" onclick="openSetup()">New game</button>
       <button class="abtn" onclick="replaySetup()">Same setup again</button>`;
  },60);
}
export function replaySetup(){ const c=S.cfg0; setModeForce(S.mode,c); startHand(); }

/* ---- session ---- */
export function endSession(){
  const d=derive(SESSION);
  if(d.hands===0){ showModal('Session','<p>No hands played this session yet.</p>',[{label:'Close',cb:closeModal}]); return; }
  const l=derive(DATA.life), f=v=>v===null?'·':v.toFixed(1);
  const leak=topSessionLeak(d);
  showModal('Session summary',
    `<p><b>${d.hands}</b> hands · net <b>${SESSION.netBB>=0?'+':''}${SESSION.netBB.toFixed(1)} big blinds</b> (${d.bb100>=0?'+':''}${f(d.bb100)} bb/100)</p>
     <p>VPIP <b>${f(d.vpip)}</b> (life ${f(l.vpip)}) · PFR <b>${f(d.pfr)}</b> (life ${f(l.pfr)}) · AF <b>${d.af===null?'·':d.af.toFixed(1)}</b></p>
     <p>${leak}</p>`,
    [{label:'Start new session',cb:()=>{ SESSION=blankStats(); closeModal(); renderStatsView(); }},
     {label:'Keep playing',cb:closeModal}]);
}

/* ---- setup screen ---- */
export const SCHED_PRESETS={
  bar:[[100,200],[150,300],[200,400],[300,600],[500,1000],[750,1500],[1000,2000]],
  casino:[[25,50],[50,100],[75,150],[100,200],[150,300],[200,400],[300,600],[500,1000]],
  turbo:[[100,200],[200,400],[400,800],[800,1600],[1500,3000],[3000,6000]],
};
let selectedSched='bar', oppMode='custom', hintMode='question';

export function setOppMode(m){
  oppMode=m;
  ['custom','random','mixed'].forEach(k=>{ const el=document.getElementById('opp-'+k); if(el) el.classList.toggle('on',k===m); });
  const slots=document.getElementById('cfg-ai-slots'), note=document.getElementById('opp-random-note');
  if(m==='custom'){ slots.style.display=''; note.style.display=''; buildAiSlots(); }
  else if(m==='random'){ slots.style.display='none'; note.style.display=''; }
  else { slots.style.display='none'; note.style.display=''; note.textContent='One of each type will be seated (station, TAG, LAG, nit, maniac) plus extras if needed.'; }
}
export function setHintMode(m){
  hintMode=m;
  ['off','question'].forEach(k=>{ const el=document.getElementById('hint-'+k); if(el) el.classList.toggle('on',k===m); });
}
export function pickSched(key){
  selectedSched=key;
  ['bar','casino','turbo','custom'].forEach(k=>{ const el=document.getElementById('sched-'+k); if(el) el.classList.toggle('on',k===key); });
  if(key!=='custom'&&SCHED_PRESETS[key]){
    const first=SCHED_PRESETS[key][0];
    document.getElementById('cfg-sb').value=first[0];
    document.getElementById('cfg-bb').value=first[1];
  }
}
export function updateSetupUI(){
  const mode=document.getElementById('cfg-mode').value, isTourney=mode==='tourney';
  document.getElementById('cfg-tourney-section').style.display=isTourney?'':'none';
  if(!isTourney){ document.getElementById('cfg-sb').value=1; document.getElementById('cfg-bb').value=3; document.getElementById('cfg-stack').value=300; }
  else { document.getElementById('cfg-stack').value=3500; pickSched('bar'); }
  buildAiSlots();
}
export function buildAiSlots(){
  const nEl=document.getElementById('cfg-players'); if(!nEl) return;
  const n=parseInt(nEl.value)-1;
  const types=['station','tag','lag','nit','maniac'];
  const defaults=AI_ROSTER.map(a=>a.type), names=AI_ROSTER.map(a=>a.name);
  const extraNames=['Alex','Blake','Casey','Dana','Evan','Fran','Glen','Hank'];
  let html='';
  for(let i=0;i<n;i++){
    const nm=names[i]||extraNames[i-names.length]||`P${i+2}`;
    const def=defaults[i]||types[i%types.length];
    html+=`<div class="ai-slot"><label>Seat ${i+2} · ${nm}</label><select id="ai-type-${i}">${types.map(t=>`<option value="${t}" ${t===def?'selected':''}>${t.toUpperCase()}</option>`).join('')}</select></div>`;
  }
  document.getElementById('cfg-ai-slots').innerHTML=html;
}
export function openSetup(){ buildAiSlots(); updateSetupUI(); document.getElementById('setupOverlay').style.display='flex'; }
export function startFromSetup(){
  const mode=document.getElementById('cfg-mode').value;
  const numPlayers=parseInt(document.getElementById('cfg-players').value);
  const startStack=Math.max(10,parseInt(document.getElementById('cfg-stack').value)||300);
  const sbRaw=Math.max(1,parseInt(document.getElementById('cfg-sb').value)||1);
  const bbRaw=Math.max(sbRaw+1,parseInt(document.getElementById('cfg-bb').value)||(sbRaw*2));
  const handsPerLevel=parseInt(document.getElementById('cfg-handsPerLevel').value)||8;
  let schedule;
  if(selectedSched==='custom'){ schedule=buildCustomSchedule(sbRaw,bbRaw); }
  else { schedule=SCHED_PRESETS[selectedSched]||SCHED_PRESETS.bar; }
  const allTypes=['station','tag','lag','nit','maniac'], aiRoster=[];
  for(let i=0;i<numPlayers-1;i++){
    const name=(AI_ROSTER[i]||{name:`P${i+2}`}).name;
    let type;
    if(oppMode==='custom'){ const typeEl=document.getElementById('ai-type-'+i); type=typeEl?typeEl.value:AI_ROSTER[i%AI_ROSTER.length].type; }
    else if(oppMode==='mixed'){ type=allTypes[i%allTypes.length]; }
    else { type=allTypes[Math.floor(rand()*allTypes.length)]; }
    aiRoster.push({name,type});
  }
  DATA.settings.hintMode=hintMode;
  saveData();
  document.getElementById('setupOverlay').style.display='none';
  setModeForce(mode,{numPlayers,startStack,sb:sbRaw,bb:bbRaw,schedule,handsPerLevel,aiRoster});
  startHand();
}
export function buildCustomSchedule(sb,bb){
  const sched=[[sb,bb]]; let s=sb, b=bb;
  for(let i=0;i<10;i++){ s=Math.round(s*1.5); b=Math.round(b*1.5); sched.push([s,b]); }
  return sched;
}

/* ---- modal ---- */
export function showModal(title,body,buttons){
  const box=document.getElementById('modalbox');
  box.innerHTML=`<h2>${title}</h2>${body}<div class="mrow">${buttons.map((b,i)=>`<button class="abtn ${b.danger?'fold':i===0?'primary':''}" id="mbtn-${i}">${b.label}</button>`).join('')}</div>`;
  buttons.forEach((b,i)=>{ document.getElementById('mbtn-'+i).onclick=b.cb; });
  document.getElementById('overlay').style.display='';
}
export function closeModal(){ document.getElementById('overlay').style.display='none'; }

/* =====================================================
   BOOT
   ===================================================== */
async function boot(){
  S=freshState('cash');
  loadData();
  renderAll();
  renderStatsView();
  openSetup();
}

/* ---- expose to HTML inline onclick handlers ---- */
window.startHand    = startHand;
window.uact         = uact;
window.customBet    = customBet;
window.hideHint     = hideHint;
window.villainCard  = villainCard;
window.positionGuide= positionGuide;
window.toggleHand   = toggleHand;
window.showView     = showView;
window.setMode      = setMode;
window.openSetup    = openSetup;
window.startFromSetup=startFromSetup;
window.setOppMode   = setOppMode;
window.setHintMode  = setHintMode;
window.pickSched    = pickSched;
window.updateSetupUI= updateSetupUI;
window.closeModal   = closeModal;
window.rebuy        = rebuy;
window.endSession   = endSession;
window.setScope     = setScope;
window.toggleEquity = toggleEquity;
window.clearHistory = clearHistory;
window.resetAll     = resetAll;
window.renderHistory= renderHistory;
window.exportData   = exportData;
window.importData   = importDataWrapper;

boot();
