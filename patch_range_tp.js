const fs = require('fs');
let code = fs.readFileSync('trade-policy.js', 'utf8');

const oldRangeLogic = `if (mode === 'range') {
                const rangeTp = isLong ? entry + risk * 1.5 : entry - risk * 1.5;`;

const newRangeLogic = `if (mode === 'range') {
                const tpMult = opts.rangeTpMult || 1.5;
                const rangeTp = isLong ? entry + risk * tpMult : entry - risk * tpMult;`;

if (code.includes(oldRangeLogic)) {
    // اضافه کردن opts به ورودی تابع resolveTrade
    code = code.replace("function resolveTrade({ side, entry, sl, mode, bars, startTime, maxHoldSec }) {", 
                        "function resolveTrade({ side, entry, sl, mode, bars, startTime, maxHoldSec, opts = {} }) {");
    code = code.replace(oldRangeLogic, newRangeLogic);
    fs.writeFileSync('trade-policy.js', code);
    console.log("✅ سیاست خروج رنج برای پذیرش TP داینامیک آپدیت شد.");
} else {
    console.log("❌ الگوی کد پیدا نشد.");
}
