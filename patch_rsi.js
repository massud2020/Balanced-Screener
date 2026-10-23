const fs = require('fs');

// ۱. اصلاح engine.js (هسته اصلی و اپلیکیشن)
try {
  let e = fs.readFileSync('engine.js', 'utf8');

  // اعمال شرط RSI < 40 برای LONG و RSI > 60 برای SHORT
  e = e.replace(
    'const L=ab&&ef>em&&nc&&slope&&pl.ok,Sh=be&&ef<em&&nc&&slope&&ps.ok;',
    'const rsiL=r!=null&&r<40,rsiS=r!=null&&r>60;const L=ab&&ef>em&&nc&&slope&&pl.ok&&rsiL,Sh=be&&ef<em&&nc&&slope&&ps.ok&&rsiS;'
  );

  // اضافه کردن دلیل خطا (اگر فقط RSI مانع شده بود)
  e = e.replace(
    '!pl.ok&&!ps.ok?"الگوی ۳+۱":(L?!m15L:Sh?!m15S:!m15L&&!m15S)?"فیلتر M15":"فیلتر H1"}',
    '!pl.ok&&!ps.ok?"الگوی ۳+۱":((pl.ok&&ef>em&&!rsiL)||(ps.ok&&ef<em&&!rsiS))?"فیلتر RSI":(L?!m15L:Sh?!m15S:!m15L&&!m15S)?"فیلتر M15":"فیلتر H1"}'
  );

  // اضافه کردن تیک RSI به صفحه تحلیل (explain)
  e = e.replace(
    'out.slEst=(b.high-b.low)*2}',
    'const rsiOk=L?r<40:r>60;add("rsi","فیلتر RSI ("+(L?"زیر ۴۰":"بالای ۶۰")+")",rsiOk,r.toFixed(1),{t:"dist",v:(r-50)/50});\nout.slEst=(b.high-b.low)*2}'
  );

  fs.writeFileSync('engine.js', e);
  console.log('✅ فیلتر RSI به engine.js اضافه شد.');
} catch (err) { console.log('خطا در engine.js:', err.message); }

// ۲. اصلاح btengine.js (سیستم بک‌تست)
try {
  let b = fs.readFileSync('btengine.js', 'utf8');

  // اضافه کردن rA به ورودی‌های btSignals
  b = b.replace(
    'const{m5,S,efA,emA,esA,aA,m15,h1,mf,mm,hf,hm,hs}=P,out=[];',
    'const{m5,S,efA,emA,esA,rA,aA,m15,h1,mf,mm,hf,hm,hs}=P,out=[];'
  );

  // خواندن مقدار RSI در حلقه
  b = b.replace(
    'const b=m5[i];let L,Sh;',
    'const b=m5[i];let L,Sh;const r=rA[i];if(r==null)continue;'
  );

  // اعمال شرط RSI در بک‌تست
  b = b.replace(
    'L=ab&&ef>em&&nc&&slope&&pl.ok;Sh=be&&ef<em&&nc&&slope&&ps.ok}',
    'L=ab&&ef>em&&nc&&slope&&pl.ok&&r<40;Sh=be&&ef<em&&nc&&slope&&ps.ok&&r>60}'
  );

  fs.writeFileSync('btengine.js', b);
  console.log('✅ فیلتر RSI به btengine.js (بک‌تست) اضافه شد.');
} catch (err) { console.log('خطا در btengine.js:', err.message); }
