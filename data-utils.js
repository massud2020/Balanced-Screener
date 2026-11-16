const fs = require('fs');

function parseTimestamp(value) {
  const stamp = String(value || '').trim();
  if (/^\d{10,13}$/.test(stamp)) return stamp.length >= 13 ? Math.floor(Number(stamp) / 1000) : Number(stamp);
  return Date.parse(stamp.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(stamp) ? '' : 'Z')) / 1000;
}

function loadCsvDetailed(filename) {
  if (!fs.existsSync(filename)) return { candles: [], rawRows: 0, invalidRows: 0, duplicateRows: 0, outOfOrderRows: 0, reversedInput: false };
  const rows = [];
  let rawRows = 0, invalidRows = 0, duplicateRows = 0, outOfOrderRows = 0;
  let previousInputTime = -Infinity;
  const seen = new Set();
  for (const raw of fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    rawRows++;
    const p = raw.split(',');
    if (p.length < 5) { invalidRows++; continue; }
    const time = parseTimestamp(p[0]);
    const candle = { time, open: Number(p[1]), high: Number(p[2]), low: Number(p[3]), close: Number(p[4]) };
    if (!Number.isFinite(time) || ![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) || candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close) || candle.high < candle.low) {
      invalidRows++; continue;
    }
    if (time < previousInputTime) outOfOrderRows++;
    previousInputTime = time;
    if (seen.has(time)) { duplicateRows++; continue; }
    seen.add(time);
    rows.push(candle);
  }
  const reversedInput = rows.length > 1 && rows[0].time > rows[rows.length - 1].time;
  const inputOrdering = rawRows > 1 && outOfOrderRows / Math.max(1, rawRows - 1) > 0.5 ? 'mostly_descending_or_chunked' : (outOfOrderRows ? 'mixed' : 'ascending');
  rows.sort((a, b) => a.time - b.time);
  return { candles: rows, rawRows, invalidRows, duplicateRows, outOfOrderRows, reversedInput, inputOrdering };
}

function loadCsv(filename) { return loadCsvDetailed(filename).candles; }

function inspectCandles(candles, intervalSec) {
  const out = { rows: candles.length, duplicates: 0, invalid: 0, outOfOrder: 0, gaps: 0, largestGapSec: 0, start: null, end: null };
  if (!candles.length) return out;
  out.start = candles[0].time; out.end = candles[candles.length - 1].time;
  for (let i = 1; i < candles.length; i++) {
    const gap = candles[i].time - candles[i - 1].time;
    if (gap <= 0) out.outOfOrder++;
    if (gap > intervalSec * 1.5) { out.gaps++; out.largestGapSec = Math.max(out.largestGapSec, gap); }
  }
  return out;
}

function inspectFile(filename, intervalSec) {
  const parsed = loadCsvDetailed(filename);
  return { ...inspectCandles(parsed.candles, intervalSec), rawRows: parsed.rawRows, invalidRows: parsed.invalidRows, duplicateRows: parsed.duplicateRows, outOfOrderInputRows: parsed.outOfOrderRows, reversedInput: parsed.reversedInput, inputOrdering: parsed.inputOrdering };
}

module.exports = { loadCsv, loadCsvDetailed, inspectCandles, inspectFile };
