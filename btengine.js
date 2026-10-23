// Backtest engine: MT5 CSV parser + walk-forward simulation using the same strategy logic as engine.js
// Requires engine.js globals: DEF, ema, rsi, atr, resample, lci, checkPattern, divExit
// در Node.js این globals رو از require می‌گیریم؛ در مرورگر از importScripts.
if (typeof require !== "undefined" && typeof module !== "undefined") {
  try {
    const E = require("./engine.js");
    global.DEF = E.DEF;
    global.ema = E.ema;
    global.rsi = E.rsi;
    global.atr = E.atr;
    global.resample = E.resample;
    global.lci = E.lci;
    global.checkPattern = E.checkPattern;
    global.divExit = E.divExit;
  } catch (e) {}
}

function decodeBuf(buf){const u=new Uint8Array(buf);let enc="utf-8",s=0;
if(u[0]===0xFF&&u[1]===0xFE){enc="utf-16le";s=2}else if(u[0]===0xFE&&u[1]===0xFF){enc="utf-16be";s=2}
else if(u[0]===0xEF&&u[1]===0xBB&&u[2]===0xBF){s=3}else if(u.length>3&&u[0]!==0&&u[1]===0&&u[2]!==0&&u[3]===0)enc="utf-16le";
return new TextDecoder(enc).decode(s?u.subarray(s):u)}
function parseTS(d,t){const m=/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/.exec(d);if(!m)return NaN;let h=0,mi=0,se=0;
if(t){const n=/(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);if(n){h=+n[1];mi=+n[2];se=+(n[3]||0)}}
return Date.UTC(+m[1],+m[2]-1,+m[3],h,mi,se)/1000}
function parseMT5(text){const lines=text.split(/\r?\n/).filter(l=>l.trim().length);if(lines.length<50)return{error:"فایل خیلی کوتاه است (کمتر از ۵۰ ردیف)"};
const l0=lines[0],cnt=c=>l0.split(c).length-1,delim=cnt("\t")>=Math.max(cnt(";"),cnt(","))&&cnt("\t")>0?"\t":cnt(";")>cnt(",")?";":",";
const f0=l0.split(delim).map(x=>x.replace(/[<>"\s]/g,"").toLowerCase()),hasH=f0.some(x=>/^[a-z]+$/.test(x)&&["date","time","open","high","low","close","datetime","timestamp"].includes(x));
let ix={d:0,t:1,o:2,h:3,l:4,c:5,dt:-1},start=0;
if(hasH){start=1;const g=n=>f0.indexOf(n);ix={d:g("date"),t:g("time"),o:g("open"),h:g("high"),l:g("low"),c:g("close"),dt:Math.max(g("datetime"),g("timestamp"))};
if(ix.d<0&&ix.dt<0&&ix.t>=0){ix.dt=ix.t;ix.t=-1}if(ix.o<0||ix.h<0||ix.l<0||ix.c<0)return{error:"ستون‌های Open/High/Low/Close پیدا نشد"}}
else{const p=l0.split(delim);if(/[ T]/.test(p[0].trim())){ix={d:-1,t:-1,o:1,h:2,l:3,c:4,dt:0}}}
const n=lines.length-start,T=new Float64Array(n),O=new Float64Array(n),H=new Float64Array(n),L=new Float64Array(n),C=new Float64Array(n);let k=0,dg=0;
for(let r=start;r<lines.length;r++){const p=lines[r].split(delim);let ts;
if(ix.dt>=0){const parts=(p[ix.dt]||"").trim().split(/[ T]/);ts=parseTS(parts[0],parts[1])}else ts=parseTS((p[ix.d]||"").trim(),(p[ix.t]||"").trim());
const o=+p[ix.o],h=+p[ix.h],l=+p[ix.l],c=+p[ix.c];if(!(ts>0)||!(o>0)||!(h>0)||!(l>0)||!(c>0)||h<l)continue;
if(k<300){const s=(p[ix.o]||"").trim(),q=s.indexOf(".");if(q>=0)dg=Math.max(dg,s.length-q-1)}
T[k]=ts;O[k]=o;H[k]=h;L[k]=l;C[k]=c;k++}
if(k<50)return{error:"ردیف معتبر پیدا نشد؛ قالب فایل را بررسی کن"};
let idx=Array.from({length:k},(_,i)=>i),sorted=true;for(let i=1;i<k;i++)if(T[i]<=T[i-1]){sorted=false;break}
if(!sorted)idx.sort((a,b)=>T[a]-T[b]);
const t=[],o=[],h=[],l=[],c=[];let prev=-1;for(const i of idx){if(T[i]===prev)continue;prev=T[i];t.push(T[i]);o.push(O[i]);h.push(H[i]);l.push(L[i]);c.push(C[i])}
const ds=[];for(let i=1;i<Math.min(t.length,2000);i++)ds.push(t[i]-t[i-1]);ds.sort((a,b)=>a-b);const step=ds[ds.length>>1];
let out={t,o,h,l,c,dg:Math.min(dg,6),step};
if(step===60){const cs=t.map((x,i)=>({time:x,open:o[i],high:h[i],low:l[i],close:c[i]})),r=resample(cs,5);out={t:r.map(x=>x.time),o:r.map(x=>x.open),h:r.map(x=>x.high),l:r.map(x=>x.low),c:r.map(x=>x.close),dg:out.dg,step:300,from:"M1"}}
else if(step!==300)return{error:"تایم‌فریم فایل M5 نیست (فاصله‌ی کندل‌ها "+step+" ثانیه است). از MT5 خروجی M5 یا M1 بگیر"};
return out}
function candlesOf(ds){const n=ds.t.length,o=new Array(n);for(let i=0;i<n;i++)o[i]={time:ds.t[i],open:ds.o[i],high:ds.h[i],low:ds.l[i],close:ds.c[i]};return o}
function btPrep(m5,S){S={...DEF,...S};const cl=m5.map(c=>c.close),m15=resample(m5,15),h1=resample(m5,60),mc=m15.map(c=>c.close),hc=h1.map(c=>c.close);
return{m5,S,efA:ema(cl,S.ef),emA:ema(cl,S.em),esA:ema(cl,S.es),rA:rsi(cl,S.rsiP),aA:atr(m5,S.atrP),m15,h1,mf:ema(mc,S.ef),mm:ema(mc,S.em),hf:ema(hc,S.ef),hm:ema(hc,S.em),hs:ema(hc,S.es)}}
function btSignals(P,mode,lo,hi){mode=mode||"pattern";const{m5,S,efA,emA,esA,aA,m15,h1,mf,mm,hf,hm,hs}=P,out=[];

for(let i=Math.max(lo,S.es+1,3);i<=hi;i++){const ef=efA[i],em=emA[i],es=esA[i],efp=efA[i-1],emp=emA[i-1],a=aA[i];if([ef,em,es,efp,emp,a].some(x=>x==null)||a<=0)continue;
const b=m5[i];let L,Sh;
const slope=(ef-efp)!==0&&(em-emp)!==0,ab=b.close>es,be=b.close<es;
{const l4=[b,m5[i-1],m5[i-2],m5[i-3]],pl=checkPattern(l4,"LONG",S.minRatio),ps=checkPattern(l4,"SHORT",S.minRatio),nc=ef!==em&&efp!==emp&&((ef>em&&efp>emp)||(ef<em&&efp<emp));L=ab&&ef>em&&nc&&slope&&pl.ok;Sh=be&&ef<em&&nc&&slope&&ps.ok}
if(!L&&!Sh)continue;
let m15L=true,m15S=true;if(S.m15){const k=lci(m15,900,b.time+300),f=k>=0?mf[k]:null,m=k>=0?mm[k]:null;if(f==null||m==null)continue;m15L=f>m;m15S=f<m}
let h1L=true,h1S=true;if(S.h1){const k=lci(h1,3600,b.time+300),s=k>=0?hs[k]:null;if(s==null)continue;const c=h1[k].close;if(S.h1Strict){const f=hf[k],m=hm[k];if(f==null||m==null)continue;h1L=c>s&&f>m&&m>s;h1S=c<s&&f<m&&m<s}else{h1L=c>s;h1S=c<s}}
let side=null;if(L&&m15L&&h1L)side="LONG";if(Sh&&m15S&&h1S)side="SHORT";if(!side)continue;
const sz=b.high-b.low,d=sz*2;if(d<=0)continue;
out.push({i,side,entry:b.close,sl:side==="LONG"?b.close-d:b.close+d,tp:null})}
return out}
// Trade simulation. Entry at the signal bar close. SL is checked before TP on the same bar (conservative).
// RSI-divergence exit is only known one bar after the pivot, so it exits at that later bar's close.
// Market sessions: a gap of more than gapMin minutes between two consecutive bars means the market was closed.
function sessInfo(m,gapMin){const n=m.length,start=new Int32Array(n),end=new Int32Array(n),gs=gapMin*60;let s=0,cnt=0;
for(let i=1;i<=n;i++){if(i===n||m[i].time-m[i-1].time>gs){for(let j=s;j<i;j++){start[j]=s;end[j]=i-1}s=i;if(i<n)cnt++}}return{start,end,gaps:cnt}}

function simTrade(P, s, O) {
  const m = P.m5, L = s.side === "LONG", initialRisk = Math.abs(s.entry - s.sl);
  if (!(initialRisk > 0)) return null;
  
  let target = null, divIdx = -1;
  if (O.exit === "rr") target = L ? s.entry + O.rr * initialRisk : s.entry - O.rr * initialRisk;
  else if (s.tp != null) target = s.tp;
  else {
    const ex = divExit(m, P.rA, s.i, L);
    if (ex) divIdx = ex.i + 1;
  }
  
  const MH = O.mh && O.mh.gap && O.mh.forceClose && P.si ? O.mh : null;
  const se = MH ? P.si.end[s.i] : -1;
  const realClose = !!MH && se < m.length - 1;
  let end = Math.min(m.length - 1, s.i + O.maxBars);
  if (realClose) end = Math.min(end, se);
  
  let currentSL = s.sl;
  let beActive = false; // Break-Even flag

  for (let q = s.i + 1; q <= end; q++) {
    const c = m[q];
    
    // Check SL (or BE)
    if (L ? c.low <= currentSL : c.high >= currentSL) {
      return { q, px: L ? Math.min(currentSL, c.open) : Math.max(currentSL, c.open), why: beActive ? "BE" : "SL" };
    }
    
    // Check TP
    if (target != null && (L ? c.high >= target : c.low <= target)) {
      return { q, px: target, why: "TP" };
    }
    
    // Check RSI Divergence Exit
    if (divIdx >= 0 && q === divIdx) {
      return { q, px: c.close, why: "RSI" };
    }
    
    // Check for 1:1 Break-Even logic
    if (!beActive) {
      const highestReached = L ? c.high : c.low;
      const profit = L ? highestReached - s.entry : s.entry - highestReached;
      if (profit >= initialRisk) {
        beActive = true;
        currentSL = s.entry; // Move SL to entry
      }
    }
  }
  
  if (realClose && end === se && se < s.i + O.maxBars) return { q: end, px: m[end].close, why: "CLOSE" };
  if (s.i + O.maxBars <= m.length - 1) return { q: end, px: m[end].close, why: "TIME" };
  return { q: end, px: m[end].close, why: "OPEN" };
}

function btTrades(P,mode,sym,O,lo,hi,info){const sigs=btSignals(P,mode,lo,hi),m=P.m5,out=[],M=O.mh||null,useGap=!!(M&&M.gap),hrOn=!!(M&&M.hFrom!=null&&M.hTo!=null&&M.hFrom!==M.hTo),wkOn=!!(M&&M.noWeekend);let free=-1;
if(useGap&&(!P.si||P.siKey!==M.gapMin)){P.si=sessInfo(m,M.gapMin);P.siKey=M.gapMin}
if(info&&!info.blocked)info.blocked={open:0,close:0,hours:0,weekend:0};const si=useGap?P.si:null;
for(const s of sigs){if(s.i<=free)continue;
if(M){const t=m[s.i].time,dow=(Math.floor(t/86400)+4)%7,hr=Math.floor((t%86400)/3600);let why=null;
if(wkOn&&(dow===6||dow===0))why="weekend";
else if(hrOn&&!(M.hFrom<M.hTo?hr>=M.hFrom&&hr<M.hTo:hr>=M.hFrom||hr<M.hTo))why="hours";
else if(si&&s.i-si.start[s.i]<M.afterOpen)why="open";
else if(si&&si.end[s.i]<m.length-1&&si.end[s.i]-s.i<Math.max(M.beforeClose,M.forceClose?1:0))why="close";
if(why){if(info)info.blocked[why]++;continue}}
const r=simTrade(P,s,O);if(!r)continue;if(r.why==="OPEN")break;free=r.q;
const risk=Math.abs(s.entry-s.sl),L=s.side==="LONG",g=(L?r.px-s.entry:s.entry-r.px)/risk,cost=O.cost>0?(O.cost/100*s.entry)/risk:0;
out.push({sym,mode,side:s.side,iE:s.i,tE:m[s.i].time,iX:r.q,tX:m[r.q].time,entry:s.entry,sl:s.sl,tp:s.tp,px:r.px,why:r.why,R:g-cost,bars:r.q-s.i,cross:si?si.start[r.q]!==si.start[s.i]:false})}
return out}

// فقط برای شمارش ورودهای مسدودشده در main thread — بدون تولید trade
function countBlocked(P, mode, O, lo, hi, si) {
  const out = { open: 0, close: 0, hours: 0, weekend: 0 };
  const M = O.mh || null;
  if (!M) return out;
  const m = P.m5;
  const hrOn = !!(M.hFrom != null && M.hTo != null && M.hFrom !== M.hTo);
  const wkOn = !!M.noWeekend;
  const sigs = btSignals(P, mode, lo, hi);
  for (const s of sigs) {
    const t = m[s.i].time;
    const dow = (Math.floor(t / 86400) + 4) % 7;
    const hr = Math.floor((t % 86400) / 3600);
    if (wkOn && (dow === 6 || dow === 0)) { out.weekend++; continue; }
    if (hrOn && !(M.hFrom < M.hTo ? hr >= M.hFrom && hr < M.hTo : hr >= M.hFrom || hr < M.hTo)) { out.hours++; continue; }
    if (si && s.i - si.start[s.i] < M.afterOpen) { out.open++; continue; }
    if (si && si.end[s.i] < m.length - 1 && si.end[s.i] - s.i < Math.max(M.beforeClose, M.forceClose ? 1 : 0)) { out.close++; continue; }
  }
  return out;
}

function metrics(tr,riskPct){const n=tr.length;if(!n)return{n:0};const s=[...tr].sort((a,b)=>a.tX-b.tX);
let sum=0,gw=0,gl=0,w=0,peak=0,dd=0,eq=1,pe=1,ddp=0,bars=0,best=-1e9,worst=1e9,st=0,ms=0,ln=0,sn=0,lr=0,sr=0,cx=0,cl=0;
for(const t of s){sum+=t.R;if(t.R>0){gw+=t.R;w++;st=0}else{gl-=t.R;st++;if(st>ms)ms=st}bars+=t.bars;if(t.cross)cx++;if(t.why==="CLOSE")cl++;best=Math.max(best,t.R);worst=Math.min(worst,t.R);
if(sum>peak)peak=sum;dd=Math.max(dd,peak-sum);eq*=Math.max(0,1+riskPct/100*t.R);if(eq>pe)pe=eq;ddp=Math.max(ddp,(pe-eq)/pe*100);
if(t.side==="LONG"){ln++;lr+=t.R}else{sn++;sr+=t.R}}
return{n,w,wr:w/n*100,sumR:sum,avgR:sum/n,pf:gl>0?gw/gl:(gw>0?Infinity:0),ddR:dd,ddPct:ddp,retPct:(eq-1)*100,avgBars:bars/n,best,worst,maxLossStreak:ms,longs:ln,shorts:sn,avgLong:ln?lr/ln:0,avgShort:sn?sr/sn:0,crossed:cx,closeExits:cl}}
function equityOf(tr){const s=[...tr].sort((a,b)=>a.tX-b.tX);let c=0;return s.map(t=>({t:t.tX,v:(c+=t.R)}))}

if(typeof module!=="undefined")module.exports={sessInfo,parseMT5,decodeBuf,candlesOf,btPrep,btSignals,btTrades,simTrade,metrics,equityOf,countBlocked};
