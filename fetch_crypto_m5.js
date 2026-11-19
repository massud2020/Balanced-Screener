const fs = require('fs');

async function downloadBinance(symbol, filename) {
    console.log(`در حال دانلود ۲ سال داده M5 برای ${symbol} از بایننس...`);
    let allLines = [];
    let endTime = Date.now();
    
    // حلقه برای دریافت داده‌های ۲ سال گذشته (بایننس هر بار ۱۰۰۰ کندل می‌دهد)
    for (let i = 0; i < 210; i++) { 
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&limit=1000&endTime=${endTime}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (!data || data.length === 0) break;
            
            for (let k of data) {
                const dtStr = new Date(k[0]).toISOString().replace('T', ' ').slice(0, 19);
                allLines.unshift(`${dtStr},${k[1]},${k[2]},${k[3]},${k[4]}`);
            }
            endTime = data[0][0] - 1; // رفتن به عقب‌تر
            if (data.length < 1000) break;
        } catch (e) {
            console.error("خطا در دریافت:", e.message); break;
        }
    }
    
    fs.writeFileSync(filename, allLines.join('\n'));
    console.log(`✅ ${filename} ذخیره شد (${allLines.length} کندل M5).`);
}

(async () => {
    // دریافت داده بیت‌کوین و اتریوم
    await downloadBinance('BTCUSDT', 'BTC_M5_LONG.csv');
    await downloadBinance('ETHUSDT', 'ETH_M5_LONG.csv');
    console.log("پایان دانلود داده‌های M5!");
})();
