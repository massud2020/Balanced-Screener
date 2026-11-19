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

const symbols = ['BTC', 'ETH'];

// تنظیمات بهینه (حذف PA، تایید NC، بدون فیلتر تایم بالاتر و بدون سشن)
const opts = {
    mode: 'pattern', h1: false, m15: false, adx: true, adxMin: 25, 
    pa: false, nc: true, trend: true, emax: true, 
    sessionFilter: false, 
    slAtr: 2.5
};

console.log("=== تست ۲ ساله استراتژی Trend روی کریپتو (تایم‌فریم M5) ===");
console.log("Symbol | تعداد معاملات | وین‌ریت | R خام | R خالص");
console.log("-----------------------------------------------------------------");

for (let sym of symbols) {
    const m5 = loadCsv(`${sym}_M5_LONG.csv`);
    if (m5.length === 0) continue;

    let totalTrades = 0, grossR = 0, netR = 0, wins = 0;

    for (let i = 200; i < m5.length - 1; i++) {
        const currentM5 = m5.slice(0, i + 1);
        const decisionTime = currentM5[i].time;
        
        const result = Engine.evaluate(sym + 'USDT', currentM5, [], [], opts, decisionTime);
        if (!result.side || result.scorePercent < 90) continue;

        const executionEntry = Number(m5[i + 1].open);
        const riskDist = Math.abs(result.entry - result.sl);
        if (!(riskDist > 0)) continue;
        
        const direction = result.side === "LONG" ? 1 : -1;
        const executionSl = executionEntry - direction * riskDist;
        const futureCandles = m5.slice(i + 1, i + 500);
        if (!futureCandles.length) break;

        const state = TradePolicy.resolveTrade({
            side: result.side, entry: executionEntry, sl: executionSl, mode: 'pattern', 
            bars: futureCandles, startTime: decisionTime, maxHoldSec: 24 * 3600
        });

        if (state.status === 'closed') {
            totalTrades++;
            grossR += state.R;
            
            // هزینه برای کریپتو (حدود 0.1% کارمزد رفت و برگشت = 0.001)
            // در R: هزینه = 0.001 / (riskDist / entry)
            const costR = (0.001 * executionEntry) / riskDist; 
            const tradeNetR = state.R - costR;
            netR += tradeNetR;

            if (tradeNetR > 0) wins++;
        }
    }

    const winRate = (wins / (totalTrades || 1)) * 100;
    console.log(`${sym.padEnd(6)} | ${totalTrades.toString().padEnd(12)} | ${winRate.toFixed(1).padEnd(7)}% | ${grossR.toFixed(2).padEnd(6)} | ${netR.toFixed(2)}`);
}
