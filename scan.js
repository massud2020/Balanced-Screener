// Background scanner for GitHub Actions
// v42: Full MTF (M5, M15, H1) + Partial TP Logic
const fs = require("fs"),
  { evaluate, dropForming, filterCorrelated, getCorrelationGroups, isInTradingSession } = require("./engine.js"),
  TradePolicy = require("./trade-policy.js"),
  AL = require("./alerts.js");

const { getPreset } = require("./presets.js");
const symbolsModule = require("./symbols.js");
const U = symbolsModule.U || (Array.isArray(symbolsModule) ? symbolsModule : []);

if (!Array.isArray(U) || U.length === 0) {
  console.error("[Fatal] No valid symbols array found in symbols.js.");
  process.exit(1); 
}

const TOK = (process.env.OANDA_TOKEN || "").replace(/[^A-Za-z0-9-]/g, ""), ENV = /live/i.test(process.env.OANDA_ENV || "") ? "live" : "practice";
const F15 = process.env.M15 !== "0", FH1 = process.env.H1 !== "0", RSI_ON = process.env.RSI !== "0";
const RSI_L = +(process.env.RSI_L || 38), RSI_S = +(process.env.RSI_S || 62), STRICT = process.env.H1_STRICT === "1";
const MODES = (process.env.MODES || "pattern,range").split(",").map(x => x.trim()).filter(x => x === "pattern" || x === "range");
if (!MODES.length) MODES.push("pattern");
function enabledModes() { return MODES; }

const METALS = new Set(["XAUUSD", "XAGUSD", "XCUUSD"]),
  COMMS = new Set(["WTICO", "BRENT", "NATGAS", "CORN", "WHEAT", "SOYBEAN", "SUGAR"]),
  INDS = new Set(["SPX500", "NAS100", "US30", "US2000", "DE30", "UK100", "FR40", "EU50", "JP225", "HK33", "AU200"]);
const mktOf = u => u[1] ? "crypto" : METALS.has(u[0]) ? "metal" : COMMS.has(u[0]) ? "commodity" : INDS.has(u[0]) ? "index" : (u[4] && u[4] !== 0) ? "forex" : "stock";
const NAME = { pattern: "روند / الگوی ۳+۱", range: "استراتژی رنج" };

const MAX_HOLD_SEC = 6 * 3600;

