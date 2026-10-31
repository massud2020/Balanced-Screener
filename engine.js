// Port of src/lib/strategy/engine.ts (Dual Strategy: Trend & Range)
const DEF={mode:"pattern",trend:true,emax:true,nc:true,pat:true,adx:true,adxMin:25,m15:true,h1:true,h1Strict:false,rsi:true,rsiL:40,rsiS:60,ef:21,em:50,es:200,rsiP:14,minRatio:.5,atrP:14,bbP:20,bbDev:2,rangeAdxMax:20,rangeMinATR:3,rangeMinTouches:3,rangeRsiL:35,rangeRsiS:65,rangeMinRR:1.5,rangeMaxRiskATR:3,rangeH1:true};
const ENGINE_VER=39; // استراتژی رنج v2: تأیید برگشت، SL پشت اکستریم، TP باند میانی، اعتبارسنجی رنج

function ema(v,p){const o=Array(v.length).fill(null);if(v.length<p)return o;const k=2/(p+1);let s=0;for(let i=0;i<p;i++)s+=v[i];let pr=s/p;o[p-1]=pr;for(let i=p;i<v.length;i++){pr=v[i]*k+pr*(1-k);o[i]=pr}return o}
function rsi(c,p){const o=Array(c.length).fill(null);if(c.length<=p)return o;let g=0,l=0;for(let i=1;i<=p;i++){const d=c[i]-c[i-1];d>=0?g+=d:l-=d}let ag=g/p,al=l/p;o[p]=al===0?100:100-100/(1+ag/al);for(let i=p+1;i<c.length;i++){const d=c[i]-c[i-1];ag=(ag*(p-1)+(d>0?d:0))/p;al=(al*(p-1)+(d<0?-d:0))/p;o[i]=al===0?100:100-100/(1+ag/al)}return o}
function atr(cs,p){const o=Array(cs.length).fill(null);if(cs.length<=p)return o;const tr=cs.map((c,i)=>i?Math.max(c.high-c.low,Math.abs(c.high-cs[i-1].close),Math.abs(c.low-cs[i-1].close)):c.high-c.low);let s=0;for(let i=0;i<p;i++)s+=tr[i];let pr=s/p;o[p-1]=pr;for(let i=p;i<tr.length;i++){pr=(pr*(p-1)+tr[i])/p;o[i]=pr}return o}

function sma(v,p){const o=Array(v.length).fill(null);if(v.length<p)return o;let s=0;for(let i=0;i<p;i++)s+=v[i];o[p-1]=s/p;for(let i=p;i<v.length;i++){s=s-v[i-p]+v[i];o[i]=s/p}return o}
function stdDev(v,p){const m=sma(v,p),o=Array(v.length).fill(null);for(let i=p-1;i<v.length;i++){let s=0;for(let j=0;j<p;j++)s+=Math.pow(v[i-j]-m[i],2);o[i]=Math.sqrt(s/p)}return o}
function adx(cs,p){
  if(cs.length<p*2)return Array(cs.length).fill(null);
  let trs=[],pDMs=[],nDMs=[];
  for(let i=1;i<cs.length;i++){
    let h=cs[i].high,l=cs[i].low,ph=cs[i-1].high,pl=cs[i-1].low,pc=cs[i-1].close;
    let tr=Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc));
    let pDM=(h-ph>pl-l&&h-ph>0)?h-ph:0;
    let nDM=(pl-l>h-ph&&pl-l>0)?pl-l:0;
    trs.push(tr);pDMs.push(pDM);nDMs.push(nDM);
  }
  let str=[],spDM=[],snDM=[];
  let sTR=0,sPDM=0,sNDM=0;
  for(let i=0;i<p;i++){sTR+=trs[i];sPDM+=pDMs[i];sNDM+=nDMs[i];}
  str.push(sTR);spDM.push(sPDM);snDM.push(sNDM);
  for(let i=p;i<trs.length;i++){
    sTR=sTR-sTR/p+trs[i];sPDM=sPDM-sPDM/p+pDMs[i];sNDM=sNDM-sNDM/p+nDMs[i];
    str.push(sTR);spDM.push(sPDM);snDM.push(sNDM);
  }
  let dx=[];
  for(let i=0;i<str.length;i++){
    let pDI=100*(spDM[i]/str[i]),nDI=100*(snDM[i]/str[i]);
    let sum=pDI+nDI;
    dx.push(sum===0?0:100*Math.abs(pDI-nDI)/sum);
  }
  let adxArr=Array(cs.length).fill(null);
  let sDX=0;
  for(let i=0;i<p;i++)sDX+=dx[i];
  adxArr[p*2-1]=sDX/p;
  for(let i=p;i<dx.length;i++){
    let prev=adxArr[p*2-2+i];
    adxArr[p*2-1+i]=(prev*(p-1)+dx[i])/p;
  }
  return adxArr;
}

