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

const baseOpts = {
    h1: true, m15: true, adx: true, pa: true, nc: true, trend: true, emax: true,
    spreadPips: 1.5, commissionPips: 0.5, slippagePips: 0
};

console.log("--- شروع بهینه‌سازی حد ضرر (ATR Multiplier) برای Trend ---");
console.log("ضریب ATR | تعداد معاملات | وین‌ریت | پروفیت فاکتور | مجموع R");

const atrMultipliers = [1.5, 2.0, 2.5, 3.0, 3.5];

for (let mult of atrMultipliers) {
    // ما ضریب ATR را به موتور پاس می‌دهیم
    const opts = { ...baseOpts, slAtr: mult };
    const trades = Backtest.runBacktestOnSymbol('EURUSD', m5, m15, h1, { ...opts, mode: 'pattern' });
    const stats = Backtest.calculateStats(trades);
    
    console.log(`${mult.toString().padEnd(8)} | ${stats.total.toString().padEnd(12)} | ${stats.winRate.toString().padEnd(7)}% | ${stats.pf.toString().padEnd(13)} | ${stats.netR}`);
}
