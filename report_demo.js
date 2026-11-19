const h = require('./history.json').history;
const closed = h.filter(x => x.why && x.R !== undefined);
function stats(a) {
  const R = a.map(x => +x.R);
  const w = R.filter(r => r > 0), l = R.filter(r => r < 0);
  const gw = w.reduce((s, r) => s + r, 0), gl = -l.reduce((s, r) => s + r, 0);
  let eq = 0, peak = 0, dd = 0;
  a.slice().sort((p, q) => (p.closeTime || 0) - (q.closeTime || 0)).forEach(x => { eq += +x.R; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); });
  return { n: a.length, winRate: (100 * w.length / a.length).toFixed(0) + '%', PF: gl ? (gw / gl).toFixed(2) : 'inf', sumR: (gw - gl).toFixed(2), avgR: ((gw - gl) / a.length).toFixed(3), maxDD: dd.toFixed(2) };
}
const grp = f => closed.reduce((a, x) => { (a[x[f]] = a[x[f]] || []).push(x); return a; }, {});
console.log('ALL', JSON.stringify(stats(closed)));
for (const f of ['mode', 'src']) { const g = grp(f); for (const k in g) console.log(f + '=' + k, JSON.stringify(stats(g[k]))); }
const since = process.argv[2];
if (since) { const t = Date.parse(since) / 1000; const s = closed.filter(x => (x.closeTime || x.time) >= t); console.log('SINCE ' + since, JSON.stringify(stats(s))); }