const last=(a,n=0)=>{const v=a[a.length-1-n];return v==null||!isFinite(v)?null:v};
function dropForming(c,sec,now){return c.length&&now<c[c.length-1].time+sec?c.slice(0,-1):c}
function resample(c,min){const sz=min*60,m=new Map();for(const x of c){const b=Math.floor(x.time/sz)*sz;(m.get(b)||m.set(b,[]).get(b)).push(x)}return[...m.entries()].sort((a,b)=>a[0]-b[0]).map(([time,a])=>({time,open:a[0].open,high:Math.max(...a.map(x=>x.high)),low:Math.min(...a.map(x=>x.low)),close:a[a.length-1].close}))}
function checkPattern(l4,dir,minRatio){let g=0,r=0,gs=0,rs=0;for(const c of l4){const s=c.high-c.low;if(c.close>c.open){g++;gs+=s}else if(c.close<c.open){r++;rs+=s}else return{ok:false,ratio:0}}
if(dir==="LONG"){if(g!==1||r!==3||!(l4[0].close>l4[0].open)||rs<=0)return{ok:false,ratio:0};const q=gs/rs;return{ok:q>=minRatio,ratio:q}}
if(r!==1||g!==3||!(l4[0].close<l4[0].open)||gs<=0)return{ok:false,ratio:0};const q=rs/gs;return{ok:q>=minRatio,ratio:q}}


// 🎯 استراتژی رنج v2 (برگشت به میانگین با تأیید) — مشترک بین evaluate و explain
function rangeAnalyze(m5,h1,S,ind){
  const {rA,aA,smaA,stdA,adxA}=ind,n=m5.length,i=n-1;
  const b=m5[i],pv=m5[i-1],pv2=m5[i-2],sc=b.close;
  const smaV=smaA[i],stdV=stdA[i],smaP=smaA[i-1],stdP=stdA[i-1];
  const r=rA[i],rP=rA[i-1],rP2=rA[i-2],a=aA[i],adxV=adxA[i],adxB=adxA[i-3];
  const up=smaV+S.bbDev*stdV,lo=smaV-S.bbDev*stdV,upP=smaP+S.bbDev*stdP,loP=smaP-S.bbDev*stdP;
  // رنج از ۴۸ کندل قبل از دو کندل آخر ساخته می‌شود (کندل شکست/ماشه جزو آن نیست)
  const lb=m5.slice(-50,-2),rh=Math.max(...lb.map(c=>c.high)),rl=Math.min(...lb.map(c=>c.low)),H=rh-rl;
  const dir=pv.close<=loP?"LONG":pv.close>=upP?"SHORT":(sc<smaV?"LONG":"SHORT"),L=dir==="LONG";
  const touches=f=>{let k=0,inn=false;for(const c of lb){const t=f(c);if(t&&!inn)k++;inn=t}return k};
  const tTop=touches(c=>c.high>=rh-0.15*H),tBot=touches(c=>c.low<=rl+0.15*H);
  const roomOk=H>=S.rangeMinATR*a,touchOk=tTop>=1&&tBot>=1&&tTop+tBot>=S.rangeMinTouches;
  const broke=sc>rh+0.5*a||sc<rl-0.5*a,rangeOk=roomOk&&touchOk&&!broke;
  const adxOk=adxV<S.rangeAdxMax||(adxV<S.adxMin&&adxB!=null&&adxV<adxB);
  const trig=L?(pv.close<=loP&&sc>lo&&b.close>b.open):(pv.close>=upP&&sc<up&&b.close<b.open);
  const rv=[r,rP,rP2].filter(x=>x!=null);
  const rsiOk=L?(Math.min(...rv)<S.rangeRsiL&&r>rP):(Math.max(...rv)>S.rangeRsiS&&r<rP);
  let h1Ok=true,h1adx=null;
  if(S.rangeH1&&h1&&h1.length>=40){h1adx=last(adx(h1,14));if(h1adx!=null)h1Ok=h1adx<25}
  // حد ضرر: پشت اکستریم کندل‌های برگشت + ۰.۵ ATR، حداقل ۱ ATR
  const ext=L?Math.min(b.low,pv.low,pv2.low):Math.max(b.high,pv.high,pv2.high);
  let sl=L?ext-0.5*a:ext+0.5*a;if(Math.abs(sc-sl)<a)sl=L?sc-a:sc+a;
  const risk=Math.abs(sc-sl),tp=smaV,tp2=L?up:lo,reward=L?tp-sc:sc-tp,rr=risk>0?reward/risk:0;
  const rrOk=reward>0&&rr>=S.rangeMinRR&&risk<=S.rangeMaxRiskATR*a;
  const dg=ind.dg==null?5:ind.dg,checks=[];
  const add=(k,label,ok,txt,fail,viz)=>checks.push({k,label,ok:!!ok,txt,fail,viz});
  if(S.adx!==false)add("adx",`ADX < ${S.rangeAdxMax} (رنج)`,adxOk,adxV.toFixed(1),"بازار روند دارد (ADX)",{t:"dist",v:(adxV-S.rangeAdxMax)/25});
  add("rng","رنج معتبر (برخورد به کف/سقف)",rangeOk,`${tBot} کف · ${tTop} سقف · ${(H/a).toFixed(1)}×ATR${broke?" · شکست":""}`,broke?"رنج شکسته شده":"رنج معتبر نیست");
  add("trg","تأیید برگشت (بسته‌شدن داخل باند)",trig,trig?"بله":"خیر","برگشت تأیید نشده");
  if(S.rsi!==false)add("rsi","RSI اشباع و در حال برگشت",rsiOk,r.toFixed(1),"RSI در محدوده اشباع نیست",{t:"dist",v:(r-50)/50});
  if(S.rangeH1)add("h1","H1 بدون روند قوی",h1Ok,h1adx==null?"-":"ADX "+h1adx.toFixed(1),"H1 رونددار است");
  add("rr","نسبت ریسک/ریوارد ≥ "+S.rangeMinRR,rrOk,"R:R "+rr.toFixed(2),"نسبت ریسک به ریوارد کافی نیست");
  return{dir,checks,sl,tp,tp2,rr,rh,rl,risk,price:sc,low:rl,high:rh,dg};
}

