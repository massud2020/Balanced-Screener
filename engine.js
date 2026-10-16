// Port of src/lib/strategy/engine.ts (3+1 pattern strategy)
const DEF={mode:"pattern",ef:21,em:50,es:200,rsiP:14,minRatio:.5,atrP:14,m15:true,h1:true,h1Strict:false};
const ENGINE_VER=32;
function ema(v,p){const o=Array(v.length).fill(null);if(v.length<p)return o;const k=2/(p+1);let s=0;for(let i=0;i<p;i++)s+=v[i];let pr=s/p;o[p-1]=pr;for(let i=p;i<v.length;i++){pr=v[i]*k+pr*(1-k);o[i]=pr}return o}
function rsi(c,p){const o=Array(c.length).fill(null);if(c.length<=p)return o;let g=0,l=0;for(let i=1;i<=p;i++){const d=c[i]-c[i-1];d>=0?g+=d:l-=d}let ag=g/p,al=l/p;o[p]=al===0?100:100-100/(1+ag/al);for(let i=p+1;i<c.length;i++){const d=c[i]-c[i-1];ag=(ag*(p-1)+(d>0?d:0))/p;al=(al*(p-1)+(d<0?-d:0))/p;o[i]=al===0?100:100-100/(1+ag/al)}return o}
function atr(cs,p){const o=Array(cs.length).fill(null);if(cs.length<=p)return o;const tr=cs.map((c,i)=>i?Math.max(c.high-c.low,Math.abs(c.high-cs[i-1].close),Math.abs(c.low-cs[i-1].close)):c.high-c.low);let s=0;for(let i=0;i<p;i++)s+=tr[i];let pr=s/p;o[p-1]=pr;for(let i=p;i<tr.length;i++){pr=(pr*(p-1)+tr[i])/p;o[i]=pr}return o}
const last=(a,n=0)=>{const v=a[a.length-1-n];return v==null||!isFinite(v)?null:v};
function dropForming(c,sec,now){return c.length&&now<c[c.length-1].time+sec?c.slice(0,-1):c}
function resample(c,min){const sz=min*60,m=new Map();for(const x of c){const b=Math.floor(x.time/sz)*sz;(m.get(b)||m.set(b,[]).get(b)).push(x)}return[...m.entries()].sort((a,b)=>a[0]-b[0]).map(([time,a])=>({time,open:a[0].open,high:Math.max(...a.map(x=>x.high)),low:Math.min(...a.map(x=>x.low)),close:a[a.length-1].close}))}
function checkPattern(l4,dir,minRatio){let g=0,r=0,gs=0,rs=0;for(const c of l4){const s=c.high-c.low;if(c.close>c.open){g++;gs+=s}else if(c.close<c.open){r++;rs+=s}else return{ok:false,ratio:0}}
if(dir==="LONG"){if(g!==1||r!==3||!(l4[0].close>l4[0].open)||rs<=0)return{ok:false,ratio:0};const q=gs/rs;return{ok:q>=minRatio,ratio:q}}
if(r!==1||g!==3||!(l4[0].close<l4[0].open)||gs<=0)return{ok:false,ratio:0};const q=rs/gs;return{ok:q>=minRatio,ratio:q}}
function evaluate(id,raw5,rawH1,S,now=Date.now()/1000){S={...DEF,...S};const m5=dropForming(raw5,300,now),h1=dropForming(rawH1,3600,now);const price=raw5.length?raw5[raw5.length-1].close:0;const row=(x={})=>({id,side:null,price,fail:null,...x});
if(m5.length<S.es+3)return row({fail:"تاریخچه M5 کافی نیست"});
const cl=m5.map(c=>c.close),efA=ema(cl,S.ef),emA=ema(cl,S.em),esA=ema(cl,S.es),rA=rsi(cl,S.rsiP),aA=atr(m5,S.atrP);
const ef=last(efA),em=last(emA),es=last(esA),r=last(rA),a=last(aA),efp=last(efA,1),emp=last(emA,1);
if([ef,em,es,r,a,efp,emp].some(x=>x==null))return row({fail:"اندیکاتورها آماده نیست"});
const sc=m5[m5.length-1].close,pat=m5.slice(-4).reverse(),pl=checkPattern(pat,"LONG",S.minRatio),ps=checkPattern(pat,"SHORT",S.minRatio);
const ab=sc>es,be=sc<es,slope=(ef-efp)!==0&&(em-emp)!==0;
const nc=ef!==em&&efp!==emp&&((ef>em&&efp>emp)||(ef<em&&efp<emp));
const L=ab&&ef>em&&nc&&slope&&pl.ok,Sh=be&&ef<em&&nc&&slope&&ps.ok;
let m15L=true,m15S=true;if(S.m15){const m=dropForming(resample(m5,15),900,now);if(m.length<S.em+2)return row({rsi:r,fail:"تاریخچه M15 کافی نیست"});const mc=m.map(c=>c.close),f=last(ema(mc,S.ef)),mm=last(ema(mc,S.em));m15L=f>mm;m15S=f<mm}
let h1L=true,h1S=true;if(S.h1){if(h1.length<S.es+2)return row({rsi:r,fail:"تاریخچه H1 کافی نیست"});const hc=h1.map(c=>c.close),hs=last(ema(hc,S.es)),c=hc[hc.length-1];if(S.h1Strict){const f=last(ema(hc,S.ef)),m=last(ema(hc,S.em));h1L=c>hs&&f>m&&m>hs;h1S=c<hs&&f<m&&m<hs}else{h1L=c>hs;h1S=c<hs}}
let side=null;if(L&&m15L&&h1L)side="LONG";if(Sh&&m15S&&h1S)side="SHORT";
let sl=null;if(side){const sz=m5[m5.length-1].high-m5[m5.length-1].low;const d=sz*2;if(d>0)sl=side==="LONG"?sc-d:sc+d}
let fail=null;if(!side){fail=(!ab&&!be)?"قیمت روی EMA200":!slope?"شیب EMA":!nc?"تقاطع EMA21/50":!((pl.ok&&ef>em)||(ps.ok&&ef<em))?"هم‌راستایی EMA21/50":!pl.ok&&!ps.ok?"الگوی ۳+۱":(L?!m15L:Sh?!m15S:!m15L&&!m15S)?"فیلتر M15":"فیلتر H1"}
return row({side,rsi:r,atr:a,entry:side?sc:null,sl,fail,ef,em,es})}

