// Price alerts engine - shared by the app (browser) and scan.js (GitHub Action).
// alert: {id,sym,type:"above"|"below"|"time",price,at:["09:00"],from:"08:00",to:"22:00",days:[0..6],repeat:"once"|"cool",cool:60,on:true,note}
// days use JS numbering in the user's timezone: 0=Sunday ... 6=Saturday. Times are local to cfg.tz.
const AL=(()=>{
const fmtCache={};
function tzParts(ts,tz){let f=fmtCache[tz];if(!f){try{f=fmtCache[tz]=new Intl.DateTimeFormat("en-GB",{timeZone:tz||"UTC",weekday:"short",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})}catch(e){f=fmtCache[tz]=new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",weekday:"short",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})}}
const o={};for(const p of f.formatToParts(new Date(ts*1000)))o[p.type]=p.value;
const dow={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[o.weekday];const h=+o.hour%24;
return{dow,min:h*60+ +o.minute,date:`${o.year}-${o.month}-${o.day}`,hhmm:`${String(h).padStart(2,"0")}:${o.minute}`}}
const toMin=s=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(s||"").trim());return m?(+m[1])*60+(+m[2]):null};
function inWindow(a,p){if(Array.isArray(a.days)&&a.days.length&&!a.days.includes(p.dow))return false;const f=toMin(a.from),t=toMin(a.to);if(f==null||t==null||f===t)return true;return f<t?(p.min>=f&&p.min<t):(p.min>=f||p.min<t)}
function fmt(x,dg){if(x==null||!isFinite(x))return"-";const d=dg==null?(x>=1000?2:x>=1?4:6):dg;return Number(x).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d})}
// data[sym]={bars:[{time,high,low,close}] (5m, last one may still be forming), dg}
function check(list,data,now,st,tz){const out=[],p=tzParts(now,tz);st.fired=st.fired||{};st.last=st.last||{};
for(const a of list||[]){if(!a||a.on===false||!a.sym||!a.id)continue;const d=data[a.sym];if(!d||!d.bars||!d.bars.length)continue;
const bars=d.bars,cur=bars[bars.length-1].close,dg=d.dg;
if(a.type==="every"){if(!inWindow(a,p))continue;const n=Math.max(1,Math.round(a.every)||5),slot=Math.floor(now/(n*60)),key=`${a.id}|every`,prev=st.fired[key];if(prev&&Math.floor(prev/(n*60))===slot)continue;
st.price=st.price||{};const pr=st.price[a.id],chg=pr>0?(cur-pr)/pr*100:null;st.fired[key]=now;st.price[a.id]=cur;
out.push({a,key,kind:"every",price:cur,title:`⏱ ${a.sym}: ${fmt(cur,dg)}`,text:`قیمت ${a.sym}${chg==null?"":`\nتغییر از گزارش قبلی: ${chg>=0?"+":""}${chg.toFixed(2)}%`}\nگزارش هر ${n} دقیقه · ${p.hhmm}${a.note?"\n"+a.note:""}`});continue}
if(a.type==="time"){if(Array.isArray(a.days)&&a.days.length&&!a.days.includes(p.dow))continue;
for(const t of a.at||[]){const tm=toMin(t);if(tm==null)continue;const key=`${a.id}|${p.date}|${t}`;if(st.fired[key])continue;
if(p.min>=tm&&p.min<tm+15){st.fired[key]=now;out.push({a,key,kind:"time",price:cur,title:`🕘 قیمت ${a.sym}`,text:`ساعت ${t}: ${fmt(cur,dg)}${a.note?"\n"+a.note:""}`})}}continue}
if(a.type!=="above"&&a.type!=="below")continue;if(!(a.price>0))continue;if(!inWindow(a,p))continue;
const since=Math.max(st.last[a.sym]||0,now-1800),rel=bars.filter(b=>b.time+300>since),use=rel.length?rel:[bars[bars.length-1]];
let hi=-Infinity,lo=Infinity;for(const b of use){if(b.high>hi)hi=b.high;if(b.low<lo)lo=b.low}
const hit=a.type==="above"?hi>=a.price:lo<=a.price;if(!hit)continue;
const key=`${a.id}|${a.type}|${a.price}`,was=st.fired[key];
if(a.repeat==="cool"){if(was&&now-was<(a.cool>0?a.cool:60)*60)continue}else if(was)continue;
st.fired[key]=now;
out.push({a,key,kind:"price",price:cur,title:`🔔 ${a.sym} ${a.type==="above"?"≥":"≤"} ${fmt(a.price,dg)}`,text:`قیمت ${a.type==="above"?"به این سطح رسید یا بالاتر رفت":"به این سطح رسید یا پایین‌تر آمد"}\nقیمت فعلی: ${fmt(cur,dg)} · ${p.hhmm}${a.note?"\n"+a.note:""}`})}
for(const s in data)st.last[s]=now;
for(const k of Object.keys(st.fired)){if(k.split("|").length===3&&/^\d{4}-/.test(k.split("|")[1])&&now-st.fired[k]>3*86400)delete st.fired[k]}
return out}
// Map a typed symbol to the [id,okx,yahoo,digits,oanda,market] tuple used by symbols.js (unknown symbols are guessed).
function resolve(sym,U){const s=String(sym||"").trim().toUpperCase(),k=(U||[]).find(x=>x[0]===s);if(k)return k;
if(/^[A-Z0-9]{2,12}USDT$/.test(s)){const b=s.slice(0,-4);return[s,b+"-USDT",b+"-USD",null,0,"crypto"]}
if(/^[A-Z]{6}$/.test(s))return[s,0,s+"=X",5,s.slice(0,3)+"_"+s.slice(3),"forex"];
return[s,0,s,null,0,"stock"]}
function validate(a){if(!a||!a.sym)return"نماد را وارد کن";if(a.type==="every"){const n=+a.every;return n>=1&&n<=1440?null:"فاصله‌ی گزارش را بین ۱ تا ۱۴۴۰ دقیقه بذار"}if(a.type==="time"){if(!Array.isArray(a.at)||!a.at.length)return"حداقل یک ساعت اضافه کن";return null}
if(a.type!=="above"&&a.type!=="below")return"نوع هشدار نامعتبر است";if(!(a.price>0))return"قیمت هدف را درست وارد کن";return null}
function perDay(a){const n=Math.max(1,+a.every||5),f=toMin(a.from),t=toMin(a.to);let w=1440;if(f!=null&&t!=null&&f!==t)w=f<t?t-f:1440-f+t;return Math.floor(w/n)+(w<1440?1:0)}
return{tzParts,toMin,inWindow,fmt,check,validate,resolve,perDay}})();
if(typeof module!=="undefined")module.exports=AL;