function evaluate(id,raw5,rawH1,S,now=Date.now()/1000){
    S={...DEF,...S};
    const m5=dropForming(raw5,300,now),h1=dropForming(rawH1,3600,now);
    const price=raw5.length?raw5[raw5.length-1].close:0;
    const row=(x={})=>({id,side:null,price,fail:null,pass:0,total:0,checks:[],...x});
    
    if(m5.length<S.es+3)return row({fail:"تاریخچه M5 کافی نیست"});
    
    const cl=m5.map(c=>c.close),efA=ema(cl,S.ef),emA=ema(cl,S.em),esA=ema(cl,S.es),rA=rsi(cl,S.rsiP),aA=atr(m5,S.atrP);
    const smaA=sma(cl,S.bbP),stdA=stdDev(cl,S.bbP),adxA=adx(m5,S.rsiP);
    
    const ef=last(efA),em=last(emA),es=last(esA),r=last(rA),a=last(aA),efp=last(efA,1),emp=last(emA,1);
    const smaV=last(smaA),stdV=last(stdA),adxV=last(adxA);
    
    if([ef,em,es,r,a,efp,emp,smaV,stdV,adxV].some(x=>x==null))return row({fail:"اندیکاتورها آماده نیست"});
    
    const upperBB = smaV + (S.bbDev * stdV);
    const lowerBB = smaV - (S.bbDev * stdV);
    const sc=m5[m5.length-1].close;

    // 🛠️ محاسبه ناحیه رنج (سقف و کف ۵۰ کندل اخیر)
    const lookback = m5.slice(-50);
    const rangeHigh = Math.max(...lookback.map(c => c.high));
    const rangeLow = Math.min(...lookback.map(c => c.low));

    let pass = 0, total = 0, checks = [], fail = null, side = null;
    const addCheck = (label, ok, failMsg) => {
        total++;
        checks.push({ l: label, ok: !!ok });
        if (ok) pass++;
        else if (!fail) fail = failMsg;
    };

    let RA=null;
    if (S.mode === "range") {
        RA = rangeAnalyze(m5,h1,S,{rA,aA,smaA,stdA,adxA});
        RA.checks.forEach(c=>addCheck(c.label,c.ok,c.fail));
        if (pass === total && total > 0) { side = RA.dir; fail = null; }
    } else {
        const pat=m5.slice(-4).reverse(),pl=checkPattern(pat,"LONG",S.minRatio),ps=checkPattern(pat,"SHORT",S.minRatio);
        const ab=sc>es,be=sc<es,slope=(ef-efp)!==0&&(em-emp)!==0;
        const nc=ef!==em&&efp!==emp&&((ef>em&&efp>emp)||(ef<em&&efp<emp));
        const D = sc >= es ? "LONG" : "SHORT";
        const isL = D === "LONG";

        let m15L=true,m15S=true;
        if(S.m15){
            const m=dropForming(resample(m5,15),900,now);
            if(m.length<S.em+2)return row({rsi:r,fail:"تاریخچه M15 کافی نیست"});
            const mc=m.map(c=>c.close),f=last(ema(mc,S.ef)),mm=last(ema(mc,S.em));
            m15L=f>mm;m15S=f<mm;
        }
        
        let h1L=true,h1S=true;
        if(S.h1){
            if(h1.length<S.es+2)return row({rsi:r,fail:"تاریخچه H1 کافی نیست"});
            const hc=h1.map(c=>c.close),hs=last(ema(hc,S.es)),c=hc[hc.length-1];
            if(S.h1Strict){
                const f=last(ema(hc,S.ef)),m=last(ema(hc,S.em));
                h1L=c>hs&&f>m&&m>hs;h1S=c<hs&&f<m&&m<hs;
            } else {
                h1L=c>hs;h1S=c<hs;
            }
        }

        if (S.trend !== false) addCheck(`قیمت ${isL ? "بالای" : "پایین"} EMA${S.es}`, isL ? ab : be, `قیمت روی EMA200`);
        if (S.nc !== false) addCheck(`هم‌جهتی دو کندل (بدون تقاطع)`, nc, `تقاطع EMA21/50`);
        if (S.emax !== false) addCheck(`هم‌راستایی EMA${S.ef}/${S.em}`, isL ? ef > em : ef < em, `هم‌راستایی EMA21/50`);
        if (S.pat !== false) addCheck(`الگوی ۳+۱`, isL ? pl.ok : ps.ok, `الگوی ۳+۱`);
        if (S.adx !== false) addCheck(`ADX > ${S.adxMin} (روند قوی)`, adxV > S.adxMin, `بازار روند کافی ندارد (ADX)`);
        if(S.m15) addCheck(`فیلتر M15`, isL ? m15L : m15S, `فیلتر M15`);
        if(S.h1) addCheck(`فیلتر H1`, isL ? h1L : h1S, `فیلتر H1`);
        if(S.rsi) addCheck(`فیلتر RSI`, isL ? r < S.rsiL : r > S.rsiS, `فیلتر RSI`);

        if (pass === total && total > 0) {
            side = D;
            fail = null;
        }
    }

    let sl=null,tp=null,tp2=null,rr=null;
    if(side && RA){ sl=RA.sl; tp=RA.tp; tp2=RA.tp2; rr=RA.rr; }
    else if(side){
        const sz=m5[m5.length-1].high-m5[m5.length-1].low;
        const d=sz*2;
        if(d>0) sl = side==="LONG" ? sc-d : sc+d;
        if(!sl) {
            const atrV = a || (sc * 0.002);
            sl = side==="LONG" ? sc - atrV : sc + atrV;
        }
    }

    return row({side, rsi:r, atr:a, entry:side?sc:null, sl, tp, tp2, rr:rr!=null?+rr.toFixed(2):null, fail, ef, em, es, adx:adxV, rangeHigh:RA?RA.rh:rangeHigh, rangeLow:RA?RA.rl:rangeLow, pass, total, checks});
}

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

