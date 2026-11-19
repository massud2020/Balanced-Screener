const fs = require('fs');

async function downloadH1(symbol, filename) {
    console.log(`در حال دانلود ${filename}...`);
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
        console.log(`✅ ${filename} ذخیره شد.`);
    } catch (e) {
        console.error(`❌ خطا در ${filename}`);
    }
}

(async () => {
    await downloadH1('USDJPY=X', 'USDJPY_H1_LONG.csv');
    await downloadH1('AUDUSD=X', 'AUDUSD_H1_LONG.csv');
    await downloadH1('USDCAD=X', 'USDCAD_H1_LONG.csv');
    await downloadH1('USDCHF=X', 'USDCHF_H1_LONG.csv');
    await downloadH1('NZDUSD=X', 'NZDUSD_H1_LONG.csv');
    await downloadH1('EURJPY=X', 'EURJPY_H1_LONG.csv');
    console.log("پایان دانلود!");
})();
