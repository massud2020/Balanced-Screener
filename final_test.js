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

// تنظیمات بهینه‌شده: ATR 3.0
const opts = {
    h1: true, m15: true, adx: true, pa: true, nc: true, trend: true, emax: true,
    slAtr: 3.0,
    spreadPips: 1.5, commissionPips: 0.5, slippagePips: 0
};

console.log("=== تست نهایی با ATR 3.0 ===");

console.log("\n--- استراتژی Trend ---");
const tradesTrend = Backtest.runBacktestOnSymbol('EURUSD', m5, m15, h1, { ...opts, mode: 'pattern' });
const statsTrend = Backtest.calculateStats(tradesTrend);
console.log("تعداد معاملات:", statsTrend.total);
console.log("وین‌ریت:", statsTrend.winRate + "%");
console.log("پروفیت فاکتور:", statsTrend.pf);
console.log("مجموع R:", statsTrend.netR);

console.log("\n--- استراتژی Range ---");
const tradesRange = Backtest.runBacktestOnSymbol('EURUSD', m5, m15, h1, { ...opts, mode: 'range' });
const statsRange = Backtest.calculateStats(tradesRange);
console.log("تعداد معاملات:", statsRange.total);
console.log("وین‌ریت:", statsRange.winRate + "%");
console.log("پروفیت فاکتور:", statsRange.pf);
console.log("مجموع R:", statsRange.netR);

console.log("\n--- پرتفوی ترکیبی (Trend + Range) ---");
const allTrades = tradesTrend.concat(tradesRange).sort((a, b) => a.closeTime - b.closeTime);
const statsAll = Backtest.calculateStats(allTrades);
console.log("تعداد کل معاملات:", statsAll.total);
console.log("وین‌ریت کل:", statsAll.winRate + "%");
console.log("پروفیت فاکتور کل:", statsAll.pf);
console.log("مجموع R کل:", statsAll.netR);
