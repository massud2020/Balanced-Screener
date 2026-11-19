const fs = require('fs');

let h = [];
if (fs.existsSync('./demo_ledger.json')) {
  const ledger = JSON.parse(fs.readFileSync('./demo_ledger.json', 'utf8'));
  h = Array.isArray(ledger) ? ledger : (ledger.trades || []);
}
if (!h.length && fs.existsSync('./history.json')) {
  h = JSON.parse(fs.readFileSync('./history.json', 'utf8')).history || [];
}

const closed = h.filter(x => x.why && x.R !== undefined);

function stats(a) {
  if (!a.length) return { n: 0 };
  const R = a.map(x => +x.R);
  const w = R.filter(r => r > 0), l = R.filter(r => r < 0);
  const gw = w.reduce((s, r) => s + r, 0), gl = -l.reduce((s, r) => s + r, 0);
  let eq = 0, peak = 0, dd = 0;
  a.slice().sort((p, q) => (p.closeTime || 0) - (q.closeTime || 0)).forEach(x => {
    eq += +x.R;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak - eq);
  });
  const spreads = a.filter(x => Number.isFinite(x.spreadR)).map(x => +x.spreadR);
  const avgSpreadR = spreads.length ? (spreads.reduce((s, v) => s + v, 0) / spreads.length).toFixed(3) : 'N/A';
  return {
    n: a.length,
    winRate: (100 * w.length / a.length).toFixed(0) + '%',
    PF: gl ? (gw / gl).toFixed(2) : 'inf',
    sumR: (gw - gl).toFixed(2),
    avgR: ((gw - gl) / a.length).toFixed(3),
    maxDD: dd.toFixed(2),
    avgSpreadR
  };
}

const since = process.argv[2];
const data = since
  ? closed.filter(x => (x.closeTime || x.time) >= Date.parse(since) / 1000)
  : closed;

console.log('=== DEMO REPORT' + (since ? ' (SINCE ' + since + ')' : '') + ' ===');
console.log('ALL:', JSON.stringify(stats(data)));
console.log('PRIMARY (OANDA + pattern):', JSON.stringify(stats(data.filter(x => x.src === 'oanda' && x.mode === 'pattern'))));
console.log('SECONDARY (OANDA + range):', JSON.stringify(stats(data.filter(x => x.src === 'oanda' && x.mode === 'range'))));
console.log('CRYPTO (OKX):', JSON.stringify(stats(data.filter(x => x.src === 'okx'))));
