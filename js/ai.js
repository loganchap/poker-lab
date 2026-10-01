import { rand, pick, fmtC } from './deck.js';
import { tierOf, bucketOf } from './equity.js';

/* ---------- AI archetypes (research-tuned) ---------- */
export const PROF = {
  station: { label:'STATION',
    pre:{open:2, limp:7, call:7, tb:1, bluff3:0, callTb:5},
    post:{
      bet:{monster:.55,strong:.3,medium:.12,weak:.08,air:.04,draw:.18},
      raise:{monster:.4,strong:.1,medium:0,weak:0,air:0,draw:.06},
      call:{
        cheap:{monster:1,strong:1,medium:.97,weak:.92,air:.45,draw:.97},
        mid:{monster:1,strong:.97,medium:.9,weak:.78,air:.28,draw:.92},
        big:{monster:1,strong:.95,medium:.8,weak:.6,air:.12,draw:.72}
      },
      cbet:.2, size:[0.4,0.55], allinTighten:.8
    }},
  tag: { label:'TAG',
    pre:{open:4, limp:0, call:4, tb:1, bluff3:.07, callTb:2},
    post:{
      bet:{monster:.88,strong:.78,medium:.35,weak:.12,air:.12,draw:.5},
      raise:{monster:.55,strong:.22,medium:.04,weak:0,air:.03,draw:.14},
      call:{
        cheap:{monster:1,strong:.95,medium:.8,weak:.45,air:.1,draw:.9},
        mid:{monster:1,strong:.9,medium:.5,weak:.18,air:.04,draw:.65},
        big:{monster:1,strong:.82,medium:.3,weak:.08,air:.02,draw:.4}
      },
      cbet:.7, size:[0.55,0.7], allinTighten:.7
    }},
  lag: { label:'LAG',
    pre:{open:6, limp:0, call:6, tb:2, bluff3:.14, callTb:3},
    post:{
      bet:{monster:.9,strong:.85,medium:.6,weak:.4,air:.42,draw:.68},
      raise:{monster:.6,strong:.3,medium:.1,weak:.06,air:.08,draw:.2},
      call:{
        cheap:{monster:1,strong:.97,medium:.88,weak:.6,air:.3,draw:.95},
        mid:{monster:1,strong:.93,medium:.65,weak:.4,air:.15,draw:.8},
        big:{monster:1,strong:.85,medium:.45,weak:.2,air:.06,draw:.55}
      },
      cbet:.8, size:[0.66,0.9], allinTighten:.75
    }},
  nit: { label:'NIT',
    pre:{open:2, limp:0, call:2, tb:1, bluff3:0, callTb:1},
    post:{
      bet:{monster:.85,strong:.6,medium:.12,weak:.04,air:.04,draw:.3},
      raise:{monster:.6,strong:.18,medium:0,weak:0,air:0,draw:.05},
      call:{
        cheap:{monster:1,strong:.92,medium:.6,weak:.2,air:.04,draw:.75},
        mid:{monster:1,strong:.85,medium:.3,weak:.06,air:.01,draw:.45},
        big:{monster:1,strong:.7,medium:.12,weak:.02,air:0,draw:.25}
      },
      cbet:.35, size:[0.5,0.65], allinTighten:.55
    }},
  maniac: { label:'MANIAC',
    pre:{open:7, limp:0, call:7, tb:3, bluff3:.3, callTb:4},
    post:{
      bet:{monster:.95,strong:.9,medium:.72,weak:.55,air:.5,draw:.78},
      raise:{monster:.65,strong:.4,medium:.18,weak:.1,air:.13,draw:.25},
      call:{
        cheap:{monster:1,strong:1,medium:.92,weak:.7,air:.45,draw:.95},
        mid:{monster:1,strong:.96,medium:.78,weak:.5,air:.3,draw:.85},
        big:{monster:1,strong:.9,medium:.6,weak:.32,air:.15,draw:.65}
      },
      cbet:.85, size:[0.8,1.2], allinTighten:.85
    }}
};
export const POS_ADJ = {UTG:-2, 'UTG+1':-1, 'UTG+2':-1, LJ:0, HJ:0, CO:1, BTN:2, SB:0, BB:0};
export const AI_ROSTER = [
  {name:'Sam',   type:'station'},
  {name:'Tina',  type:'tag'},
  {name:'Loco',  type:'lag'},
  {name:'Norm',  type:'nit'},
  {name:'Max',   type:'maniac'},
  {name:'Rita',  type:'station'},
  {name:'Cole',  type:'tag'},
  {name:'Dex',   type:'lag'},
];
export const VILLAIN_INFO = {
  station:{title:'Sam · The Calling Station', sub:'loose-passive',
    desc:'Plays half his hands or more and hates folding. Calls with any pair, any draw, sometimes just two big cards. Almost never raises without a real hand.',
    exploit:['Value bet relentlessly on all three streets. Second pair is a value hand against Sam.','Size up: he calls big bets nearly as often as small ones, so charge maximum.','Never bluff him. Stations call. Your bluff has to get through someone who does not fold.','When Sam raises, believe him. Passive players raising means a monster.'],
    watch:'Most profitable player at the table if you stay disciplined.'},
  nit:{title:'Norm · The Nit', sub:'tight-passive rock',
    desc:'Plays only premium hands and folds to pressure everywhere else. A turn or river bet from Norm means a very strong hand.',
    exploit:['Attack his blinds and limps constantly. He folds too often to fight back.','Steal small pots with c-bets. He gives up without a piece.','When he raises, fold everything but the nuts. Only stack off with sets or better.','3-bet his rare opens only with premiums. His opening range is already monsters.'],
    watch:'You will not win big pots from Norm. You win by taking fifty small ones.'},
  tag:{title:'Tina · The TAG', sub:'tight-aggressive',
    desc:'The solid regular. Tight preflop range, aggressive with it, c-bets often, and capable of folding when beat. The most common winning style.',
    exploit:['Respect her early-position raises. That range is real.','3-bet her late-position opens. She opens wider there and folds correctly.','Float her c-bets in position and take the pot when she gives up on the turn.','Do not call down light. Her big bets on later streets are weighted to value.'],
    watch:'The hardest seat to profit from. Mostly stay out of her way without a hand or a plan.'},
  lag:{title:'Loco · The LAG', sub:'loose-aggressive',
    desc:'Opens wide, barrels often, and applies pressure on every street. Some of it is real, a lot of it is not.',
    exploit:['Call down lighter. Your bluff catchers go up in value against constant aggression.','Let him bluff into your strong hands. Trap instead of re-raising and check-call him down.','Tighten your own value range and snap him off with it.','Play pots in position against him. Out of position vs a LAG is misery.'],
    watch:'Variance is high against Loco. Expect swings and keep making the right calls.'},
  maniac:{title:'Max · The Maniac', sub:'hyper-aggressive',
    desc:'Raises and re-raises with almost anything, builds giant pots out of nothing, and never slows down. Wins big early, spews it back later.',
    exploit:['Tighten way up and wait. One pair or better is usually enough to play for stacks.','Play strong hands fast and big. He does not fold, so charge him everything.','Never try to bluff him off a hand. There is no hand he folds.','Do not get into raising wars with marginal hands. Patience is the whole strategy.'],
    watch:'He will suck out on you sometimes. That is the price of a massive long-term edge.'}
};

