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
  const pfVal = gl ? +(gw / gl).toFixed(2) : 999;
  const avgRVal = +((gw - gl) / a.length).toFixed(3);
  return {
    n: a.length,
    winRate: (100 * w.length / a.length).toFixed(0) + '%',
    PF: gl ? pfVal.toFixed(2) : 'inf',
    sumR: (gw - gl).toFixed(2),
    avgR: avgRVal.toFixed(3),
    maxDD: dd.toFixed(2),
    avgSpreadR,
    _raw: { n: a.length, pf: pfVal, avgR: avgRVal, dd: +dd.toFixed(2) }
  };
}

function evaluateCriteria(st) {
  if (!st._raw || st._raw.n === 0) return 'NO_DATA (در انتظار اولین معامله بسته شده)';
  const { n, pf, avgR, dd } = st._raw;
  if (dd > 12.0) return `FAIL_DD (افت سرمایه ${dd}R از سقف مجاز 12.0R عبور کرد)`;
  if (n < 150) return `COLLECTING_DATA (${n}/150 معامله | PF فعلی: ${pf} | avgR: ${avgR})`;
  if (pf >= 1.15 && avgR >= 0.08 && dd <= 12.0) return 'PASS (معیارهای دمو پاس شدند - آماده بررسی لایو)';
  return `FAIL_EDGE (نمونه کافی است اما PF=${pf} یا avgR=${avgR} به حد نصاب نرسید)`;
}

const since = process.argv[2];
const data = since
  ? closed.filter(x => (x.closeTime || x.time) >= Date.parse(since) / 1000)
  : closed;

const primary = stats(data.filter(x => x.src === 'oanda' && x.mode === 'pattern'));
const secondary = stats(data.filter(x => x.src === 'oanda' && x.mode === 'range'));
const crypto = stats(data.filter(x => x.src === 'okx'));
const all = stats(data);

const clean = ({ _raw, ...rest }) => rest;

console.log('=== DEMO REPORT' + (since ? ' (SINCE ' + since + ')' : '') + ' ===');
console.log('ALL:', JSON.stringify(clean(all)));
console.log('PRIMARY (OANDA + pattern):', JSON.stringify(clean(primary)));
console.log('VERDICT (PRIMARY):', evaluateCriteria(primary));
console.log('SECONDARY (OANDA + range):', JSON.stringify(clean(secondary)));
console.log('CRYPTO (OKX):', JSON.stringify(clean(crypto)));
