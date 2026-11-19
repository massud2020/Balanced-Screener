const fs = require('fs');
function gen(filename, interval, count, startPrice) {
  let lines = [];
  let price = startPrice;
  let time = new Date('2026-01-01T00:00:00Z').getTime() / 1000;
  for (let i = 0; i < count; i++) {
    let dt = new Date(time * 1000).toISOString().replace('T', ' ').replace('Z', '');
    let open = price;
    let close;
    
    // الگوی تضمینی: ۸ کندل سبز کوچک، ۳ کندل قرمز، ۱ کندل سبز بزرگ
    let phase = i % 12;
    if (phase >= 0 && phase <= 7) {
       close = open + 0.00015; // روند صعودی
    } else if (phase >= 8 && phase <= 10) {
       close = open - 0.00015; // ۳ کندل قرمز (اصلاح)
    } else if (phase === 11) {
       close = open + 0.00050; // ۱ کندل سبز بزرگ (شکست الگو)
    }
    
    let high = Math.max(open, close) + 0.00002;
    let low = Math.min(open, close) - 0.00002;
    lines.push(dt + ',' + open.toFixed(5) + ',' + high.toFixed(5) + ',' + low.toFixed(5) + ',' + close.toFixed(5));
    price = close;
    time += interval * 60;
  }
  fs.writeFileSync(filename, lines.join('\n'));
}
gen('EURUSD_M5.csv', 5, 2000, 1.085);
gen('EURUSD_M15.csv', 15, 1000, 1.085);
gen('EURUSD_H1.csv', 60, 1000, 1.085);
console.log('Perfect data generated.');