/* ---------- position guide ---------- */
export const POSINFO = {
  UTG:{hint:'UTG: first to act, most players behind you. Tightest spot at the table. Raise big pairs, big aces, and strong broadways; fold everything else.',
    s:'Strength: an early raise carries weight. Players give UTG opens respect, so your raises get through or get action from worse.',
    w:'Weakness: you act with zero information preflop and usually play the whole hand out of position.',
    range:'Open roughly the top 10 to 12 percent: 77+, AJ+, ATs, KQs. Raise or fold, never limp.'},
  'UTG+1':{hint:'UTG+1: second to act, still very early. One fewer player behind than UTG but still tight territory.',
    s:'Strength: slight positional improvement over UTG. Opens still get respect.',
    w:'Weakness: still acting early with most of the table behind you.',
    range:'Open around 12 to 14 percent: 66+, AJs+, AJo+, KQs, KQo. Slightly wider than UTG.'},
  'UTG+2':{hint:'UTG+2: third to act. Getting closer to middle position. Range opens up slightly.',
    s:'Strength: a few more players have already folded, reducing the field.',
    w:'Weakness: still early enough that good players behind you can squeeze.',
    range:'Open around 14 to 16 percent: 55+, ATs+, AJo+, KQs, KJs. Fold the weak suited connectors.'},
  LJ:{hint:'LJ (lojack): middle position at a 9-handed table. Four players still behind.',
    s:'Strength: starting to transition into stealing territory. Opens get some respect.',
    w:'Weakness: the HJ, CO, and BTN all have position on you postflop.',
    range:'Open around 16 to 18 percent: 44+, A9s+, ATo+, KQs, KJs, QJs. Fold weak offsuit hands.'},
  HJ:{hint:'HJ (hijack): three to four players behind. Opens start to widen.',
    s:'Strength: if the CO and BTN fold you have position on the blinds.',
    w:'Weakness: CO and BTN with position can still wake up behind you.',
    range:'Open around 18 to 20 percent: 33+, A8s+, ATo+, KQs, KJs, KJo, QJs. Raise or fold.'},
  CO:{hint:'CO (cutoff): one off the button, only three left to act. Start attacking here.',
    s:'Strength: you have position on everyone but the button postflop. Wide opens start printing.',
    w:'Weakness: the button can 3-bet you with position. Be ready for pushback.',
    range:'Open around 25 percent: any pair, A8+, any suited ace, KT+, QT+, JTs, T9s, 98s.'},
  BTN:{hint:'BTN: the best seat in poker. You act last on every postflop street and see everyone’s decision before yours.',
    s:'Strength: position on the entire table for the whole hand. Most of your lifetime profit comes from this seat.',
    w:'Weakness: only the blinds remain, so your raises get less respect. Expect more defends.',
    range:'Open 40 percent or more: any pair, any suited ace, any broadway, K9+, Q9+, J9+, suited connectors. Steal relentlessly.'},
  SB:{hint:'SB: worst seat postflop. You act first on every street, forever. Raise or fold when it folds to you; completing cheap is a trap.',
    s:'Strength: when folded to you, only one player can fight back. Half your bet is already in.',
    w:'Weakness: out of position against the whole table after the flop. Even strong hands play badly here.',
    range:'When folded to you, raise around 35 percent (pairs, aces, broadways, suited hands) and fold the rest. Avoid limping.'},
  BB:{hint:'BB: you already paid, so you close the action and get a discount. Defend wide vs small raises, check your option in limped pots.',
    s:'Strength: last to act preflop with money already in. You can profitably defend many hands a normal call could not.',
    w:'Weakness: you play every postflop street out of position. Defending wide means playing carefully after the flop.',
    range:'Defend vs a single raise with pairs, suited hands, connected cards, and any broadway. 3-bet your premiums. Check freely in limped pots.'}
};

