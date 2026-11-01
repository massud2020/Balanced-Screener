// Background scanner for GitHub Actions
// v40: one open signal per symbol until closed + day-key history (no candle-time duplicates)
const fs = require("fs"),
  { evaluate, dropForming } = require("./engine.js"),
  { U } = require("./symbols.js"),
  AL = require("./alerts.js");

const TOK = process.env.OANDA_TOKEN,
  ENV = process.env.OANDA_ENV || "practice";

const F15 = process.env.M15 !== "0";
const FH1 = process.env.H1 !== "0";
const RSI_ON = process.env.RSI !== "0";
const RSI_L = +(process.env.RSI_L || 46);
const RSI_S = +(process.env.RSI_S || 54);
const STRICT = process.env.H1_STRICT === "1";

// pattern + range؛ انتخاب per-symbol با ADX
const MODES = (process.env.MODES || "pattern,range").split(",").map(x => x.trim()).filter(x => x === "pattern" || x === "range");
if (!MODES.length) MODES.push("pattern");
function enabledModes() { return MODES; }

const METALS = new Set(["XAUUSD", "XAGUSD", "XCUUSD"]),
  COMMS = new Set(["WTICO", "BRENT", "NATGAS", "CORN", "WHEAT", "SOYBEAN", "SUGAR"]),
  INDS = new Set(["SPX500", "NAS100", "US30", "US2000", "DE30", "UK100", "FR40", "EU50", "JP225", "HK33", "AU200"]);
const mktOf = u => u[1] ? "crypto" : METALS.has(u[0]) ? "metal" : COMMS.has(u[0]) ? "commodity" : INDS.has(u[0]) ? "index" : (u[4] && u[4] !== 0) ? "forex" : "stock";
const NAME = { pattern: "روند / الگوی ۳+۱", range: "استراتژی رنج" };

const MAX_HOLD_SEC = 6 * 3600; // حداکثر باز بودن سیگنال
const CLOSE_SCANS = 2;         // چند اسکن بدون سیگنال → بسته

