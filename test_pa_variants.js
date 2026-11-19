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

// تابع بررسی PA های مختلف
function checkCustomPA(candles, side, type) {
    if (type === 'none') return true;
    if (!candles || candles.length < 4) return false;
    
    const last = candles[candles.length - 1];     // کندل چهارم (شکست)
    const prev = candles[candles.length - 2];     // کندل سوم (آخرین کندل اصلاح)
    const first = candles[candles.length - 4];    // کندل اول (شروع اصلاح)

    if (side === 'LONG') {
        if (type === 'bos') {
            // شکست ساختار: Close کندل چهارم بالاتر از سقف کندل اول باشد
            return last.close > first.high;
        }
        if (type === 'pinbar_c3') {
            // سایه پایینی بلند در کندل سوم (اصلاح)
            const body = Math.abs(prev.close - prev.open);
            const lowerShadow = Math.min(prev.open, prev.close) - prev.low;
            const totalRange = prev.high - prev.low;
            return lowerShadow >= totalRange * 0.5 && body <= totalRange * 0.4;
        }
    } else {
        if (type === 'bos') {
            return last.close < first.low;
        }
        if (type === 'pinbar_c3') {
            const body = Math.abs(prev.close - prev.open);
            const upperShadow = prev.high - Math.max(prev.open, prev.close);
            const totalRange = prev.high - prev.low;
            return upperShadow >= totalRange * 0.5 && body <= totalRange * 0.4;
        }
    }
    return false;
}

const paTypes = ['none', 'bos', 'pinbar_c3'];
const opts = {
    mode: 'pattern',
    h1: true, m15: true, adx: true, adxMin: 25, pa: false, nc: false, trend: true, emax: true, // pa=false تا خودمان چک کنیم
    sessionFilter: true, slAtr: 2.5, 
    spreadPips: 0.1, commissionPips: 0.5, slippagePips: 0
};

console.log("=== تست انواع مختلف پرایس‌اکشن (PA) در استراتژی Trend ===");
console.log("نوع PA | تعداد معاملات | وین‌ریت | R خام | R خالص");
console.log("---------------------------------------------------");

for (let paType of paTypes) {
    let totalTrades = 0, grossR = 0, netR = 0, wins = 0;

    for (let i = 200; i < m5.length - 1; i++) {
        const currentM5 = m5.slice(0, i + 1);
        const decisionTime = currentM5[i].time;
        
        const currentM15 = m15.filter(c => c.time <= decisionTime);
        const currentH1 = h1.filter(c => c.time <= decisionTime);
        
        const result = Engine.evaluate('EURUSD', currentM5, currentM15, currentH1, opts, decisionTime);
        
        // حداقل امتیاز 70 چون فیلتر PA از موتور حذف شده است
        if (!result.side || result.scorePercent < 70) continue;

        // اعمال فیلتر PA سفارشی
        if (!checkCustomPA(currentM5, result.side, paType)) continue;

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
            
            const costR = 0.00006 / riskDist; 
            const tradeNetR = state.R - costR;
            netR += tradeNetR;

            if (tradeNetR > 0) wins++;
        }
    }

    const winRate = (wins / (totalTrades || 1)) * 100;
    console.log(`${paType.padEnd(10)} | ${totalTrades.toString().padEnd(12)} | ${winRate.toFixed(1).padEnd(7)}% | ${grossR.toFixed(2).padEnd(6)} | ${netR.toFixed(2)}`);
}
