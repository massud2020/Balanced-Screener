const fs = require('fs');
const Engine = require('./engine.js');
const TradePolicy = require('./trade-policy.js');

async function downloadData() {
    console.log("در حال دانلود داده‌های واقعی طلا (GC=F) از یاهو فایننس...");
    const symbol = 'GC=F'; // نماد طلا در یاهو
    const intervals = [{ iv: '5m', name: 'M5' }, { iv: '15m', name: 'M15' }, { iv: '60m', name: 'H1' }];
    
    for (let item of intervals) {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${item.iv}&range=60d`;
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const json = await res.json();
            const q = json.chart.result[0].indicators.quote[0];
            const ts = json.chart.result[0].timestamp;
            let lines = [];
            for (let i = 0; i < ts.length; i++) {
                if (q.open[i] === null || q.close[i] === null) continue;
                const dtStr = new Date(ts[i] * 1000).toISOString().replace('T', ' ').slice(0, 19);
                lines.push(`${dtStr},${q.open[i].toFixed(2)},${q.high[i].toFixed(2)},${q.low[i].toFixed(2)},${q.close[i].toFixed(2)}`);
            }
            fs.writeFileSync(`GOLD_${item.name}.csv`, lines.join('\n'));
            console.log(`✅ GOLD_${item.name}.csv دانلود شد (${lines.length} کندل)`);
        } catch (e) {
            console.error(`❌ خطا در دانلود ${item.iv}:`, e.message);
        }
    }
}

function loadCsv(filename) {
    if (!fs.existsSync(filename)) return [];
    const lines = fs.readFileSync(filename, 'utf8').split('\n').filter(l => l.trim() !== '');
    return lines.map(line => {
        const parts = line.split(',');
        const dtStr = parts[0].replace(/\./g, '-').replace(' ', 'T') + 'Z';
        return { time: new Date(dtStr).getTime() / 1000, open: +parts[1], high: +parts[2], low: +parts[3], close: +parts[4] };
    });
}

(async () => {
    await downloadData();
    
    const m5 = loadCsv('GOLD_M5.csv');
    const m15 = loadCsv('GOLD_M15.csv');
    const h1 = loadCsv('GOLD_H1.csv');
    
    if (m5.length === 0) { console.log("داده‌ای برای تست یافت نشد."); return; }

    const scenarios = [
        { score: 80, slAtr: 2.5 },
        { score: 90, slAtr: 2.5 },
        { score: 80, slAtr: 4.0 },
        { score: 90, slAtr: 4.0 },
        { score: 95, slAtr: 4.0 },
        { score: 90, slAtr: 6.0 }
    ];

    console.log("\n=== بهینه‌سازی استراتژی روی طلا (XAUUSD) ===");
    console.log("Score | SL ATR | تعداد معاملات | وین‌ریت | R خام | R خالص");
    console.log("---------------------------------------------------------");

    for (let sc of scenarios) {
        const opts = {
            mode: 'pattern', h1: true, m15: true, adx: true, adxMin: 25, 
            pa: false, nc: true, trend: true, emax: true, sessionFilter: true, slAtr: sc.slAtr
        };

        let totalTrades = 0, grossR = 0, netR = 0, wins = 0;

        for (let i = 200; i < m5.length - 1; i++) {
            const currentM5 = m5.slice(0, i + 1);
            const decisionTime = currentM5[i].time;
            
            const currentM15 = m15.filter(c => c.time <= decisionTime);
            const currentH1 = h1.filter(c => c.time <= decisionTime);
            
            const result = Engine.evaluate('GOLD', currentM5, currentM15, currentH1, opts, decisionTime);
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
                
                // هزینه برای طلا: ۳ پیپ (۳۰ سنت) در نظر گرفته می‌شود
                const costR = 0.30 / riskDist; 
                const tradeNetR = state.R - costR;
                netR += tradeNetR;

                if (tradeNetR > 0) wins++;
            }
        }

        const winRate = (wins / (totalTrades || 1)) * 100;
        console.log(`${sc.score.toString().padEnd(5)} | ${sc.slAtr.toFixed(1).padEnd(6)} | ${totalTrades.toString().padEnd(12)} | ${winRate.toFixed(1).padEnd(7)}% | ${grossR.toFixed(2).padEnd(6)} | ${netR.toFixed(2)}`);
    }
})();
