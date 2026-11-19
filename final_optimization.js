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

const scenarios = [
    { score: 70, cost: 0.00006 }, // هزینه 0.6 پیپ
    { score: 80, cost: 0.00006 },
    { score: 90, cost: 0.00006 },
    { score: 80, cost: 0.00004 }, // هزینه 0.4 پیپ (بروکر بهتر)
    { score: 90, cost: 0.00004 }
];

console.log("=== بهینه‌سازی نهایی (امتیاز و هزینه) ===");
console.log("Min Score | Cost (Pips) | تعداد معاملات | وین‌ریت | R خام | R خالص");
console.log("-------------------------------------------------------------------");

for (let sc of scenarios) {
    const opts = {
        mode: 'pattern', h1: true, m15: true, adx: true, adxMin: 25, pa: true, nc: true, trend: true, emax: true,
        sessionFilter: true, slAtr: 2.5
    };

    let totalTrades = 0, grossR = 0, netR = 0, wins = 0;

    for (let i = 200; i < m5.length - 1; i++) {
        const currentM5 = m5.slice(0, i + 1);
        const decisionTime = currentM5[i].time;
        
        const currentM15 = m15.filter(c => c.time <= decisionTime);
        const currentH1 = h1.filter(c => c.time <= decisionTime);
        
        const result = Engine.evaluate('EURUSD', currentM5, currentM15, currentH1, opts, decisionTime);
        if (!result.side || result.scorePercent < sc.score) continue;

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
            
            const costR = sc.cost / riskDist; 
            const tradeNetR = state.R - costR;
            netR += tradeNetR;

            if (tradeNetR > 0) wins++;
        }
    }

    const winRate = (wins / (totalTrades || 1)) * 100;
    const costPips = (sc.cost * 10000).toFixed(1);
    console.log(`${sc.score.toString().padEnd(9)} | ${costPips.padEnd(11)} | ${totalTrades.toString().padEnd(12)} | ${winRate.toFixed(1).padEnd(7)}% | ${grossR.toFixed(2).padEnd(6)} | ${netR.toFixed(2)}`);
}