async function J(url, o = {}) {
  const r = await fetch(url, { ...o, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

const okx = async (id, bar) => {
  const j = await J(`https://www.okx.com/api/v5/market/candles?instId=${id}&bar=${bar}&limit=300`);
  if (j.code !== "0") return [];
  return j.data.map(r => ({
    time: +r[0] / 1000, open: +Number(r[1]).toFixed(5), high: +Number(r[2]).toFixed(5), low: +Number(r[3]).toFixed(5), close: +Number(r[4]).toFixed(5)
  })).sort((a, b) => a.time - b.time);
};

const oanda = async (i, g) => {
  const h = ENV === "live" ? "api-fxtrade" : "api-fxpractice";
  const j = await J(`https://${h}.oanda.com/v3/instruments/${i}/candles?granularity=${g}&count=300&price=MBA`, {
    headers: { Authorization: "Bearer " + TOK }
  });
  return j.candles.map(c => ({
    time: Date.parse(c.time) / 1000,
    open: +Number(c.mid.o).toFixed(5), high: +Number(c.mid.h).toFixed(5), low: +Number(c.mid.l).toFixed(5), close: +Number(c.mid.c).toFixed(5),
    bidOpen: c.bid ? +Number(c.bid.o).toFixed(5) : undefined, bidHigh: c.bid ? +Number(c.bid.h).toFixed(5) : undefined, bidLow: c.bid ? +Number(c.bid.l).toFixed(5) : undefined, bidClose: c.bid ? +Number(c.bid.c).toFixed(5) : undefined,
    askOpen: c.ask ? +Number(c.ask.o).toFixed(5) : undefined, askHigh: c.ask ? +Number(c.ask.h).toFixed(5) : undefined, askLow: c.ask ? +Number(c.ask.l).toFixed(5) : undefined, askClose: c.ask ? +Number(c.ask.c).toFixed(5) : undefined
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
      o.push({ time: t, open: +Number(q.open[i]).toFixed(5), high: +Number(q.high[i]).toFixed(5), low: +Number(q.low[i]).toFixed(5), close: +Number(q.close[i]).toFixed(5) });
  });
  return o;
}

// 🛠 آپدیت: پشتیبانی از M15
async function tf(u, which) {
  let a = []; const why = [];
  if (u[4] && TOK) {
    try {
      a = await oanda(u[4], which === "5m" ? "M5" : which === "15m" ? "M15" : "H1");
      if (a.length >= 50) { a._src = "oanda"; return a; }
      why.push("oanda:" + a.length + " bars (<50)");
    } catch (e) { why.push("oanda:" + e.message); }
  } else if (u[4]) why.push("oanda:no token");
  if (u[1]) {
    try {
      a = await okx(u[1], which === "5m" ? "5m" : which === "15m" ? "15m" : "1H");
      if (a.length) { a._src = "okx"; return a; }
      why.push("okx:empty");
    } catch (e) { why.push("okx:" + e.message); }
  }
  if (u[2]) {
    try {
      const y = await yh(u[2], which === "5m" ? "5m" : which === "15m" ? "15m" : "1h", which === "5m" ? "5d" : which === "15m" ? "60d" : "6mo");
      if (y.length > (a.length || 0)) { a = y; a._src = "yahoo"; }
      else why.push("yahoo:not longer");
    } catch (e) { why.push("yahoo:" + e.message); }
  }
  if (why.length) console.log("[src]", u[0], which, "->", a._src || "NONE", "|", why.join("; "));
  return a;
}

async function fetchOandaBarsForActive(activeMap) {
  const out = {};
  if (!TOK) return out;
  const byId = new Map(U.map(u => [u[0], u]));
  const ids = Object.keys(activeMap || {});
  await Promise.all(ids.map(async (id) => {
    const u = byId.get(id);
    if (!u || !u[4]) return;
    try { const bars = await oanda(u[4], "M5"); if (bars && bars.length) out[id] = bars; } catch (e) {}
  }));
  return out;
}

// 🛠 آپدیت کش برای M15
const DC = new Map(), slot5 = t => Math.floor((t - 20) / 300), slot15 = t => Math.floor((t - 20) / 900);
async function loadCached(u, now) {
  const c = DC.get(u[0]) || {};
  const backoff = c.fail && now - c.try5 < 120;
  const need5 = (!c.a || slot5(now) > slot5(c.t5)) && !backoff;
  const need15 = (!c.m15 || slot15(now) > slot15(c.t15)) && !backoff;
  const need1 = (!c.h || now - c.t1 > (u[1] ? 600 : 3300)) && !backoff;
  if (!need5 && !need15 && !need1) return [c.a || [], c.m15 || [], c.h || []];
  const e = { ...c }; e.try5 = now;
  await Promise.all([
    need5 && tf(u, "5m").then(a => { if (a.length >= 50) { e.a = a; e.t5 = now; e.fail = 0; } else e.fail = (c.fail || 0) + 1; }).catch(() => { e.fail = (c.fail || 0) + 1; }),
    need15 && tf(u, "15m").then(m => { if (m.length >= 50) { e.m15 = m; e.t15 = now; } }).catch(() => {}),
    need1 && tf(u, "1h").then(h => { if (h.length) { e.h = h; e.t1 = now; } }).catch(() => {}),
  ]);
  DC.set(u[0], e);
  return [e.a || [], e.m15 || [], e.h || []];
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
      if (r.status === 400 && th && /thread/i.test(j.description || "")) { th = null; continue; }
      return false;
    } catch (e) { await tgSleep(1000); }
  }
  return false;
}
const fd = (x, d) => (x == null || !isFinite(x)) ? "-" : (d == null ? String(+Number(x).toPrecision(7)) : Number(x).toFixed(d));

let STATE = { sent: {}, alerts: {}, active: {} };
try {
  const d0 = JSON.parse(fs.readFileSync("data.json", "utf8"));
  if (d0 && d0.state) STATE = { sent: d0.state.sent || {}, alerts: d0.state.alerts || {}, active: d0.state.active || {} };
} catch (e) {}

try {
  for (const k of Object.keys(STATE.sent || {})) {
    const parts = k.split("|");
    if (parts.length >= 3 && /^\d{9,}$/.test(parts[2])) delete STATE.sent[k];
  }
} catch (e) {}

function dayKey(ts) { return new Date((ts || Date.now() / 1000) * 1000).toISOString().slice(0, 10); }
function isOpen(id) {
  const a = STATE.active[id];
  if (!a) return false;
  const holdLimit = (a.mode !== "range" && Number(a.peakFav || 0) >= 1.0) ? 18 * 3600 : MAX_HOLD_SEC;
  if (Date.now() / 1000 - a.time > holdLimit) return false;
  return true;
}
function openSig(id, side, entry, mode, now, extra) {
  const e = extra || {};
  const risk = (e.sl != null && entry != null) ? Math.abs(entry - e.sl) : null;
  const tp1 = mode === 'range' ? (e.tp != null ? e.tp : (risk != null ? (side === "LONG" ? entry + 1.5 * risk : entry - 1.5 * risk) : null)) : null;
  STATE.active[id] = { side, entry, mode, time: now, sl: e.sl, tp: tp1, d: e.d,
    bt: (e.bt != null ? e.bt + 300 : now), policyVersion: 3,
    atr: e.atr, signalClose: entry,
    policyOpts: { ...(e.policyOpts || {}), trailingAtrMult: 0.5 },
    currentSl: e.sl, currentR: 0, tp1Hit: false };
}
function calcR(side, entry, sl, exitPx) {
  const risk = Math.abs(entry - sl);
  if (!risk || !isFinite(risk)) return 0;
  const L = side === "LONG";
  return (L ? (exitPx - entry) : (entry - exitPx)) / risk;
}

function normalizeActiveTrade(a) {
  if (!a) return;
  // Legacy records stored the signal candle's open time; move their policy start
  // to the next M5 bar exactly once. Build 94/v2 already stored the shifted time.
  if (!a.policyVersion) {
    if (a.bt != null) a.bt += 300;
    a.policyVersion = 3;
  } else if (a.policyVersion < 3) {
    const risk = Number.isFinite(a.entry) && Number.isFinite(a.sl) ? Math.abs(a.entry - a.sl) : 0;
    const inferredTpR = a.mode === 'range' && risk > 0 && Number.isFinite(a.tp) ? Math.abs(a.tp - a.entry) / risk : 1.5;
    a.policyOpts = { ...(a.policyOpts || {}), rangeTpMult: inferredTpR, trailingAtrMult: 0.5 };
    a.policyVersion = 3;
  }
}
function activeMaxHoldSec(a) {
  return (a && a.mode !== 'range' && Number(a.peakFav || 0) >= 1.0) ? 18 * 3600 : MAX_HOLD_SEC;
}
function updateTrailingState(a, bars) {
  if (!a || !bars || !bars.length) return;
  normalizeActiveTrade(a);
  const state = TradePolicy.resolveTrade({
    side: a.side, entry: a.entry, sl: a.sl, mode: a.mode,
    bars, startTime: a.bt || a.time, maxHoldSec: activeMaxHoldSec(a), opts: a.policyOpts || {},
    now: bars[bars.length - 1].time
  });
  if (state.status === "open") {
    a.currentSl = state.currentSl;
    a.tp1Hit = state.tp1Hit;
    a.currentR = +Number(state.currentR || 0).toFixed(2);
    a.peakFav = Number(state.peakFav || 0);
  }
}

function resolveFromBars(a, bars, now) {
  if (!a || a.entry == null || a.sl == null || !bars || !bars.length) return null;
  normalizeActiveTrade(a);
  const state = TradePolicy.resolveTrade({
    side: a.side, entry: a.entry, sl: a.sl, mode: a.mode,
    bars, startTime: a.bt || a.time, maxHoldSec: activeMaxHoldSec(a), opts: a.policyOpts || {}, now
  });
  if (state.status !== "closed") return null;
  return state;
}

function appendToDemoLedger(record) {
  let ledger = [];
  try {
    const raw = JSON.parse(fs.readFileSync("demo_ledger.json", "utf8"));
    ledger = Array.isArray(raw) ? raw : (raw.trades || []);
  } catch (e) {}
  const key = record.k || `${record.id}|${record.side}|${record.closeTime || record.time}`;
  if (!ledger.some(x => (x.k || `${x.id}|${x.side}|${x.closeTime || x.time}`) === key)) {
    ledger.push({ ...record, k: key });
    fs.writeFileSync("demo_ledger.json", JSON.stringify({ updated: Date.now(), trades: ledger }, null, 2));
  }
}
function applyOutcomeToHistory(history, id, side, day, outcome, now) {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.id === id && h.side === side && !h.result) {
      h.result = outcome.result; h.exit = outcome.exit; h.why = outcome.why; h.R = +Number(outcome.R).toFixed(2); h.closeTime = outcome.closeTime || now; h.tp1Hit = outcome.tp1Hit;
      appendToDemoLedger(h);
      return;
    }
  }
  history.push({ id, side, entry: null, result: outcome.result, exit: outcome.exit, why: outcome.why, R: +Number(outcome.R).toFixed(2), time: now, closeTime: outcome.closeTime || now, k: id + "|" + side + "|out|" + day, tp1Hit: outcome.tp1Hit });
}

