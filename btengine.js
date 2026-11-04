// backtest.js — v45 validation script
// Runs 4 scenarios against data.json to validate engine patches
// Also analyzes history.json for quality metrics
//
// Usage:  node backtest.js
// Requires: engine.js (v45), data.json, optionally history.json
'use strict';

const fs = require('fs');
const path = require('path');

// ---------- load engine ----------
let ENG;
try {
  ENG = require('./engine.js');
} catch (e) {
  console.error('❌ Cannot load engine.js:', e.message);
  console.error('   Make sure engine.js is in the same folder as backtest.js');
  process.exit(1);
}
const { evaluate, DEF, ENGINE_VER } = ENG;

// ---------- load data ----------
let data;
try {
  const raw = fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8');
  data = JSON.parse(raw);
} catch (e) {
  console.error('❌ Cannot load data.json:', e.message);
  process.exit(1);
}

if (!Array.isArray(data.rows)) {
  console.error('❌ data.json has no "rows" array — is it the right file?');
  process.exit(1);
}

console.log('═'.repeat(72));
console.log(`  Engine version: ${ENGINE_VER}`);
console.log(`  Data snapshot:  ${new Date(data.time).toISOString()}`);
console.log(`  Total rows:     ${data.rows.length}`);
console.log(`  Active signals: ${Object.keys(data.state?.active || {}).length}`);
console.log(`  Sent signals:   ${Object.keys(data.state?.sent || {}).length}`);
console.log('═'.repeat(72));

// ---------- helpers ----------
function normalizeRows(rows) {
  return rows.filter(r => {
    if (!r || !r.id) return false;
    if (!Array.isArray(r.a) || !Array.isArray(r.h)) return false;
    if (r.a.length < 210 || r.h.length < 210) return false;
    return true;
  });
}

function runScenario(label, opts) {
  const rows = normalizeRows(data.rows);
  const result = {
    signals: [],
    byFail: {},
    skipped: data.rows.length - rows.length,
    total: rows.length,
  };

  for (const row of rows) {
    try {
      const r = evaluate(row.id, row.a, row.h, opts, data.time / 1000);
      if (r.side) {
        result.signals.push({
          id: row.id,
          side: r.side,
          mode: r.mode || opts.mode || 'pattern',
          pass: r.pass,
          total: r.total,
          entry: r.entry,
          sl: r.sl,
          tp: r.tp,
          rr: r.rr,
          adx: r.adx,
        });
      } else {
        const k = r.fail || 'unknown';
        result.byFail[k] = (result.byFail[k] || 0) + 1;
      }
    } catch (e) {
      const k = `EXCEPTION: ${e.message || e}`;
      result.byFail[k] = (result.byFail[k] || 0) + 1;
    }
  }

  console.log(`\n${'─'.repeat(72)}`);
  console.log(`📊 ${label}`);
  console.log('─'.repeat(72));
  console.log(`  Rows analyzed:  ${result.total}  (skipped: ${result.skipped})`);
  console.log(`  ✅ Signals:     ${result.signals.length}`);
  console.log(`  ❌ No signal:   ${result.total - result.signals.length}`);

  if (result.signals.length) {
    console.log('\n  📈 Signal list:');
    result.signals.forEach(s => {
      const passInfo = `pass ${s.pass}/${s.total}`;
      const adxInfo = s.adx != null ? ` ADX ${s.adx.toFixed(1)}` : '';
      const rrInfo = s.rr != null ? ` R:R ${s.rr}` : '';
      console.log(`    ${String(s.id).padEnd(12)} ${String(s.side).padEnd(5)} [${String(s.mode).padEnd(7)}] ${passInfo}${adxInfo}${rrInfo}`);
    });
  }

  const failEntries = Object.entries(result.byFail).sort((a, b) => b[1] - a[1]);
  if (failEntries.length) {
    console.log('\n  🚫 Failure reasons (top):');
    failEntries.slice(0, 8).forEach(([k, v]) => {
      console.log(`    ${String(v).padStart(3)}× ${k}`);
    });
    if (failEntries.length > 8) {
      console.log(`    ... and ${failEntries.length - 8} more reasons`);
    }
  }

  return result;
}

