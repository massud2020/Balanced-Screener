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

const opts = {
    h1: true, m15: true, adx: true, pa: true, nc: true, trend: true, emax: true,
    spreadPips: 1.5, commissionPips: 0.5, slippagePips: 0
};

console.log("--- بررسی ۱۰ معامله اول Trend ---");
const tradesTrend = Backtest.runBacktestOnSymbol('EURUSD', m5, m15, h1, { ...opts, mode: 'pattern' });
const sample = tradesTrend.slice(0, 10);

sample.forEach((t, i) => {
    console.log(`\nمعامله ${i + 1}:`);
    console.log(`نوع: ${t.side} | ورود: ${t.entry.toFixed(5)} | SL: ${t.sl.toFixed(5)}`);
    console.log(`TP1: ${t.tp1.toFixed(5)} | TP2: ${t.tp2.toFixed(5)}`);
    console.log(`دلیل خروج: ${t.why} | قیمت خروج: ${t.exit ? t.exit.toFixed(5) : 'نامشخص'}`);
    console.log(`نتیجه: ${t.R} R`);
});