function touchActives(now, barMap, history) {
  const day = dayKey(now);
  for (const id of Object.keys(STATE.active)) {
    const a = STATE.active[id];
    const bars = barMap && barMap[id];
    const hit = resolveFromBars(a, bars, now);
    if (hit) {
      applyOutcomeToHistory(history, id, a.side, day, hit, now);
      delete STATE.sent[id + "|" + a.side];
      delete STATE.active[id];
    } else {
      updateTrailingState(a, bars);
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
  const e = { t: now, dg: u[3], bars: bars.slice(-300).map(b => ({ time: b.time, high: b.high, low: b.low, close: b.close })) };
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

function isServerMarketOpen(u, nowSec) {
  const mkt = mktOf(u);
  if (mkt === "crypto") return true;
  const d = new Date((nowSec || Math.floor(Date.now() / 1000)) * 1000);
  const day = d.getUTCDay();
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (mkt === "forex" || mkt === "metal" || mkt === "commodity") {
    if (day === 0 || day === 6) return false;
    if (day === 5 && mins >= 1290) return false;
    return true;
  }
  if (mkt === "stock" || mkt === "index") {
    return day >= 1 && day <= 5 && mins >= 885 && mins <= 1255;
  }
  return true;
}

async function once(now) {
  const modes = enabledModes();
  const allRows = [];

  let history = [];
  try {
    const rawHistory = fs.readFileSync("history.json", "utf8");
    const parsed = JSON.parse(rawHistory);
    if (Array.isArray(parsed)) history = parsed;
    else if (parsed && Array.isArray(parsed.history)) history = parsed.history;
  } catch (e) {}

  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < U.length) {
      const u = U[i++];
      if (!u[1] && !u[2] && !(u[4] && TOK)) continue;

      try {
        const [a, m15, h] = await loadCached(u, now);
        const preset = getPreset(u[0]);
        const symbolDisabled = preset.enabled === false;
        const dataSrc = (a && a._src) || (DC.get(u[0]) && DC.get(u[0]).src) || (u[4] && TOK ? "oanda" : (u[1] ? "okx" : "yahoo"));

        if (a.length < 200) { // 🛠 آپدیت: نیاز به ۲۰۰ کندل
          allRows.push({ id: u[0], side: null, d: u[3], mkt: mktOf(u), fail: "No Data (Need 200 M5)", pass: 0, total: 7, mode: modes[0], u: u, checks: [] });
          continue;
        }

        const cl = dropForming(a, 300, now);
        const bt = cl.length ? cl[cl.length - 1].time : 0;
        const packCandles = (arr) => arr.slice(-210).map(c => [c.time, c.open, c.high, c.low, c.close]);

        if (!symbolDisabled && !isServerMarketOpen(u, now)) {
        allRows.push({ id: u[0], side: null, d: u[3], mkt: mktOf(u), fail: "بازار بسته / گپ بازگشایی", pass: 0, total: 0, mode: modes[0], u: u, src: dataSrc, bt, a: packCandles(a), m15: packCandles(m15), h: packCandles(h), checks: [] });
        continue;
      }
      if (symbolDisabled) {
          allRows.push({ id: u[0], side: null, d: u[3], mkt: mktOf(u), fail: "نماد برای سیگنال جدید غیرفعال است", pass: 0, total: 0, mode: modes[0], u, src: dataSrc, bt, a: packCandles(a), m15: packCandles(m15), h: packCandles(h), checks: [] });
          continue;
        }

        const probe = evaluate(u[0], a, m15, h, { ...preset, mode: "pattern", adx: false, trend: false, emax: false, nc: false, m15: false, h1: false, rsi: false, sessionFilter: false, signalIntervalSec: 300 }, now);
        let useMode = pickModeByAdx(probe.adx);
        if (!modes.includes(useMode)) useMode = modes[0];

        const opts = { ...preset, mode: useMode, m15: F15, h1: FH1, h1Strict: STRICT, rsi: RSI_ON, rsiL: preset.rangeRsiL ?? (process.env.RSI_L ? RSI_L : (preset.rsiL ?? RSI_L)), rsiS: preset.rangeRsiS ?? (process.env.RSI_S ? RSI_S : (preset.rsiS ?? RSI_S)), adx: true, pa: false, sessionFilter: useMode === "range" ? (preset.session !== false) : !!preset.session, signalIntervalSec: 300, trailingAtrMult: 0.5 };
        const r = evaluate(u[0], a, m15, h, opts, now);

        const blocked = r.side && isOpen(u[0]);
        const emitSide = blocked ? null : r.side;

        if (r.side) {
          allRows.push({
            id: u[0], side: emitSide, entry: r.entry, sl: r.sl, rsi: r.rsi, atr: r.atr, tp: r.tp, tp1R: r.tp1R, d: u[3], mkt: mktOf(u),
            pass: r.pass || 0, total: r.total || 7, bt: bt, mode: useMode, u: u, src: dataSrc,
            a: packCandles(a), _fullBars: a.slice(-210), m15: packCandles(m15), h: packCandles(h), checks: r.checks || [], 
            fail: blocked ? "سیگنال باز قبلی هنوز بسته نشده" : undefined
          });

          if (emitSide) {
            const lockKey = `${u[0]}|${r.side}|${bt}`; 
            const histKey = `${u[0]}|${r.side}|${dayKey(now)}`;
            const alreadySent = STATE.sent[lockKey] || STATE.sent[histKey];
            const alreadyOpen = isOpen(u[0]);
            if (!alreadySent && !alreadyOpen) {
              allRows[allRows.length - 1]._pendingNotify = true;
              allRows[allRows.length - 1]._checks = (r.checks || []).map(c => ({ l: c.l, o: c.ok ? 1 : 0 }));
              allRows[allRows.length - 1]._lockKey = lockKey;
              allRows[allRows.length - 1]._histKey = histKey;
            }
          }
        } else {
          allRows.push({
            id: u[0], side: null, d: u[3], mkt: mktOf(u), fail: r.fail || "خطای نامشخص",
            pass: r.pass || 0, total: r.total || 7, mode: useMode, u: u, src: dataSrc,
            a: packCandles(a), m15: packCandles(m15), h: packCandles(h), checks: r.checks || []
          });
        }
      } catch (e) {
        allRows.push({ id: u[0], side: null, d: u[3], mkt: mktOf(u), fail: "Error", pass: 0, total: 7, mode: modes[0], u: u, checks: [] });
      }
    }
  }));

  const barMap = {};
  allRows.forEach(r => {
    if (!r || !r.id || !r.a) return;
    barMap[r.id] = r._fullBars || (r.a || []).map(c => Array.isArray(c) ? { time: c[0], open: c[1], high: c[2], low: c[3], close: c[4] } : c); delete r._fullBars;
    if (r._src) barMap[r.id]._src = r._src;
  });

  try {
    const oandaBars = await fetchOandaBarsForActive(STATE.active);
    Object.keys(oandaBars).forEach(id => { barMap[id] = oandaBars[id]; barMap[id]._src = "oanda"; });
  } catch (e) {}
  
  touchActives(now, barMap, history);

  try {
    if (typeof filterCorrelated === "function") {
      const openGroups = new Set();
      if (typeof getCorrelationGroups === "function") {
        for (const openId of Object.keys(STATE.active || {})) {
          if (isOpen(openId)) {
            getCorrelationGroups(openId).forEach(g => openGroups.add(g));
          }
        }
      }
      const candidates = allRows.filter(r => {
        if (!r || !r.side) return false;
        if (typeof getCorrelationGroups === "function") {
          const rGroups = getCorrelationGroups(r.id);
          if (rGroups.some(g => openGroups.has(g))) {
            r.side = null;
            r.fail = "همبستگی با پوزیشن باز فعلی";
            return false;
          }
        }
        return true;
      });
      const kept = new Set(filterCorrelated(candidates).map(r => r.id + "|" + r.side));
      allRows.forEach(r => { if (r.side && !kept.has(r.id + "|" + r.side)) { r.side = null; r.fail = r.fail || "حذف به‌خاطر همبستگی"; } });
    }
  } catch (e) {}

  const MAX_NEW_PER_SCAN = 6;
  const pending = allRows.filter(r => r && r.side && r._pendingNotify)
    .sort((a, b) => ((b.pass || 0) / Math.max(1, b.total || 1)) - ((a.pass || 0) / Math.max(1, a.total || 1)));
  pending.forEach((r, i) => { if (i >= MAX_NEW_PER_SCAN) { r.side = null; r._pendingNotify = false; r.fail = "سقف سیگنال"; } });

  for (const row of allRows) {
    if (!row || !row.side || !row._pendingNotify) continue;
    const lockKey = row._lockKey || (row.id + "|" + row.side);
    const histKey = row._histKey || (row.id + "|" + row.side + "|" + dayKey(now));
    if (STATE.sent[lockKey] || STATE.sent[histKey] || isOpen(row.id)) { row._pendingNotify = false; continue; }
    
    STATE.sent[lockKey] = now; STATE.sent[histKey] = now;
    const rowPreset = getPreset(row.id);
    const barList = barMap[row.id] || [];
    const sigBar = barList.find(b => b.time === row.bt) || barList[barList.length - 1] || {};
    const isLongSig = row.side === "LONG";
    const execEntry = isLongSig ? (Number.isFinite(sigBar.askClose) ? sigBar.askClose : row.entry) : (Number.isFinite(sigBar.bidClose) ? sigBar.bidClose : row.entry);
    const riskDist = Math.abs(row.entry - row.sl);
    const execSl = isLongSig ? execEntry - riskDist : execEntry + riskDist;
    const spreadR = riskDist > 0 ? +(Math.abs(execEntry - row.entry) / riskDist).toFixed(3) : 0;
        const maxSpreadR = Number(rowPreset.maxSpreadR) > 0 ? Number(rowPreset.maxSpreadR) : 0.28;
        if (spreadR > maxSpreadR) {
            delete STATE.sent[lockKey];
            delete STATE.sent[histKey];
            row.side = null;
            row._pendingNotify = false;
            row.fail = "حذف به خاطر اسپرد بالا (" + spreadR + "R)";
            continue;
        }
    row.entry = execEntry; row.sl = execSl; row._spreadR = spreadR;
    openSig(row.id, row.side, execEntry, row.mode, now, { sl: execSl, tp: row.tp, d: row.d, bt: row.bt, atr: row.atr, policyOpts: { rangeTpMult: Number(row.tp1R) || Number(rowPreset.rangeTpMult) || 1.5, trailingAtrMult: 0.5 } });
    
    const checksData = row._checks || [];
    if (!history.some(h => h.id === row.id && h.side === row.side && (!Number.isFinite(Number(h.exit)) || dayKey(h.time) === dayKey(now)))) {
      history.push({ id: row.id, side: row.side, entry: row.entry, sl: row.sl, spreadR: row._spreadR || 0, rsi: row.rsi, time: now, bt: row.bt, k: histKey, d: row.d, mode: row.mode, src: row.src || "oanda", checks: checksData, totalConds: row.total });
    }
    
    const L = row.side === "LONG";
    const ageMin = Math.max(0, Math.round((now - ((row.bt || now) + 300)) / 60));
    if (ageMin > 15) { row._pendingNotify = false; continue; }
    
    const modeName = NAME[row.mode] || row.mode;
    const sent = await tg(
      "🌐 [پس‌زمینه] " + (L ? "🟢 LONG " : "🔴 SHORT ") + row.id + "\n" + modeName +
      "\nEntry " + fd(row.entry, row.d) + " | SL " + fd(row.sl, row.d) +
      "\nRSI " + fd(row.rsi, 1) + " | کندل " + ageMin + " دقیقه پیش\nخروج: " + (row.mode === "range" ? `حد سود ${fd(row.tp1R, 1)}R یا SL` : "Trailing 0.5 ATR یا واگرایی RSI"),
      TH_SIG
    );
    
    if (!sent && process.env.TELEGRAM_TOKEN) {
      delete STATE.sent[lockKey]; delete STATE.sent[histKey];
    } else {
      try {
        const riskDist = Math.abs(row.entry - row.sl);
        const tpVal = row.mode === 'range' ? (row.tp != null ? row.tp : (L ? row.entry + (Number(row.tp1R) || 1.5) * riskDist : row.entry - (Number(row.tp1R) || 1.5) * riskDist)) : '-';
        fs.writeFileSync("latest_signal.txt", row.id + "," + (L ? "BUY" : "SELL") + "," + fd(row.entry, row.d) + "," + fd(row.sl, row.d) + "," + fd(tpVal, row.d) + "," + now);
      } catch (e) {}
    }
    row._pendingNotify = false;
  }

  try { const n = await processAlerts(now); if (n) console.log(`Price alerts sent: ${n}`); } catch (e) {}
  for (const k of Object.keys(STATE.sent)) if (now - STATE.sent[k] > 2 * 86400) delete STATE.sent[k];

  const sevenDaysAgo = now - (7 * 24 * 3600);
  history = history.filter(h => h.time > sevenDaysAgo);
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
  const t0 = Date.now();
  for (;;) {
    try { await once(Date.now() / 1000); } catch (e) { console.error("scan failed", e.message); }
    if (!LOOP) break; 
    const elapsed = Date.now() - t0;
    if (elapsed >= LOOP * 1000) break;
    const wait = Math.min(IV, Math.max(0, LOOP * 1000 - elapsed));
    if (wait <= 0) break;
    await sleep(wait);
  }
  process.exit(0);
})();

if (require.main !== module) module.exports = { once, getState: () => STATE, setState: x => { STATE = x; } };