// ---------- Scenario A: simulate "before patch" ----------
console.log('\n\n🔬 SCENARIO A — قبل از پچ (minPaScore=3.0 hardcoded، ADX نرم همیشه فعال)');
const optsA = {
  ...DEF,
  mode: 'pattern',
  minPaScore: 3.0,     // شبیه‌سازی هاردکد قبلی در checkPriceAction
  adx: false,
  adxSoft: true,       // شبیه‌سازی ADX نرم که همیشه فعال بود
  adxSoftMin: 18,
};
const resA = runScenario('قبل از پچ (v44)', optsA);

// ---------- Scenario B: only minPaScore fix ----------
console.log('\n\n🔬 SCENARIO B — فقط رفع باگ minPaScore (ADX نرم هنوز فعال)');
const optsB = {
  ...DEF,
  mode: 'pattern',
  minPaScore: 2.2,
  adx: false,
  adxSoft: true,
  adxSoftMin: 18,
};
const resB = runScenario('minPaScore=2.2 فقط', optsB);

// ---------- Scenario C: full v45 patch ----------
console.log('\n\n🔬 SCENARIO C — پچ کامل v45 (minPaScore=2.2 + ADX نرم خاموش)');
const optsC = {
  ...DEF,
  mode: 'pattern',
  minPaScore: 2.2,
  adx: false,
  adxSoft: false,
};
const resC = runScenario('پچ کامل (v45)', optsC);

// ---------- Scenario D: range mode ----------
console.log('\n\n🔬 SCENARIO D — حالت رنج (range mode)');
const optsD = {
  ...DEF,
  mode: 'range',
  adxSoft: false,
};
const resD = runScenario('رنج', optsD);

// ---------- Comparison summary ----------
console.log('\n\n' + '═'.repeat(72));
console.log('📊 COMPARISON SUMMARY');
console.log('═'.repeat(72));
console.log(`  ${'Scenario'.padEnd(48)} | Signals`);
console.log(`  ${'─'.repeat(48)} | ───────`);
console.log(`  ${'A) قبل از پچ (minPaScore=3.0, ADX نرم)'.padEnd(48)} | ${resA.signals.length}`);
console.log(`  ${'B) فقط minPaScore=2.2'.padEnd(48)} | ${resB.signals.length}`);
console.log(`  ${'C) پچ کامل v45 (minPaScore=2.2 + ADX off)'.padEnd(48)} | ${resC.signals.length}`);
console.log(`  ${'D) حالت رنج'.padEnd(48)} | ${resD.signals.length}`);
console.log('═'.repeat(72));

// ---------- Recommendation ----------
console.log('\n💡 RECOMMENDATION:');
const diff = resC.signals.length - resA.signals.length;
if (resC.signals.length >= 3) {
  console.log(`  ✅ پچ v45 مؤثر بود: ${resA.signals.length} → ${resC.signals.length} سیگنال (+${diff})`);
  console.log(`  ➡️  مرحله‌ی ۱ تمام. کیفیت را در ۴۸ ساعت آینده مانیتور کن.`);
} else if (diff > 0) {
  console.log(`  ⚠️  پچ v45 کمی کمک کرد: ${resA.signals.length} → ${resC.signals.length} سیگنال (+${diff})`);
  console.log(`  ➡️  اگر < ۳ سیگنال است، مرحله‌ی ۲ (نرم‌کردن nc و edge) را در نظر بگیر.`);
} else {
  console.log(`  ❌ پچ v45 کمکی نکرد: ${resA.signals.length} → ${resC.signals.length}`);
  console.log(`  ➡️  بازار واقعاً سیگنال ندارد، یا فیلتر دیگری مقصر است.`);
  console.log(`  ➡️  مرحله‌ی ۲ (nc + edge) را اعمال کن.`);
}
console.log(`  🟢 ADX soft:  ${diff > 0 ? 'مقصر بود' : 'مقصر نبود'} (${resA.signals.length} → ${resB.signals.length} با minPaScore fix به‌تنهایی)`);
const diff2 = resB.signals.length - resA.signals.length;
if (diff2 > 0) {
  console.log(`  🟡 minPaScore bug: مقصر بود (${resA.signals.length} → ${resB.signals.length} یعنی +${diff2} با ADX هنوز روشن)`);
} else {
  console.log(`  🟡 minPaScore bug: تأثیر کمی داشت`);
}