/* ---------- AI decision functions ---------- */
export const AI_AGG = {station:0, nit:0, tag:1, lag:2, maniac:3};

export function aiPre(p, toCall, S, potTotal, seatOrderFromBtn, positionOf){
  const prof = PROF[p.type].pre;
  const tier = tierOf(p.hole);
  const pos = positionOf(p);
  const adj = POS_ADJ[pos]||0;
  const facingRaise = S.preRaises>0;
  const limpers = S.players.filter(x=>!x.folded&&!x.out&&x.streetPut===S.bb&&x.id!==p.id&&positionOf(x)!=='BB').length;
  const openTo = Math.round(S.bb*3 + limpers*S.bb);

  const live = seatOrderFromBtn().length;
  const shortAdj = Math.max(0, 6 - live);

  const bbDepth = (p.stack + p.streetPut) / S.bb;
  if(S.mode==='tourney' && bbDepth <= 10){
    const posRank = ({UTG:0,'UTG+1':0,'UTG+2':1,LJ:1,HJ:2,CO:3,BTN:4,SB:5,BB:2})[pos] ?? 2;
    const thresh = 2 + Math.round(posRank*0.8) + AI_AGG[p.type] + (bbDepth<=5?2:0) + Math.ceil(shortAdj/2);
    const shove = {act:'raise', to: p.streetPut + p.stack};
    if(!facingRaise){
      if(toCall<=0){
        if(tier <= Math.min(thresh, 4)) return shove;
        return {act:'check'};
      }
      if(tier <= thresh) return shove;
      return {act:'fold'};
    }
    if(tier <= Math.max(1, thresh-2)) return shove;
    const potNow = potTotal();
    if(toCall >= p.stack){
      if(tier <= 5 || toCall/(potNow+toCall) < 0.3) return {act:'call'};
      return {act:'fold'};
    }
    if(toCall/(potNow+toCall) < 0.22 && tier <= 7) return {act:'call'};
    return {act:'fold'};
  }

  if(!facingRaise){
    if(toCall<=0){
      if(tier<=prof.open+Math.ceil(shortAdj/2) && rand()<.7) return {act:'raise', to:Math.round(S.bb*3.5)};
      return {act:'check'};
    }
    if(tier <= prof.open + adj + shortAdj) return {act:'raise', to:openTo};
    if(p.type==='station' && tier<=prof.limp+shortAdj && rand()<.8) return {act:'call'};
    if(pos==='SB' && tier<=6+shortAdj && rand()<.3) return {act:'call'};
    return {act:'fold'};
  }
  if(S.preRaises===1){
    const tbTo = Math.round(S.currentBet*3);
    if(tier<=prof.tb+Math.floor(shortAdj/2) && rand()<.8) return {act:'raise', to:tbTo};
    if(prof.bluff3>0 && tier<=6 && rand()<prof.bluff3+shortAdj*0.03) return {act:'raise', to:tbTo};
    const defBonus = pos==='BB' ? 2 : (pos==='SB' ? 1 : 0);
    if(tier <= prof.call + Math.max(adj,0) + defBonus + Math.ceil(shortAdj/2)) return {act:'call'};
    return {act:'fold'};
  }
  if(tier===1 && rand()<.55) return {act:'raise', to:Math.round(S.currentBet*2.4)};
  if(tier<=prof.callTb+Math.floor(shortAdj/2)) return {act:'call'};
  return {act:'fold'};
}

