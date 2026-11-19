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

// سشن‌های تطبیقی
const sessionMap = {
    'EURUSD': { start: 7, end: 16 },
    'GBPUSD': { start: 7, end: 16 },
    'GOLD':   { start: 7, end: 16 },
    'AUDUSD': { start: 0, end: 7 },
    'NZDUSD': { start: 0, end: 7 },
    'USDCAD': { start: 12, end: 21 }
};

const symbols = Object.keys(sessionMap);

console.log("=== تست سیستم ترکیبی (Trend + Range) روی ۲ سال داده H1 ===");
console.log("Symbol | Trend (Trades/R) | Range (Trades/R) | Total Net R");
console.log("-----------------------------------------------------------------");

let grandTotalTrades = 0;
let grandTotalNetR = 0;

for (let sym of symbols) {
    const h1 = loadCsv(`${sym}_H1_LONG.csv`);
    if (h1.length === 0) continue;

    const sess = sessionMap[sym];
    
    // تنظیمات: بدون PA، با NC، بدون تعیین دستی mode (تا موتور خودش تصمیم بگیرد)
    const opts = {
        h1: false, m15: false, adx: true, adxMin: 25, 
        pa: false, nc: true, trend: true, emax: true, 
        sessionFilter: false, 
        slAtr: 2.5
    };

    let trendTrades = 0, trendR = 0;
    let rangeTrades = 0, rangeR = 0;

    for (let i = 200; i < h1.length - 1; i++) {
        const currentH1 = h1.slice(0, i + 1);
        const decisionTime = currentH1[i].time;
        
        // فیلتر سشن
        const hourUtc = new Date(decisionTime * 1000).getUTCHours();
        if (hourUtc < sess.start || hourUtc >= sess.end) continue;

        const result = Engine.evaluate(sym, currentH1, [], [], opts, decisionTime);
        if (!result.side || result.scorePercent < 90) continue;

        const executionEntry = Number(h1[i + 1].open);
        const riskDist = Math.abs(result.entry - result.sl);
        if (!(riskDist > 0)) continue;
        
        const direction = result.side === "LONG" ? 1 : -1;
        const executionSl = executionEntry - direction * riskDist;
        const futureCandles = h1.slice(i + 1, i + 300);
        if (!futureCandles.length) break;

        // موتور تصمیم می‌گیرد که mode چی باشد (pattern یا range)
        const actualMode = result.mode; 

        const state = TradePolicy.resolveTrade({
            side: result.side, entry: executionEntry, sl: executionSl, mode: actualMode, 
            bars: futureCandles, startTime: decisionTime, maxHoldSec: 7 * 24 * 3600
        });

        if (state.status === 'closed') {
            const costR = (sym === 'GOLD' ? 0.30 : 0.0001) / riskDist; 
            const tradeNetR = state.R - costR;

            if (actualMode === 'pattern') {
                trendTrades++;
                trendR += tradeNetR;
            } else {
                rangeTrades++;
                rangeR += tradeNetR;
            }
        }
    }

    const totalNetR = trendR + rangeR;
    grandTotalTrades += (trendTrades + rangeTrades);
    grandTotalNetR += totalNetR;

    console.log(`${sym.padEnd(6)} | ${trendTrades.toString().padEnd(3)} معامله / ${trendR.toFixed(1).padEnd(5)} R | ${rangeTrades.toString().padEnd(3)} معامله / ${rangeR.toFixed(1).padEnd(5)} R | ${totalNetR.toFixed(2)}`);
}

console.log("-----------------------------------------------------------------");
console.log(`مجموع کل: ${grandTotalTrades} معامله | سود خالص کل (Total Net R): ${grandTotalNetR.toFixed(2)}`);