function explain(id,raw5,rawH1,S,now=Date.now()/1000){S={...DEF,...S};const m5=dropForming(raw5,300,now),h1=dropForming(rawH1,3600,now),out={id,mode:S.mode,checks:[],pass:0,total:0,dir:null,err:null};
if(m5.length<S.es+3){out.err="تاریخچه M5 کافی نیست";return out}
const cl=m5.map(c=>c.close),efA=ema(cl,S.ef),emA=ema(cl,S.em),esA=ema(cl,S.es),rA=rsi(cl,S.rsiP),aA=atr(m5,S.atrP),dg=S.dg==null?5:S.dg;
const smaA=sma(cl,S.bbP),stdA=stdDev(cl,S.bbP),adxA=adx(m5,S.rsiP);
const ef=last(efA),em=last(emA),es=last(esA),r=last(rA),a=last(aA),efp=last(efA,1),emp=last(emA,1);
const smaV=last(smaA),stdV=last(stdA),adxV=last(adxA);
if([ef,em,es,r,a,efp,emp,smaV,stdV,adxV].some(x=>x==null)){out.err="اندیکاتورها آماده نیست";return out}
const i=m5.length-1,b=m5[i],sc=b.close,D=sc>=es?"LONG":"SHORT",L=D==="LONG",sl=(ef-efp)!==0&&(em-emp)!==0;
out.dir=D;out.price=sc;out.rsi=r;out.atr=a;out.ef=ef;out.em=em;out.es=es;out.adx=adxV;

// 🛠️ محاسبه ناحیه رنج
const lookback = m5.slice(-50);
out.rangeHigh = Math.max(...lookback.map(c => c.high));
out.rangeLow = Math.min(...lookback.map(c => c.low));

const add=(k,label,ok,txt,viz)=>{out.checks.push({k,label,ok:!!ok,txt,viz});out.total++;if(ok)out.pass++};

if (S.mode === "range") {
    const RA=rangeAnalyze(m5,h1,S,{rA,aA,smaA,stdA,adxA,dg});
    out.dir=RA.dir;out.rangeHigh=RA.rh;out.rangeLow=RA.rl;out.slEst=RA.risk;out.tp=RA.tp;out.tp2=RA.tp2;out.rr=+RA.rr.toFixed(2);
    RA.checks.forEach(c=>add(c.k,c.label,c.ok,c.txt,c.viz));
    // نمایش بصری محدوده رنج (فقط نمایشی؛ در شمارش پاس/کل نمی‌آید)
    out.checks.push({k:"range",label:"محدوده رنج",ok:true,txt:`سقف: ${RA.rh.toFixed(dg)} | کف: ${RA.rl.toFixed(dg)} | TP: ${RA.tp.toFixed(dg)}`,viz:{t:"range",price:sc,low:RA.rl,high:RA.rh}});
} else {
    if(S.trend !== false) add("trend",`قیمت ${L?"بالای":"پایین"} EMA${S.es} و شیب EMA`,(L?sc>es:sc<es)&&sl,((sc-es)/a>=0?"+":"")+((sc-es)/a).toFixed(1)+"×ATR",{t:"dist",v:(sc-es)/a});
    const pat=m5.slice(-4).reverse(),pl=checkPattern(pat,"LONG",S.minRatio),ps=checkPattern(pat,"SHORT",S.minRatio),nc=ef!==em&&efp!==emp&&((ef>em&&efp>emp)||(ef<em&&efp<emp)),pp=L?pl:ps;
    if(S.emax !== false) add("emax",`EMA${S.ef} ${L?"بالای":"پایین"} EMA${S.em}`,L?ef>em:ef<em,((ef-em)/a>=0?"+":"")+((ef-em)/a).toFixed(2)+"×ATR",{t:"dist",v:(ef-em)/a});
    if(S.nc !== false) add("nc","هم‌جهتی دو کندل اخیر",nc,nc?"بله":"خیر");
    if(S.pat !== false) add("pat","الگوی ۳+۱",pp.ok,"نسبت "+pp.ratio.toFixed(2)+" از "+S.minRatio,{t:"pat",c:pat.slice().reverse().map(c=>({o:c.open,h:c.high,l:c.low,c:c.close})),ratio:pp.ratio,th:S.minRatio,ok:pp.ok});
    if(S.adx !== false) add("adx",`ADX > ${S.adxMin} (روند)`,adxV > S.adxMin,adxV.toFixed(1),{t:"dist",v:(adxV-25)/25});
    if(S.rsi){const rsiOk=L?r<S.rsiL:r>S.rsiS;add("rsi","فیلتر RSI",rsiOk,r.toFixed(1),{t:"dist",v:(r-50)/50});}
    out.slEst=(b.high-b.low)*2;
}
return out}

if(typeof module!=="undefined")module.exports={explain,dropForming,marks,divExit,lci,evaluate,ema,rsi,atr,resample,checkPattern,DEF};
