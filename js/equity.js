import { rand } from './deck.js';

/* ---------- hand evaluation ---------- */
export function score5(cs){
  const rs = cs.map(c=>c.r).sort((a,b)=>b-a);
  const flush = cs.every(c=>c.s===cs[0].s);
  const cnt = {};
  rs.forEach(r=>cnt[r]=(cnt[r]||0)+1);
  const groups = Object.keys(cnt).map(r=>({r:+r,n:cnt[r]})).sort((a,b)=>b.n-a.n||b.r-a.r);
  const uniq = [...new Set(rs)];
  let sHigh = 0;
  if(uniq.length===5){
    if(uniq[0]-uniq[4]===4) sHigh = uniq[0];
    else if(uniq[0]===14 && uniq[1]===5 && uniq[4]===2 && uniq[1]-uniq[4]===3) sHigh = 5;
  }
  let cat, tb;
  if(flush && sHigh){ cat=8; tb=[sHigh]; }
  else if(groups[0].n===4){ cat=7; tb=[groups[0].r, groups[1].r]; }
  else if(groups[0].n===3 && groups[1].n===2){ cat=6; tb=[groups[0].r, groups[1].r]; }
  else if(flush){ cat=5; tb=rs; }
  else if(sHigh){ cat=4; tb=[sHigh]; }
  else if(groups[0].n===3){ cat=3; tb=[groups[0].r, groups[1].r, groups[2].r]; }
  else if(groups[0].n===2 && groups[1].n===2){ cat=2; tb=[groups[0].r, groups[1].r, groups[2].r]; }
  else if(groups[0].n===2){ cat=1; tb=[groups[0].r, groups[1].r, groups[2].r, groups[3].r]; }
  else { cat=0; tb=rs; }
  let score = cat;
  for(let i=0;i<5;i++) score = score*15 + (tb[i]||0);
  return {score, cat};
}
export function evalBest(cards){
  if(cards.length===5) return score5(cards);
  let best = {score:-1, cat:0};
  const n = cards.length;
  const combo = (arr) => {
    const s = score5(arr.map(i=>cards[i]));
    if(s.score>best.score) best = s;
  };
  if(n===6){
    for(let skip=0;skip<6;skip++) combo([0,1,2,3,4,5].filter(i=>i!==skip));
  } else {
    for(let a=0;a<n;a++) for(let b=a+1;b<n;b++)
      combo([0,1,2,3,4,5,6].filter(i=>i!==a&&i!==b));
  }
  return best;
}

/* ---------- preflop tiers (Chen) ---------- */
export function chen(c1,c2){
  const hv = r => r===14?10 : r===13?8 : r===12?7 : r===11?6 : r/2;
  const hi = Math.max(c1.r,c2.r), lo = Math.min(c1.r,c2.r);
  let s = hv(hi);
  if(c1.r===c2.r) return Math.max(s*2,5);
  if(c1.s===c2.s) s += 2;
  const gap = hi-lo-1;
  if(gap===1) s-=1; else if(gap===2) s-=2; else if(gap===3) s-=4; else if(gap>=4) s-=5;
  if(gap<=1 && hi<12) s+=1;
  return Math.ceil(s);
}
export function tierOf(hole){
  const s = chen(hole[0],hole[1]);
  if(s>=10) return 1;
  if(s>=9) return 2;
  if(s>=8) return 3;
  if(s>=7) return 4;
  if(s>=6) return 5;
  if(s>=5) return 6;
  if(s>=4) return 7;
  return 8;
}

