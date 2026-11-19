const fs = require('fs');
const Backtest = require('./btengine.js');

function loadCsv(filename) {
    if (!fs.existsSync(filename)) return [];
    const lines = fs.readFileSync(filename, 'utf8').split('\n').filter(l => l.trim() !== '');
    return lines.map(line => {
        const parts = line.split(',');
        const dtStr = parts[0].replace(/\./g, '-').replace(' ', 'T') + 'Z';
        return { time: new Date(dtStr).getTime() / 1000, open: +parts[1], high: +parts[2], low: +parts[3], close: +parts[4] };
    });
}

const m5 = loadCsv('EURUSD_M5.csv');
const m15 = loadCsv('EURUSD_M15.csv');
const h1 = loadCsv('EURUSD_H1.csv');

const slAtrValues = [2.0, 2.5, 3.0];
const tp2Values = [2.0, 2.5, 3.0, 4.0];

console.log("=== بهینه‌سازی نهایی M5 (با فیلتر سشن + اسپرد ۱ پیپ) ===");
console.log("SL ATR | TP2 (R) | تعداد معاملات | وین‌ریت | پروفیت فاکتور | مجموع R");
console.log("--------------------------------------------------------------------");

for (let sl of slAtrValues) {
    for (let tp of tp2Values) {
        // فعال‌سازی sessionFilter برای معامله فقط در ساعات لندن و نیویورک
        const opts = {
            h1: true, m15: true, adx: true, pa: true, nc: true, trend: true, emax: true,
            sessionFilter: true, 
            slAtr: sl, 
            spreadPips: 0.5, commissionPips: 0.5, slippagePips: 0 // مجموعا ۱ پیپ هزینه
        };
        
        // اجرای بک‌تست
        const trades = Backtest.runBacktestOnSymbol('EURUSD', m5, m15, h1, { ...opts, mode: 'pattern', tp2R: tp });
        const stats = Backtest.calculateStats(trades);
        
        console.log(`${sl.toFixed(1).padEnd(6)} | ${tp.toFixed(1).padEnd(7)} | ${stats.total.toString().padEnd(12)} | ${stats.winRate.toString().padEnd(7)}% | ${stats.pf.toString().padEnd(13)} | ${stats.netR}`);
    }
}
