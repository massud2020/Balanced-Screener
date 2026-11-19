const fs = require('fs');
let code = fs.readFileSync('engine.js', 'utf8');

const oldLogic = `const isOk = (cl[idx].close > cl[idx].open) === (cl[idx-1].close > cl[idx-1].open);
                checks.push({ l: "بدون تقاطع (هم‌جهتی کندل‌ها)", ok: isOk, v: isOk ? 'تایید' : 'رد', w: 0.5 });
                if (!isOk && !failReason) failReason = "تقاطع کندل‌ها";`;

const newLogic = `let isOk = true; 
                for (let k = 0; k < 5; k++) { 
                    if (checkedSide === 'LONG' && ema21[idx - k] <= ema50[idx - k]) isOk = false; 
                    if (checkedSide === 'SHORT' && ema21[idx - k] >= ema50[idx - k]) isOk = false; 
                }
                checks.push({ l: "بدون تقاطع EMA21/50 (۵ کندل اخیر)", ok: isOk, v: isOk ? 'تایید' : 'رد', w: 0.5 });
                if (!isOk && !failReason) failReason = "تقاطع اخیر EMA21/50";`;

if (code.includes(oldLogic)) {
    code = code.replace(oldLogic, newLogic);
    fs.writeFileSync('engine.js', code);
    console.log("✅ شرط NC با موفقیت به بررسی تقاطع EMA21/50 تغییر یافت.");
} else {
    console.log("❌ الگوی کد پیدا نشد. ممکن است قبلاً تغییر کرده باشد.");
}
