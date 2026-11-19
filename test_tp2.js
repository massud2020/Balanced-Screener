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

const opts = {
    h1: true, m15: true, adx: true, pa: true, nc: true, trend: true, emax: true,
    slAtr: 3.0, spreadPips: 1.5, commissionPips: 0.5, slippagePips: 0
};

function runBacktest(tp2Multiplier) {
    const trades = [];
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
            bars: futureCandles, startTime: decisionTime, maxHoldSec: 12 * 3600,
            now: futureCandles[futureCandles.length - 1].time,
            tp2R: tp2Multiplier
        });

        if (state.status === 'closed') {
            const pipSize = 0.0001;
            const costR = (2.0 * pipSize) / riskDist; // 2 pips cost
            const netR = state.R - costR;
            trades.push({ R: netR, ...state });
        }
    }
    return trades;
}

function calcStats(trades) {
    if (!trades.length) return { total: 0, winRate: 0, pf: 0, netR: 0 };
    let wins = 0, losses = 0, netR = 0, gp = 0, gl = 0;
    trades.forEach(t => {
        netR += t.R;
        if (t.R > 0) { wins++; gp += t.R; }
        else if (t.R < 0) { losses++; gl += Math.abs(t.R); }
    });
    const total = trades.length;
    const winRate = (wins / total) * 100;
    const pf = gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0);
    return { total, winRate: winRate.toFixed(1), pf: pf.toFixed(2), netR: netR.toFixed(2) };
}

console.log("--- تست مقادیر مختلف TP2 (با ATR 3.0 و هزینه ۲ پیپ) ---");
console.log("TP2 (R) | تعداد معاملات | وین‌ریت | پروفیت فاکتور | مجموع R");
console.log("---------------------------------------------------------");

const tp2Values = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
for (let tp2 of tp2Values) {
    const trades = runBacktest(tp2);
    const stats = calcStats(trades);
    console.log(`${tp2.toFixed(1).padEnd(7)} | ${stats.total.toString().padEnd(12)} | ${stats.winRate.toString().padEnd(7)}% | ${stats.pf.toString().padEnd(13)} | ${stats.netR}`);
}
