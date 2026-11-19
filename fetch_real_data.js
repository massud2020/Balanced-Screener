const fs = require('fs');

async function fetchData(symbol, interval, range, filename) {
    console.log(`در حال دانلود داده‌های ${filename} از یاهو فایننس...`);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const json = await res.json();
        const result = json.chart.result[0];
        const ts = result.timestamp;
        const q = result.indicators.quote[0];
        
        let lines = [];
        for (let i = 0; i < ts.length; i++) {
            if (q.open[i] === null || q.close[i] === null) continue; // حذف کندل‌های خالی
            
            const d = new Date(ts[i] * 1000);
            const dtStr = d.toISOString().replace('T', ' ').slice(0, 19);
            lines.push(`${dtStr},${q.open[i].toFixed(5)},${q.high[i].toFixed(5)},${q.low[i].toFixed(5)},${q.close[i].toFixed(5)}`);
        }
        fs.writeFileSync(filename, lines.join('\n'));
        console.log(`✅ ${filename} با موفقیت ذخیره شد (${lines.length} کندل).`);
    } catch (e) {
        console.error(`❌ خطا در دانلود ${filename}:`, e.message);
    }
}

(async () => {
    // دریافت داده‌های واقعی EURUSD
    await fetchData('EURUSD=X', '5m', '60d', 'EURUSD_M5.csv');
    await fetchData('EURUSD=X', '15m', '60d', 'EURUSD_M15.csv');
    await fetchData('EURUSD=X', '60m', '3mo', 'EURUSD_H1.csv');
    console.log('پایان دانلود داده‌های واقعی!');
})();
