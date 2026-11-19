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

const m5 = loadCsv('EURUSD_M5.csv');
const m15 = loadCsv('EURUSD_M15.csv');
const h1 = loadCsv('EURUSD_H1.csv');

// بهترین تنظیمات: SL 2.5 ATR + Trailing 0.5 + RSI Div + فیلتر سشن
const opts = {
    h1: true, m15: true, adx: true, pa: true, nc: true, trend: true, emax: true,
    sessionFilter: true, slAtr: 2.5, spreadPips: 0.5, commissionPips: 0.5, slippagePips: 0
};

let totalTrades = 0;
let grossR = 0;
let netR = 0;
let wins = 0;
let losses = 0;

for (let i = 200; i < m5.length - 1; i++) {
    const currentM5 = m5.slice(0, i + 1);
    const decisionTime = currentM5[i].time;
    
    const currentM15 = m15.filter(c => c.time <= decisionTime);
    const currentH1 = h1.filter(c => c.time <= decisionTime);
    
    const result = Engine.evaluate('EURUSD', currentM5, currentM15, currentH1, opts, decisionTime);
    if (!result.side) continue;

    const executionEntry = Number(m5[i + 1].open);
    const riskDist = Math.abs(result.entry - result.sl);
    if (!(riskDist > 0)) continue;
    
    const direction = result.side === "LONG" ? 1 : -1;
    const executionSl = executionEntry - direction * riskDist;
    const futureCandles = m5.slice(i + 1, i + 501);
    if (!futureCandles.length) break;

    const state = TradePolicy.resolveTrade({
        side: result.side, entry: executionEntry, sl: executionSl, mode: 'pattern', 
        bars: futureCandles, startTime: decisionTime, maxHoldSec: 24 * 3600
    });

    if (state.status === 'closed') {
        totalTrades++;
        grossR += state.R;
        
        // هزینه کل: ۱ پیپ (0.0001). هزینه به R = 0.0001 / riskDist
        const costR = 0.0001 / riskDist; 
        const tradeNetR = state.R - costR;
        netR += tradeNetR;

        if (tradeNetR > 0) wins++;
        else losses++;
    }
}

const winRate = (wins / totalTrades) * 100;

console.log("=== نتیجه نهایی با بهترین تنظیمات ===");
console.log("تعداد کل معاملات:", totalTrades);
console.log("وین‌ریت (با احتساب هزینه):", winRate.toFixed(1) + "%");
console.log("مجموع R خام (بدون هزینه):", grossR.toFixed(2));
console.log("مجموع R خالص (با هزینه ۱ پیپ):", netR.toFixed(2));
console.log("میانگین R در هر معامله:", (netR / totalTrades).toFixed(3));