function lci(b,sec,asOf){let lo=0,hi=b.length-1,a=-1;while(lo<=hi){const m=(lo+hi)>>1;if(b[m].time+sec<=asOf){a=m;lo=m+1}else hi=m-1}return a}
function divExit(c,rA,from,isLong){const H=[],L=[];for(let i=Math.max(from+2,1);i<c.length-1;i++){const r=rA[i];if(r==null)continue;if(c[i].high>=c[i-1].high&&c[i].high>=c[i+1].high)H.push({i,p:c[i].high,r});if(c[i].low<=c[i-1].low&&c[i].low<=c[i+1].low)L.push({i,p:c[i].low,r})}
const A=isLong?H:L;for(let k=1;k<A.length;k++){const a=A[k-1],b=A[k];if(a.i<=from)continue;if(isLong?(b.p>a.p&&b.r<a.r):(b.p<a.p&&b.r>a.r))return{i:b.i,p:c[b.i].close}}return null}
function marks(raw5,rawH1,S,now=Date.now()/1000){S={...DEF,...S};const m5=dropForming(raw5,300,now),h1=dropForming(rawH1,3600,now);if(m5.length<S.es+4)return[];
const cl=m5.map(c=>c.close),efA=ema(cl,S.ef),emA=ema(cl,S.em),esA=ema(cl,S.es),rA=rsi(cl,S.rsiP),aA=atr(m5,S.atrP);
const m15=S.m15?resample(m5,15):[],mc=m15.map(c=>c.close),mf=S.m15?ema(mc,S.ef):[],mm=S.m15?ema(mc,S.em):[];
const hc=h1.map(c=>c.close),hf=S.h1?ema(hc,S.ef):[],hm=S.h1?ema(hc,S.em):[],hs=S.h1?ema(hc,S.es):[];const out=[];let free=0;
for(let i=Math.max(m5.length-180,S.es+1,3);i<m5.length;i++){const ef=efA[i],em=emA[i],es=esA[i],efp=efA[i-1],emp=emA[i-1],r=rA[i],a=aA[i];if([ef,em,es,efp,emp,r,a].some(x=>x==null)||a<=0)continue;
if(m5[i].time<=free)continue;
const b=m5[i],l4=[b,m5[i-1],m5[i-2],m5[i-3]],pl=checkPattern(l4,"LONG",S.minRatio),ps=checkPattern(l4,"SHORT",S.minRatio);
const slope=(ef-efp)!==0&&(em-emp)!==0,nc=ef!==em&&efp!==emp&&((ef>em&&efp>emp)||(ef<em&&efp<emp)),ab=b.close>es,be=b.close<es;
const L=ab&&ef>em&&nc&&slope&&pl.ok,Sh=be&&ef<em&&nc&&slope&&ps.ok;if(!L&&!Sh)continue;
let m15L=true,m15S=true;if(S.m15){const k=lci(m15,900,b.time+300),f=k>=0?mf[k]:null,m=k>=0?mm[k]:null;if(f==null||m==null)continue;m15L=f>m;m15S=f<m}
let h1L=true,h1S=true;if(S.h1){const k=lci(h1,3600,b.time+300),s=k>=0?hs[k]:null;if(s==null)continue;const c=h1[k].close;if(S.h1Strict){const f=hf[k],m=hm[k];if(f==null||m==null)continue;h1L=c>s&&f>m&&m>s;h1S=c<s&&f<m&&m<s}else{h1L=c>s;h1S=c<s}}
let side=null;if(L&&m15L&&h1L)side="LONG";if(Sh&&m15S&&h1S)side="SHORT";if(!side)continue;
const sz=b.high-b.low,d=sz*2;if(d<=0)continue;
const ex=divExit(m5,rA,i,side==="LONG");if(!ex)continue;free=m5[ex.i].time;out.push({time:b.time,side,entry:b.close,sl:side==="LONG"?b.close-d:b.close+d,tp:ex.p,t2:m5[ex.i].time})}
return out}