/* ---------- postflop hand bucket + draws ---------- */
export function bucketOf(hole, board){
  if(!board.length) return null;
  const all = hole.concat(board);
  const ev = evalBest(all);
  const br = board.map(c=>c.r);
  const bmax = Math.max(...br);
  const bsorted = [...br].sort((a,b)=>b-a);
  const b2 = bsorted[1]||0;
  const h = [hole[0].r, hole[1].r];
  const pocket = h[0]===h[1];
  let bucket = 'air';

  if(ev.cat>=4){
    bucket = 'monster';
    if(board.length===5){
      const bev = score5(board);
      if(bev.score>=ev.score) bucket = 'medium';
    }
  } else if(ev.cat===3){
    if(pocket && br.includes(h[0])) bucket='monster';
    else if(h.some(r=>br.filter(x=>x===r).length===2)) bucket='monster';
    else bucket='medium';
  } else if(ev.cat===2){
    const pairsWithBoard = [...new Set(h.filter(r=>br.includes(r)))];
    if(!pocket && pairsWithBoard.length===2) bucket='monster';
    else if(pocket && h[0]>bmax) bucket='strong';
    else if(pairsWithBoard[0]===bmax) bucket='strong';
    else if(pairsWithBoard.length) bucket='medium';
    else bucket='weak';
  } else if(ev.cat===1){
    if(pocket){
      bucket = h[0]>bmax ? 'strong' : (h[0]>b2 ? 'medium' : 'weak');
    } else if(br.includes(h[0]) || br.includes(h[1])){
      const pr = br.includes(h[0]) ? h[0] : h[1];
      const kick = pr===h[0] ? h[1] : h[0];
      if(pr===bmax) bucket = kick>=11 ? 'strong' : 'medium';
      else if(pr>=b2) bucket = 'medium';
      else bucket = 'weak';
    } else bucket='air';
  } else bucket='air';

  let fd=false, oesd=false, gut=false;
  if(board.length<5){
    for(const s of ['s','h','d','c']){
      const tot = all.filter(c=>c.s===s).length;
      if(tot===4 && hole.some(c=>c.s===s)) fd=true;
    }
    const ranks = new Set(all.map(c=>c.r));
    if(ranks.has(14)) ranks.add(1);
    let windows = 0;
    for(let lo=1;lo<=10;lo++){
      const win = [lo,lo+1,lo+2,lo+3,lo+4];
      const have = win.filter(r=>ranks.has(r));
      const holeIn = win.some(r=>h.includes(r) || (r===1&&h.includes(14)));
      if(have.length===4 && holeIn && ev.cat<4) windows++;
    }
    if(windows>=2) oesd=true; else if(windows===1) gut=true;
  }
  const over = !pocket && h[0]>bmax && h[1]>bmax;
  let outs = 0;
  if(fd) outs+=9;
  if(oesd) outs+= fd?6:8;
  else if(gut) outs+= fd?3:4;
  if(over && bucket==='air') outs+=6;
  const draws = [];
  if(fd) draws.push('flush draw');
  if(oesd) draws.push('open-ended straight draw');
  else if(gut) draws.push('gutshot');
  if(over && bucket==='air') draws.push('two overcards');
  return {bucket, outs, draws, cat:ev.cat};
}
export const BUCKET_PHRASE = {
  monster:'a monster', strong:'top pair or better', medium:'a middling pair',
  weak:'a weak pair', air:'no pair and no made hand'
};

/* ---------- Monte Carlo equity vs random hands ---------- */
export function heroEquity(hole, board, nOpp){
  if(nOpp<=0) return 100;
  const trials = board.length===0?500 : board.length===3?800 : board.length===4?1000 : 1200;
  const used = new Set(hole.concat(board).map(c=>c.r+'_'+c.s));
  const base = [];
  for(const s of ['s','h','d','c']) for(let r=2;r<=14;r++){
    if(!used.has(r+'_'+s)) base.push({r,s});
  }
  const need = 5-board.length;
  let score = 0;
  for(let t=0;t<trials;t++){
    const deck = base.slice();
    const take = nOpp*2 + need;
    for(let i=0;i<take;i++){
      const j = i + Math.floor(rand()*(deck.length-i));
      [deck[i],deck[j]]=[deck[j],deck[i]];
    }
    const fullBoard = board.concat(deck.slice(nOpp*2, nOpp*2+need));
    const myS = evalBest(hole.concat(fullBoard)).score;
    let best=-1, ties=1;
    for(let o=0;o<nOpp;o++){
      const os = evalBest([deck[o*2],deck[o*2+1]].concat(fullBoard)).score;
      if(os>best){ best=os; }
    }
    if(myS>best) score += 1;
    else if(myS===best) score += 0.5;
  }
  return score/trials*100;
}