async function J(url, o = {}) {
  const r = await fetch(url, { ...o, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

const okx = async (id, bar) => {
  const j = await J(`https://www.okx.com/api/v5/market/candles?instId=${id}&bar=${bar}&limit=300`);
  if (j.code !== "0") return [];
  return j.data.map(r => ({
    time: +r[0] / 1000,
    open: +Number(r[1]).toFixed(5),
    high: +Number(r[2]).toFixed(5),
    low: +Number(r[3]).toFixed(5),
    close: +Number(r[4]).toFixed(5)
  })).sort((a, b) => a.time - b.time);
};

const oanda = async (i, g) => {
  const h = ENV === "live" ? "api-fxtrade" : "api-fxpractice";
  const j = await J(`https://${h}.oanda.com/v3/instruments/${i}/candles?granularity=${g}&count=300&price=M`, {
    headers: { Authorization: "Bearer " + TOK }
  });
  return j.candles.map(c => ({
    time: Date.parse(c.time) / 1000,
    open: +Number(c.mid.o).toFixed(5),
    high: +Number(c.mid.h).toFixed(5),
    low: +Number(c.mid.l).toFixed(5),
    close: +Number(c.mid.c).toFixed(5)
  })).filter(c => isFinite(c.close));
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
async function yh(sy, iv, rg) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sy)}?interval=${iv}&range=${rg}&includePrePost=false`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res) throw new Error("yahoo: empty");
  const q = res.indicators.quote[0], o = [];
  (res.timestamp || []).forEach((t, i) => {
    if ([q.open[i], q.high[i], q.low[i], q.close[i]].every(v => v != null))
      o.push({
        time: t,
        open: +Number(q.open[i]).toFixed(5),
        high: +Number(q.high[i]).toFixed(5),
        low: +Number(q.low[i]).toFixed(5),
        close: +Number(q.close[i]).toFixed(5)
      });
  });
  return o;
}

async function tf(u, which) {
  const m = which === "5m";
  let a = [];
  if (u[1]) { try { a = await okx(u[1], m ? "5m" : "1H"); } catch (e) {} }
  else if (u[4] && TOK) { try { a = await oanda(u[4], m ? "M5" : "H1"); } catch (e) {} }
  if (a.length < 210 && u[2]) {
    try {
      const y = await yh(u[2], m ? "5m" : "1h", m ? "5d" : "6mo");
      if (y.length > a.length) a = y;
    } catch (e) {}
  }
  return a;
}

const DC = new Map(), slot5 = t => Math.floor((t - 20) / 300);
async function loadCached(u, now) {
  const c = DC.get(u[0]) || {};
  const backoff = c.fail && now - c.try5 < 120;
  const need5 = (!c.a || slot5(now) > slot5(c.t5)) && !backoff;
  const need1 = (!c.h || now - c.t1 > (u[1] ? 600 : 3300)) && !backoff;
  if (!need5 && !need1) return [c.a || [], c.h || []];
  const e = { ...c };
  e.try5 = now;
  await Promise.all([
    need5 && tf(u, "5m").then(a => { if (a.length >= 50) { e.a = a; e.t5 = now; e.fail = 0; } else e.fail = (c.fail || 0) + 1; }).catch(() => { e.fail = (c.fail || 0) + 1; }),
    need1 && tf(u, "1h").then(h => { if (h.length) { e.h = h; e.t1 = now; } }).catch(() => {}),
  ]);
  DC.set(u[0], e);
  return [e.a || [], e.h || []];
}

const TH_SIG = String(process.env.TELEGRAM_SIGNALS_THREAD_ID || process.env.TELEGRAM_SIGNAL_THREAD_ID || process.env.TELEGRAM_THREAD_ID || "").trim();
const TH_ALR = String(process.env.TELEGRAM_ALERTS_THREAD_ID || process.env.TELEGRAM_ALERT_THREAD_ID || "").trim();
const tgSleep = ms => new Promise(r => setTimeout(r, ms));

async function tg(text, thread) {
  const TOKEN = process.env.TELEGRAM_TOKEN, CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT_ID) return false;
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  let th = /^\d+$/.test(thread || "") ? +thread : null;
  for (let i = 0; i < 4; i++) {
    const body = { chat_id: String(CHAT_ID).trim(), text };
    if (th) body.message_thread_id = th;
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) return true;
      if (r.status === 429) { await tgSleep((((j.parameters || {}).retry_after) || 3) * 1000 + 300); continue; }
      if (r.status === 400 && th && /thread/i.test(j.description || "")) { console.error("telegram: thread id invalid, sending without thread"); th = null; continue; }
      console.error("telegram error:", r.status, j.description || "");
      return false;
    } catch (e) { await tgSleep(1000); }
  }
  return false;
}
async function notify(title, message) { return tg(title + "\n\n" + message, TH_SIG); }
const fd = (x, d) => (x == null || !isFinite(x)) ? "-" : (d == null ? String(+Number(x).toPrecision(7)) : Number(x).toFixed(d));

// state پایدار: sent + alerts + active (سیگنال‌های باز)
let STATE = { sent: {}, alerts: {}, active: {} };
try {
  const d0 = JSON.parse(fs.readFileSync("data.json", "utf8"));
  if (d0 && d0.state) STATE = {
    sent: d0.state.sent || {},
    alerts: d0.state.alerts || {},
    active: d0.state.active || {}
  };
} catch (e) {}
// پاکسازی کلیدهای قدیمی شکل id|side|bt (bt عدد بزرگ)
try {
  for (const k of Object.keys(STATE.sent || {})) {
    const parts = k.split("|");
    if (parts.length >= 3 && /^\d{9,}$/.test(parts[2])) delete STATE.sent[k];
  }
} catch (e) {}

function dayKey(ts) {
  return new Date((ts || Date.now() / 1000) * 1000).toISOString().slice(0, 10);
}
function isOpen(id) {
  const a = STATE.active[id];
  if (!a) return false;
  if (Date.now() / 1000 - a.time > MAX_HOLD_SEC) return false;
  return true;
}
function openSig(id, side, entry, mode, now) {
  STATE.active[id] = { side, entry, mode, time: now, scansWithout: 0 };
}
function touchActives(currentSides, now) {
  for (const id of Object.keys(STATE.active)) {
    const a = STATE.active[id];
    const close = () => {
      const lockKey = `${id}|${a.side}`;
      // قفل نماد|جهت را برنمی‌داریم تا پایان روز؛ فقط active بسته می‌شود
      // برای اجازه سیگنال جدید بعد از بسته شدن واقعی، lockKey را پاک می‌کنیم:
      delete STATE.sent[lockKey];
      delete STATE.active[id];
    };
    if (now - a.time > MAX_HOLD_SEC) { close(); continue; }
    const cur = currentSides[id];
    if (cur && cur === a.side) a.scansWithout = 0;
    else {
      a.scansWithout = (a.scansWithout || 0) + 1;
      if (a.scansWithout >= CLOSE_SCANS) close();
    }
  }
}

function pickModeByAdx(adxV) {
  if (adxV == null || !isFinite(adxV)) return "pattern";
  if (adxV >= 24) return "pattern";
  if (adxV <= 20) return "range";
  return adxV >= 22 ? "pattern" : "range";
}

const AC = new Map();
async function alertBars(sym, now) {
  const u = AL.resolve(sym, U), c = AC.get(u[0]);
  if (c && now - c.t < 45) return c;
  let bars = [];
  try { bars = await tf(u, "5m"); } catch (e) {}
  if (!bars.length) return c && now - c.t < 900 ? c : null;
  const e = { t: now, dg: u[3], bars: bars.slice(-60).map(b => ({ time: b.time, high: b.high, low: b.low, close: b.close })) };
  AC.set(u[0], e);
  return e;
}
async function processAlerts(now) {
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync("alerts.json", "utf8")); } catch (e) { return 0; }
  const list = (cfg.alerts || []).filter(a => a && a.on !== false && a.sym && a.id);
  if (!list.length) return 0;
  const data = {};
  await Promise.all([...new Set(list.map(a => a.sym))].map(async s => { const e = await alertBars(s, now); if (e) data[s] = e; }));
  const out = AL.check(list, data, now, STATE.alerts, cfg.tz || "Asia/Tehran");
  let n = 0;
  for (const o of out.slice(0, 20)) {
    const ok = await tg(o.title + "\n" + o.text, TH_ALR);
    if (!ok && process.env.TELEGRAM_TOKEN) { delete STATE.alerts.fired[o.key]; if (STATE.alerts.armed && o.kind === "price") STATE.alerts.armed[o.key] = true; continue; }
    n++;
  }
  return n;
}

const LOOP = +(process.env.LOOP_SECONDS || 0), IV = +(process.env.INTERVAL || 60) * 1000, sleep = ms => new Promise(r => setTimeout(r, ms));

async function once(now) {
  const modes = enabledModes();
  const allRows = [];
  const currentSides = {};

  let history = [];
  try {
    const rawHistory = fs.readFileSync("history.json", "utf8");
    const parsed = JSON.parse(rawHistory);
    if (Array.isArray(parsed)) history = parsed;
    else if (parsed && Array.isArray(parsed.history)) history = parsed.history;
  } catch (e) {
    console.log("No valid history.json found. Starting fresh.");
  }

  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < U.length) {
      const u = U[i++];
      if (!u[1] && !u[2] && !(u[4] && TOK)) continue;

      try {
        const [a, h] = await loadCached(u, now);

        if (a.length < 50) {
          allRows.push({ id: u[0], side: null, d: u[3], mkt: mktOf(u), fail: "No Data", pass: 0, total: 7, mode: modes[0], u: u });
          currentSides[u[0]] = null;
          continue;
        }

        const cl = dropForming(a, 300, now);
        const bt = cl.length ? cl[cl.length - 1].time : 0;
        const packCandles = (arr) => arr.slice(-210).map(c => [c.time, c.open, c.high, c.low, c.close]);

        // انتخاب رژیم با ADX (بدون شرط ورود)
        const probe = evaluate(u[0], a, h, { mode: "pattern", adx: false, trend: false, emax: false, nc: false, pat: false, m15: false, h1: false, rsi: false }, now);
        let useMode = pickModeByAdx(probe.adx);
        if (!modes.includes(useMode)) useMode = modes[0];

        const opts = {
          mode: useMode,
          m15: F15, h1: FH1, h1Strict: STRICT,
          rsi: RSI_ON, rsiL: RSI_L, rsiS: RSI_S,
          adx: false
        };
        const r = evaluate(u[0], a, h, opts, now);

        // اگر سیگنال باز است، side را برای data.json نگه می‌داریم ولی تاریخچه/تلگرام تکراری نمی‌فرستیم
        const blocked = r.side && isOpen(u[0]);
        const emitSide = blocked ? null : r.side;

        if (r.side) {
          currentSides[u[0]] = r.side;
          allRows.push({
            id: u[0], side: emitSide, entry: r.entry, sl: r.sl, rsi: r.rsi, d: u[3], mkt: mktOf(u),
            pass: r.total || 7, total: r.total || 7, bt: bt, mode: useMode, u: u,
            a: packCandles(a), h: packCandles(h),
            fail: blocked ? "سیگنال باز قبلی هنوز بسته نشده" : undefined
          });

          if (emitSide) {
            // کلید قفل: فقط نماد|جهت — تا سیگنال باز است هیچ پیام تکراری نرود
            const lockKey = `${u[0]}|${r.side}`;
            const histKey = `${u[0]}|${r.side}|${dayKey(now)}`;
            const alreadySent = STATE.sent[lockKey] || STATE.sent[histKey];
            const alreadyOpen = isOpen(u[0]);
            if (!alreadySent && !alreadyOpen) {
              STATE.sent[lockKey] = now;
              STATE.sent[histKey] = now;
              openSig(u[0], r.side, r.entry, useMode, now);
              const checksData = (r.checks || []).map(c => ({ l: c.l, o: c.ok ? 1 : 0 }));
              if (!history.some(h => h.id === u[0] && h.side === r.side && dayKey(h.time) === dayKey(now))) {
                history.push({
                  id: u[0], side: r.side, entry: r.entry, sl: r.sl, rsi: r.rsi,
                  time: now, bt: bt, k: histKey, d: u[3], mode: useMode,
                  checks: checksData, totalConds: r.total
                });
              }
              const L = r.side === "LONG";
              const ageMin = Math.max(0, Math.round((now - (bt + 300)) / 60));
              const modeName = NAME[useMode] || useMode;
              const sent = await tg(
                `🌐 [پس‌زمینه] ${L ? "🟢 LONG" : "🔴 SHORT"} ${u[0]}\n${modeName}\nEntry ${fd(r.entry, u[3])} | SL ${fd(r.sl, u[3])}\nRSI ${fd(r.rsi, 1)} | کندل ${ageMin} دقیقه پیش بسته شد\nخروج: اولین واگرایی RSI`,
                TH_SIG
              );
              // اگر تلگرام شکست خورد، فقط sent را بردار — active را نگه دار تا دوباره اسپم نشود
              if (!sent && process.env.TELEGRAM_TOKEN) {
                delete STATE.sent[lockKey];
                delete STATE.sent[histKey];
                // یک‌بار دیگر در اجرای بعد تلاش می‌شود، ولی active مانع اسپم می‌شود
              }
              try {
                fs.writeFileSync("latest_signal.txt", `${u[0]},${L ? "BUY" : "SELL"},${fd(r.entry, u[3])},${fd(r.sl, u[3])},0,${now}`);
              } catch (e) {}
            } else if (alreadyOpen || alreadySent) {
              // سیگنال باز است؛ فقط data ردیف بدون side جدید
            }
          }
        } else {
          currentSides[u[0]] = null;
          allRows.push({
            id: u[0], side: null, d: u[3], mkt: mktOf(u),
            fail: r.fail || "خطای نامشخص",
            pass: r.pass || 0, total: r.total || 7,
            mode: useMode, u: u,
            a: packCandles(a), h: packCandles(h)
          });
        }
      } catch (e) {
        allRows.push({ id: u[0], side: null, d: u[3], mkt: mktOf(u), fail: "Error", pass: 0, total: 7, mode: modes[0], u: u });
        currentSides[u[0]] = null;
      }
    }
  }));

  // بستن سیگنال‌هایی که دیگر شرایط ندارند
  touchActives(currentSides, now);

  try { const n = await processAlerts(now); if (n) console.log(`Price alerts sent: ${n}`); } catch (e) { console.error("alerts failed", e.message); }
  for (const k of Object.keys(STATE.sent)) if (now - STATE.sent[k] > 2 * 86400) delete STATE.sent[k];

  const threeDaysAgo = now - (3 * 24 * 3600);
  history = history.filter(h => h.time > threeDaysAgo);
  // dedupe history: یک رکورد در روز برای هر نماد+جهت
  const seenH = new Set();
  history = history.sort((a, b) => a.time - b.time).filter(h => {
    const k = h.k || `${h.id}|${h.side}|${dayKey(h.time)}`;
    if (seenH.has(k)) return false;
    seenH.add(k);
    return true;
  });

  fs.writeFileSync("data.json", JSON.stringify({ time: Date.now(), rows: allRows, state: STATE }));
  fs.writeFileSync("history.json", JSON.stringify({ time: Date.now(), history: history }));

  console.log(`Scan complete. Found ${allRows.filter(r => r.side).length} valid signals. Active open: ${Object.keys(STATE.active).length}`);
}

if (require.main === module) (async () => {
  console.log("Settings:", JSON.stringify({
    modes: MODES, m15: F15, h1: FH1, rsi: RSI_ON, rsiL: RSI_L, rsiS: RSI_S, strict: STRICT,
    telegram: !!(process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_CHAT_ID), signalsThread: !!TH_SIG, alertsThread: !!TH_ALR,
    loopSec: LOOP, intervalMs: IV
  }));
  const t0 = Date.now();
  // LOOP=0 → یک‌بار اسکن و خروج | LOOP>0 → حداکثر LOOP ثانیه، هر INTERVAL یک اسکن
  for (;;) {
    try { await once(Date.now() / 1000); } catch (e) { console.error("scan failed", e.message); }
    if (!LOOP) break; // فقط یک پاس
    const elapsed = Date.now() - t0;
    if (elapsed >= LOOP * 1000) {
      console.log(`Loop finished after ${(elapsed/1000).toFixed(0)}s (limit ${LOOP}s)`);
      break;
    }
    const wait = Math.min(IV, Math.max(0, LOOP * 1000 - elapsed));
    if (wait <= 0) break;
    await sleep(wait);
  }
  console.log("Scanner process exiting cleanly.");
})();

if (require.main !== module) module.exports = { once, getState: () => STATE, setState: x => { STATE = x; } };
