const fs = require('fs');

async function downloadH1(symbol, filename) {
    console.log(`در حال دانلود ۲ سال داده H1 برای ${filename}...`);
    // دریافت ۲ سال داده یک ساعته (730d)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=60m&range=730d`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const json = await res.json();
        const q = json.chart.result[0].indicators.quote[0];
        const ts = json.chart.result[0].timestamp;
        let lines = [];
        for (let i = 0; i < ts.length; i++) {
            if (q.open[i] === null || q.close[i] === null) continue;
            const dtStr = new Date(ts[i] * 1000).toISOString().replace('T', ' ').slice(0, 19);
            lines.push(`${dtStr},${q.open[i].toFixed(5)},${q.high[i].toFixed(5)},${q.low[i].toFixed(5)},${q.close[i].toFixed(5)}`);
        }
        fs.writeFileSync(filename, lines.join('\n'));
        console.log(`✅ ${filename} ذخیره شد (${lines.length} کندل H1).`);
    } catch (e) {
        console.error(`❌ خطا در دانلود ${filename}:`, e.message);
    }
}

(async () => {
    await downloadH1('GC=F', 'GOLD_H1_LONG.csv');
    await downloadH1('EURUSD=X', 'EURUSD_H1_LONG.csv');
    await downloadH1('GBPUSD=X', 'GBPUSD_H1_LONG.csv');
    console.log("پایان دانلود داده‌های بلندمدت!");
})();
