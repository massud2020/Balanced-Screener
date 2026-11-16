const fs = require('fs');
const { inspectFile } = require('./data-utils.js');
const files = fs.readdirSync('.').filter(f => f.toLowerCase().endsWith('.csv')).sort();
const rows = [];
for (const file of files) {
  const name = file.toUpperCase();
  const interval = name.includes('_M5') ? 300 : name.includes('_M15') ? 900 : 3600;
  const q = inspectFile(file, interval);
  rows.push({ file, ...q, startISO: q.start ? new Date(q.start * 1000).toISOString() : null, endISO: q.end ? new Date(q.end * 1000).toISOString() : null });
}
const report = { generatedAt: new Date().toISOString(), files: rows };
fs.writeFileSync('data-quality-report.json', JSON.stringify(report, null, 2));
console.table(rows.map(r => ({ file: r.file, rows: r.rows, raw: r.rawRows, invalid: r.invalidRows, duplicates: r.duplicateRows, outOfOrderInput: r.outOfOrderInputRows, inputOrdering: r.inputOrdering, gaps: r.gaps, largestGapHours: +(r.largestGapSec / 3600).toFixed(2), start: r.startISO, end: r.endISO })));
