const fs = require('fs');
const Backtest = require('./btengine.js');

function loadCsv(filename) {
    if (!fs.existsSync(filename)) return [];
    const lines = fs.readFileSync(filename, 'utf8').split('\n').filter(l => l.trim() !== '');
    return lines.map(line => {
        const parts = line.split(',');
        const dtStr = parts[0].replace(/\./g, '-').replace(' ', 'T') + 'Z';
        const time = new Date(dtStr).getTime() / 1000;
        return { time: time, open: +parts[1], high: +parts[2], low: +parts[3], close: +parts[4] };
    });
}

const m5 = loadCsv('EURUSD_M5.csv');
const m15 = loadCsv('EURUSD_M15.csv');
const h1 = loadCsv('EURUSD_H1.csv');

// حالا تمام فیلترها روشن هستند و اسپرد و کمیسیون هم اعمال می‌شود
const opts = {
    h1: true, m15: true, adx: true, pa: true, nc: true, trend: true, emax: true,
    spreadPips: 1.5, commissionPips: 0.5, slippagePips: 0 // 2 پیپ هزینه کل
};

console.log("--- اجرای بک‌تست Trend (با تمام فیلترها + هزینه معامله) ---");
const tradesTrend = Backtest.runBacktestOnSymbol('EURUSD', m5, m15, h1, { ...opts, mode: 'pattern' });
const statsTrend = Backtest.calculateStats(tradesTrend);
console.log("تعداد معاملات:", statsTrend.total);
console.log("وین‌ریت:", statsTrend.winRate + "%");
console.log("پروفیت فاکتور:", statsTrend.pf);
console.log("مجموع R:", statsTrend.netR);
console.log("حداکثر افت سرمایه (Max DD):", statsTrend.maxDD + " R");

console.log("\n--- اجرای بک‌تست Range (با تمام فیلترها + هزینه معامله) ---");
const tradesRange = Backtest.runBacktestOnSymbol('EURUSD', m5, m15, h1, { ...opts, mode: 'range' });
const statsRange = Backtest.calculateStats(tradesRange);
console.log("تعداد معاملات:", statsRange.total);
console.log("وین‌ریت:", statsRange.winRate + "%");
console.log("پروفیت فاکتور:", statsRange.pf);
console.log("مجموع R:", statsRange.netR);
