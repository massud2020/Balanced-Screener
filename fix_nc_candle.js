const fs = require('fs');
let code = fs.readFileSync('engine.js', 'utf8');

const oldLogic = `let isOk = true; 
                for (let k = 0; k < 5; k++) { 
                    if (checkedSide === 'LONG' && ema21[idx - k] <= ema50[idx - k]) isOk = false; 
                    if (checkedSide === 'SHORT' && ema21[idx - k] >= ema50[idx - k]) isOk = false; 
                }
                checks.push({ l: "بدون تقاطع EMA21/50 (۵ کندل اخیر)", ok: isOk, v: isOk ? 'تایید' : 'رد', w: 0.5 });
                if (!isOk && !failReason) failReason = "تقاطع اخیر EMA21/50";`;

const newLogic = `let isOk = true; 
                if (checkedSide === 'LONG' && ema21[idx] <= ema50[idx]) isOk = false; 
                if (checkedSide === 'SHORT' && ema21[idx] >= ema50[idx]) isOk = false; 
                checks.push({ l: "بدون تقاطع EMA21/50 (لحظه سیگنال)", ok: isOk, v: isOk ? 'تایید' : 'رد', w: 0.5 });
                if (!isOk && !failReason) failReason = "تقاطع EMA21/50";`;

if (code.includes(oldLogic)) {
    code = code.replace(oldLogic, newLogic);
    fs.writeFileSync('engine.js', code);
    console.log("✅ شرط NC با موفقیت به بررسی فقط در کندل لحظه سیگنال تغییر یافت.");
} else {
    console.log("❌ الگوی کد پیدا نشد. ممکن است قبلاً تغییر کرده باشد.");
}
