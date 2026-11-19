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

const m5 = loadCsv('GOLD_M5.csv');
const m15 = loadCsv('GOLD_M15.csv');
const h1 = loadCsv('GOLD_H1.csv');

const sessions = [
    { name: 'همه ساعات (بدون فیلتر)', start: 0, end: 24 },
    { name: 'فقط آسیا (00:00-07:00 UTC)', start: 0, end: 7 },
    { name: 'فقط لندن (07:00-16:00 UTC)', start: 7, end: 16 },
    { name: 'فقط نیویورک (12:00-21:00 UTC)', start: 12, end: 21 },
    { name: 'همپوشانی لندن/نیویورک (12:00-16:00)', start: 12, end: 16 },
    { name: 'ساعات فعال (07:00-21:00 UTC)', start: 7, end: 21 }
];

const opts = {
    mode: 'pattern', h1: true, m15: true, adx: true, adxMin: 25, 
    pa: false, nc: true, trend: true, emax: true, sessionFilter: false, slAtr: 2.5
};

console.log("=== تست فیلتر ساعات معاملاتی روی طلا (Score > 90, SL 2.5) ===");
console.log("سشن معاملاتی | تعداد معاملات | وین‌ریت | R خام | R خالص");
console.log("--------------------------------------------------------------------");

for (let sess of sessions) {
    let totalTrades = 0, grossR = 0, netR = 0, wins = 0;

    for (let i = 200; i < m5.length - 1; i++) {
        const currentM5 = m5.slice(0, i + 1);
        const decisionTime = currentM5[i].time;
        
        const hourUtc = new Date(decisionTime * 1000).getUTCHours();
        
        if (hourUtc < sess.start || hourUtc >= sess.end) continue;

        const currentM15 = m15.filter(c => c.time <= decisionTime);
        const currentH1 = h1.filter(c => c.time <= decisionTime);
        
        const result = Engine.evaluate('GOLD', currentM5, currentM15, currentH1, opts, decisionTime);
        if (!result.side || result.scorePercent < 90) continue;

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
            
            const costR = 0.30 / riskDist; 
            const tradeNetR = state.R - costR;
            netR += tradeNetR;

            if (tradeNetR > 0) wins++;
        }
    }

    const winRate = (wins / (totalTrades || 1)) * 100;
    console.log(`${sess.name.padEnd(35)} | ${totalTrades.toString().padEnd(12)} | ${winRate.toFixed(1).padEnd(7)}% | ${grossR.toFixed(2).padEnd(6)} | ${netR.toFixed(2)}`);
}