export function aiPost(p, toCall, S, potTotal){
  const prof = PROF[p.type].post;
  const b = bucketOf(p.hole, S.board);
  const cls = ((b.bucket==='air'||b.bucket==='weak') && b.outs>=7) ? 'draw' : b.bucket;
  const pot = potTotal();

  if(toCall<=0){
    let f = prof.bet[cls] ?? .05;
    if(S.street==='flop' && S.preAggressor===p.id) f = Math.max(f, prof.cbet);
    if(S.street==='river' && cls==='draw') f = .25;
    if(rand()<f){
      const frac = prof.size[0] + rand()*(prof.size[1]-prof.size[0]);
      const to = Math.max(S.bb, Math.round(pot*frac));
      return {act:'raise', to:Math.min(to, p.streetPut+p.stack)};
    }
    return {act:'check'};
  }
  const price = toCall/(pot+toCall);
  const rch = prof.raise[cls]||0;
  if(rand()<rch && p.stack > toCall*2.5){
    return {act:'raise', to:Math.round(S.currentBet*2.7)};
  }
  const band = price<0.22?'cheap': price<0.36?'mid':'big';
  let c = prof.call[band][cls] ?? 0;
  if(cls==='draw' && S.street!=='river'){
    const eq = b.outs*0.021;
    if(price < eq + 0.06) c = Math.max(c,.88);
    else if(price > eq + 0.15) c *= .4;
  }
  if(toCall>=p.stack) c *= prof.allinTighten;
  if(rand()<c) return {act:'call'};
  return {act:'fold'};
}