// ---------- History analysis ----------
try {
  const histRaw = fs.readFileSync(path.join(__dirname, 'history.json'), 'utf8');
  const hist = JSON.parse(histRaw);
  const items = Array.isArray(hist) ? hist : (hist.history || []);
  if (items.length) {
    console.log('\n\n' + '═'.repeat(72));
    console.log('📜 HISTORY ANALYSIS (quality metrics)');
    console.log('═'.repeat(72));
    console.log(`  Total historical signals: ${items.length}`);

    const closed = items.filter(h => h.result);
    const wins = closed.filter(h => h.result === 'win').length;
    const losses = closed.filter(h => h.result === 'loss').length;
    const timeouts = closed.filter(h => h.result === 'time' || h.why === 'FADE' || h.why === 'TIME').length;
    const open = items.length - closed.length;

    console.log(`    Wins:     ${wins}`);
    console.log(`    Losses:   ${losses}`);
    console.log(`    Timeouts: ${timeouts}`);
    console.log(`    Open:     ${open}`);

    if (closed.length) {
      const wr = (wins / closed.length * 100).toFixed(1);
      const totalR = closed.reduce((s, h) => s + (h.R || 0), 0);
      console.log(`    Win rate: ${wr}%`);
      console.log(`    Total R:  ${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`);

      const byMode = {};
      closed.forEach(h => {
        const m = h.mode || 'pattern';
        if (!byMode[m]) byMode[m] = { wins: 0, losses: 0, timeouts: 0, R: 0 };
        if (h.result === 'win') byMode[m].wins++;
        else if (h.result === 'loss') byMode[m].losses++;
        else byMode[m].timeouts++;
        byMode[m].R += (h.R || 0);
      });
      console.log('\n  By mode:');
      Object.entries(byMode).forEach(([m, s]) => {
        const n = s.wins + s.losses + s.timeouts;
        const wr2 = n > 0 ? (s.wins / n * 100).toFixed(0) : '0';
        console.log(`    ${m.padEnd(8)}: ${s.wins}W/${s.losses}L/${s.timeouts}T   WR=${wr2}%   R=${s.R >= 0 ? '+' : ''}${s.R.toFixed(2)}`);
      });
    }

    const last10 = items.slice(-10).reverse();
    console.log('\n  Last 10 signals (newest first):');
    last10.forEach(h => {
      const date = new Date((h.time || 0) * 1000).toISOString().slice(0, 16).replace('T', ' ');
      const r = h.R != null ? (h.R >= 0 ? '+' : '') + Number(h.R).toFixed(2) : '  -  ';
      const why = h.why ? ` (${h.why})` : '';
      console.log(`    ${date}  ${String(h.id).padEnd(12)} ${String(h.side).padEnd(5)} ${String(h.result || 'open').padEnd(6)} R=${r}${why}`);
    });
  }
} catch (e) {
  if (e.code === 'ENOENT') {
    console.log('\n\n⚠️  history.json not found — skipping quality analysis (this is OK)');
  } else {
    console.log('\n\n⚠️  history.json invalid — skipping:', e.message);
  }
}

console.log('\n✨ Done.\n');
