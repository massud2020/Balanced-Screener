const fs = require('fs');
const Engine = require('./engine.js');
const TradePolicy = require('./trade-policy.js');

function loadCsv(filename) {
    if (!fs.existsSync(filename)) return [];
    const lines = fs.readFileSync(filename, 'utf8').split('\n').filter(l => l.trim() !== '');
    return lines.map(line => {
        const parts = line.split(',');
        const dtStr = parts[0].replace(/\./g, '-').replace(' ', 'T') + 'Z';
        return { time: new Date(dtStr).getTime() / 1000, open: +parts[1], high: +parts[2], low: +parts[3], close: +parts[4] };
    });
}

// این بار از داده‌های M15 به عنوان تایم‌فریم اصلی استفاده می‌کنیم
const m15 = loadCsv('EURUSD_M15.csv');
const h1 = loadCsv('EURUSD_H1.csv');

const opts = {
    mode: 'range',
    h1: true, m15: false, adx: true, adxMin: 25,
    rsiL: 38, rsiS: 62, // تنظیمات پیش‌فرض رنج
    slAtr: 1.5, 
    spreadPips: 0.5, commissionPips: 0.5, slippagePips: 0
};

let totalTrades = 0, grossR = 0, netR = 0, wins = 0;

// حرکت روی کندل‌های M15
for (let i = 200; i < m15.length - 1; i++) {
    const currentM15 = m15.slice(0, i + 1);
    const decisionTime = currentM15[i].time;
    
    const currentH1 = h1.filter(c => c.time <= decisionTime);
    
    // ارزیابی سیگنال بر اساس M15
    const result = Engine.evaluate('EURUSD', currentM15, [], currentH1, opts, decisionTime);
    if (!result.side) continue;

    const executionEntry = Number(m15[i + 1].open);
    const riskDist = Math.abs(result.entry - result.sl);
    if (!(riskDist > 0)) continue;
    
    const direction = result.side === "LONG" ? 1 : -1;
    const executionSl = executionEntry - direction * riskDist;
    const futureCandles = m15.slice(i + 1, i + 501);
    if (!futureCandles.length) break;

    const state = TradePolicy.resolveTrade({
        side: result.side, entry: executionEntry, sl: executionSl, mode: 'range', 
        bars: futureCandles, startTime: decisionTime, maxHoldSec: 48 * 3600 // ۴۸ ساعت برای M15
    });

    if (state.status === 'closed') {
        totalTrades++;
        grossR += state.R;
        
        // محاسبه هزینه: در M15 حد ضرر بزرگتر است، پس هزینه ۱ پیپ نسبت به آن کوچکتر می‌شود
        const costR = 0.0001 / riskDist; 
        const tradeNetR = state.R - costR;
        netR += tradeNetR;

        if (tradeNetR > 0) wins++;
    }
}

const winRate = (wins / (totalTrades || 1)) * 100;

console.log("=== تست استراتژی Range روی تایم‌فریم M15 ===");
console.log("تعداد کل معاملات:", totalTrades);
console.log("وین‌ریت:", winRate.toFixed(1) + "%");
console.log("مجموع R خام (بدون هزینه):", grossR.toFixed(2));
console.log("مجموع R خالص (با هزینه):", netR.toFixed(2));
console.log("میانگین R در هر معامله:", (netR / (totalTrades || 1)).toFixed(3));
