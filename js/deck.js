export const SUITCH = {s:'♠', h:'♥', d:'♦', c:'♣'};
export const RANKCH = {2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'T',11:'J',12:'Q',13:'K',14:'A'};
export const CAT_NAMES = ['High card','Pair','Two pair','Trips','Straight','Flush','Full house','Quads','Straight flush'];
export const rand = Math.random;
export const pick = a => a[Math.floor(rand()*a.length)];
export function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ---------- crypto-random shuffle ---------- */
export function newDeck(){
  const d = [];
  for(const s of ['s','h','d','c']) for(let r=2;r<=14;r++) d.push({r,s});
  const buf = new Uint32Array(d.length);
  crypto.getRandomValues(buf);
  for(let i=d.length-1;i>0;i--){
    const j = buf[i] % (i+1);
    [d[i],d[j]] = [d[j],d[i]];
  }
  return d;
}
export const cstr = c => RANKCH[c.r]+SUITCH[c.s];
export const cid  = c => RANKCH[c.r]+c.s;
export function prettyIds(str){ // 'Ah Qs' -> 'A♥ Q♠'
  return (str||'').split(' ').filter(Boolean).map(t=>t[0]+(SUITCH[t.slice(-1)]||'')).join(' ');
}
export function fmtC(n){ return Math.round(n).toLocaleString('en-US'); }
