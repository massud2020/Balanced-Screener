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
const opts = { h1: false, m15: false, adx: false, pa: false, nc: false, trend: false, emax: false };

for (let i = 200; i < m5.length; i++) {
    const currentM5 = m5.slice(0, i + 1);
    const decisionTime = currentM5[i].time;
    const result = Engine.evaluate('EURUSD', currentM5, [], [], { ...opts, mode: 'pattern' }, decisionTime);
    
    if (!result.side) continue;
    
    console.log(`\n--- اولین سیگنال در کندل شماره ${i} پیدا شد ---`);
    console.log(`نوع سیگنال: ${result.side}`);
    console.log(`قیمت بسته شدن (Entry): ${result.entry}`);
    console.log(`حد ضرر (SL): ${result.sl}`);
    
    const executionEntry = Number(m5[i].open);
    const riskDist = Math.abs(result.entry - result.sl);
    const direction = result.side === 'LONG' ? 1 : -1;
    const executionSl = executionEntry - direction * riskDist;
    
    const futureCandles = m5.slice(i, i + 500);
    
    const state = TradePolicy.resolveTrade({
        side: result.side, entry: executionEntry, sl: executionSl, mode: 'pattern', 
        bars: futureCandles,
        startTime: decisionTime, maxHoldSec: 6 * 3600,
        now: futureCandles.length ? futureCandles[futureCandles.length - 1].time : decisionTime
    });
    
    console.log(`وضعیت معامله: ${state.status}`);
    console.log(`دلیل بسته شدن: ${state.why}`);
    console.log(`سود/ضرر (R): ${state.R}`);
    
    break; // فقط اولین سیگنال را بررسی می‌کند
}