// ---- Visual analysis: the same conditions evaluate() uses, returned as a checklist for the UI ----
function explain(id,raw5,rawH1,S,now=Date.now()/1000){S={...DEF,...S};const m5=dropForming(raw5,300,now),h1=dropForming(rawH1,3600,now),out={id,mode:S.mode,checks:[],pass:0,total:0,dir:null,err:null};
if(m5.length<S.es+3){out.err="تاریخچه M5 کافی نیست";return out}
const cl=m5.map(c=>c.close),efA=ema(cl,S.ef),emA=ema(cl,S.em),esA=ema(cl,S.es),rA=rsi(cl,S.rsiP),aA=atr(m5,S.atrP),dg=S.dg==null?5:S.dg;
const ef=last(efA),em=last(emA),es=last(esA),r=last(rA),a=last(aA),efp=last(efA,1),emp=last(emA,1);
if([ef,em,es,r,a,efp,emp].some(x=>x==null)){out.err="اندیکاتورها آماده نیست";return out}
const i=m5.length-1,b=m5[i],sc=b.close,D=sc>=es?"LONG":"SHORT",L=D==="LONG",sl=(ef-efp)!==0&&(em-emp)!==0;
out.dir=D;out.price=sc;out.rsi=r;out.atr=a;out.ef=ef;out.em=em;out.es=es;
const add=(k,label,ok,txt,viz)=>{out.checks.push({k,label,ok:!!ok,txt,viz});out.total++;if(ok)out.pass++};
add("trend",`قیمت ${L?"بالای":"پایین"} EMA${S.es} و شیب EMA`,(L?sc>es:sc<es)&&sl,((sc-es)/a>=0?"+":"")+((sc-es)/a).toFixed(1)+"×ATR",{t:"dist",v:(sc-es)/a});
{const pat=m5.slice(-4).reverse(),pl=checkPattern(pat,"LONG",S.minRatio),ps=checkPattern(pat,"SHORT",S.minRatio),nc=ef!==em&&efp!==emp&&((ef>em&&efp>emp)||(ef<em&&efp<emp)),pp=L?pl:ps;
add("emax",`EMA${S.ef} ${L?"بالای":"پایین"} EMA${S.em}`,L?ef>em:ef<em,((ef-em)/a>=0?"+":"")+((ef-em)/a).toFixed(2)+"×ATR",{t:"dist",v:(ef-em)/a});
add("nc","هم‌جهتی دو کندل اخیر (بدون تقاطع)",nc,nc?"بله":"خیر");
add("pat","الگوی ۳+۱",pp.ok,"نسبت "+pp.ratio.toFixed(2)+" از "+S.minRatio,{t:"pat",c:pat.slice().reverse().map(c=>({o:c.open,h:c.high,l:c.low,c:c.close})),ratio:pp.ratio,th:S.minRatio,ok:pp.ok});
out.slEst=(b.high-b.low)*2}
if(S.m15){const m=dropForming(resample(m5,15),900,now);if(m.length<S.em+2)add("m15","فیلتر M15",false,"تاریخچه کم");else{const mc=m.map(c=>c.close),f=last(ema(mc,S.ef)),mm=last(ema(mc,S.em));add("m15",`M15: EMA${S.ef} ${L?"بالای":"پایین"} EMA${S.em}`,L?f>mm:f<mm,((f-mm)/a>=0?"+":"")+((f-mm)/a).toFixed(2)+"×ATR",{t:"dist",v:(f-mm)/a})}}
if(S.h1){if(h1.length<S.es+2)add("h1","فیلتر H1",false,"تاریخچه کم");else{const hc=h1.map(c=>c.close),hs=last(ema(hc,S.es)),c=hc[hc.length-1];let ok;if(S.h1Strict){const f=last(ema(hc,S.ef)),m=last(ema(hc,S.em));ok=L?c>hs&&f>m&&m>hs:c<hs&&f<m&&m<hs}else ok=L?c>hs:c<hs;add("h1",`H1: قیمت ${L?"بالای":"پایین"} EMA${S.es}${S.h1Strict?" (سخت‌گیرانه)":""}`,ok,((c-hs)/a>=0?"+":"")+((c-hs)/a).toFixed(1)+"×ATR",{t:"dist",v:(c-hs)/a})}}
return out}

if(typeof module!=="undefined")module.exports={explain,dropForming,marks,divExit,lci,evaluate,ema,rsi,atr,resample,checkPattern,DEF};
