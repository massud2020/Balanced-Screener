// Background scanner for GitHub Actions
// v41: Professional Strategy Logic + Corrected MT4 Output
const fs = require("fs"),
  { evaluate, dropForming, filterCorrelated, isInTradingSession } = require("./engine.js"),
  AL = require("./alerts.js");

const symbolsModule = require("./symbols.js");
const U = symbolsModule.U || (Array.isArray(symbolsModule) ? symbolsModule : []);

if (!Array.isArray(U) || U.length === 0) {
  console.error("[Fatal] No valid symbols array found in symbols.js.");
  process.exit(1); 
}

const TOK = process.env.OANDA_TOKEN, ENV = process.env.OANDA_ENV || "practice";
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
  const j = await J(`https://${h}.oanda.com/v3/instruments/${i}/candles?granularity=${g}&count=300&price=M`, {
    headers: { Authorization: "Bearer " + TOK }
  });
  return j.candles.map(c => ({
    time: Date.parse(c.time) / 1000, open: +Number(c.mid.o).toFixed(5), high: +Number(c.mid.h).toFixed(5), low: +Number(c.mid.l).toFixed(5), close: +Number(c.mid.c).toFixed(5)
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

async function tf(u, which) {
  const m = which === "5m";
  let a = [], src = null;
  if (u[4] && TOK) { try { a = await oanda(u[4], m ? "M5" : "H1"); if (a.length >= 50) { a._src = "oanda"; return a; } } catch (e) {} }
  if (u[1]) { try { a = await okx(u[1], m ? "5m" : "1H"); if (a.length) { a._src = "okx"; return a; } } catch (e) {} }
  if (u[2]) { try { const y = await yh(u[2], m ? "5m" : "1h", m ? "5d" : "6mo"); if (y.length > (a.length || 0)) { a = y; a._src = "yahoo"; } } catch (e) {} }
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

const DC = new Map(), slot5 = t => Math.floor((t - 20) / 300);
async function loadCached(u, now) {
  const c = DC.get(u[0]) || {};
  const backoff = c.fail && now - c.try5 < 120;
  const need5 = (!c.a || slot5(now) > slot5(c.t5)) && !backoff;
  const need1 = (!c.h || now - c.t1 > (u[1] ? 600 : 3300)) && !backoff;
  if (!need5 && !need1) return [c.a || [], c.h || []];
  const e = { ...c }; e.try5 = now;
  await Promise.all([
    need5 && tf(u, "5m").then(a => { if (a.length >= 50) { e.a = a; e.t5 = now; e.fail = 0; e.src = a._src || e.src; } else e.fail = (c.fail || 0) + 1; }).catch(() => { e.fail = (c.fail || 0) + 1; }),
    need1 && tf(u, "1h").then(h => { if (h.length) { e.h = h; e.t1 = now; e.src = h._src || e.src; } }).catch(() => {}),
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
  if (Date.now() / 1000 - a.time > MAX_HOLD_SEC) return false;
  return true;
}
function openSig(id, side, entry, mode, now, extra) {
  const e = extra || {};
  const risk = (e.sl != null && entry != null) ? Math.abs(entry - e.sl) : null;
  const tp1 = e.tp != null ? e.tp : (risk != null ? (side === "LONG" ? entry + 1.5 * risk : entry - 1.5 * risk) : null);
  STATE.active[id] = { side, entry, mode, time: now, sl: e.sl, tp: tp1, d: e.d, bt: e.bt, currentSl: e.sl, currentR: 0, tp1Hit: false };
}
function calcR(side, entry, sl, exitPx) {
  const risk = Math.abs(entry - sl);
  if (!risk || !isFinite(risk)) return 0;
  const L = side === "LONG";
  return (L ? (exitPx - entry) : (entry - exitPx)) / risk;
}

// 🛠 تابع محاسبه وضعیت داینامیک (Trailing & Partial)
function updateTrailingState(a, bars) {
  if (!bars || !bars.length) return;
  const risk = Math.abs(a.entry - a.sl);
  if (!risk) return;
  const start = a.bt || a.time;
  
  let trailSl = a.sl;
  let peakFav = 0;
  const trailAfterR = 1.0;
  let tp1Hit = a.tp1Hit || false;

  if (tp1Hit) trailSl = Math.max(trailSl, a.entry); // اگر TP1 خورد، SL به نقطه ورود می‌رود

  const ranges = bars.filter(b => b.time >= start).map(b => b.high - b.low).filter(x => x > 0);
  const atrEst = ranges.length ? ranges.slice(-14).reduce((s, x) => s + x, 0) / Math.min(14, ranges.length) : risk * 0.5;
  const trailDist = Math.max(1.2 * atrEst, 0.3 * risk);

  for (const b of bars) {
    if (b.time < start) continue;
    if (a.side === "LONG") {
      // Check TP1
      const tp1 = a.side === "LONG" ? a.entry + 1.5 * risk : a.entry - 1.5 * risk;
      if (!tp1Hit && b.high >= tp1) {
          tp1Hit = true;
          trailSl = Math.max(trailSl, a.entry);
      }

      const fav = (b.high - a.entry) / risk;
      if (fav > peakFav) peakFav = fav;
      if (fav >= trailAfterR && tp1Hit) { // فقط بعد از TP1 تریلینگ میکنیم
        const newSl = Math.max(trailSl, b.high - trailDist, a.entry);
        if (newSl > trailSl) trailSl = newSl;
      }
    } else {
      const tp1 = a.entry - 1.5 * risk;
      if (!tp1Hit && b.low <= tp1) {
          tp1Hit = true;
          trailSl = Math.min(trailSl, a.entry);
      }
      
      const fav = (a.entry - b.low) / risk;
      if (fav > peakFav) peakFav = fav;
      if (fav >= trailAfterR && tp1Hit) {
        const newSl = Math.min(trailSl, b.low + trailDist, a.entry);
        if (newSl < trailSl) trailSl = newSl;
      }
    }
  }
  
  a.currentSl = trailSl;
  a.tp1Hit = tp1Hit;
  
  const last = bars[bars.length - 1];
  if (last) {
    const liveR = calcR(a.side, a.entry, a.sl, last.close);
    // اگر TP1 خورده باشد، ۵۰٪ با 1.5R بسته شده و ۵۰٪ دیگر با R لحظه‌ای محاسبه می‌شود
    a.currentR = tp1Hit ? +((0.5 * 1.5) + (0.5 * liveR)).toFixed(2) : +liveR.toFixed(2);
  }
}

// 🛠 منطق خروج پله‌ای (Partial TP)
function resolveFromBars(a, bars, now) {
  if (!a || a.entry == null || a.sl == null || !bars || !bars.length) return null;
  const risk = Math.abs(a.entry - a.sl);
  if (!risk || !isFinite(risk)) return null;
  
  const tp1 = (a.side === "LONG" ? a.entry + 1.5 * risk : a.entry - 1.5 * risk);
  const finalTp = (a.side === "LONG" ? a.entry + 4.0 * risk : a.entry - 4.0 * risk);
  const start = a.bt || a.time;
  
  let trailSl = a.sl, peakFav = 0, tp1Hit = a.tp1Hit || false;
  const trailAfterR = 1.0;
  
  const ranges = bars.filter(b => b.time >= start).map(b => b.high - b.low).filter(x => x > 0);
  const atrEst = ranges.length ? ranges.slice(-14).reduce((s, x) => s + x, 0) / Math.min(14, ranges.length) : risk * 0.5;
  const trailDist = Math.max(1.2 * atrEst, 0.3 * risk);

  for (const b of bars) {
    if (b.time < start) continue;
    
    if (a.side === "LONG") {
      // 1. بررسی TP1
      if (!tp1Hit && b.high >= tp1) {
          tp1Hit = true;
          trailSl = Math.max(trailSl, a.entry); // SL -> BE
      }
      
      // 2. بررسی Target نهایی (R4)
      if (b.high >= finalTp) {
          const finalR = tp1Hit ? (0.5 * 1.5) + (0.5 * 4.0) : 4.0; 
          return { result: "win", exit: finalTp, why: "TP2", R: finalR, closeTime: b.time, tp1Hit: tp1Hit };
      }

      // 3. بررسی Trailing Stop / SL
      const fav = (b.high - a.entry) / risk;
      if (fav > peakFav) peakFav = fav;
      if (fav >= trailAfterR && tp1Hit) { 
        const newSl = Math.max(trailSl, b.high - trailDist, a.entry);
        if (newSl > trailSl) trailSl = newSl;
      }
      
      if (b.low <= trailSl) {
        if (tp1Hit) {
            const trailR = calcR(a.side, a.entry, a.sl, trailSl);
            const combinedR = (0.5 * 1.5) + (0.5 * trailR);
            return { result: combinedR >= 0 ? "win" : "loss", exit: trailSl, why: "TP1+TRAIL", R: combinedR, closeTime: b.time, tp1Hit: true };
        } else {
            return { result: "loss", exit: trailSl, why: "SL", R: -1, closeTime: b.time, tp1Hit: false };
        }
      }
    } else {
      // منطق SHORT (دقیقا مانند لانگ اما برعکس)
      if (!tp1Hit && b.low <= tp1) {
          tp1Hit = true;
          trailSl = Math.min(trailSl, a.entry);
      }
      if (b.low <= finalTp) {
          const finalR = tp1Hit ? (0.5 * 1.5) + (0.5 * 4.0) : 4.0;
          return { result: "win", exit: finalTp, why: "TP2", R: finalR, closeTime: b.time, tp1Hit: tp1Hit };
      }
      const fav = (a.entry - b.low) / risk;
      if (fav > peakFav) peakFav = fav;
      if (fav >= trailAfterR && tp1Hit) {
        const newSl = Math.min(trailSl, b.low + trailDist, a.entry);
        if (newSl < trailSl) trailSl = newSl;
      }
      if (b.high >= trailSl) {
        if (tp1Hit) {
            const trailR = calcR(a.side, a.entry, a.sl, trailSl);
            const combinedR = (0.5 * 1.5) + (0.5 * trailR);
            return { result: combinedR >= 0 ? "win" : "loss", exit: trailSl, why: "TP1+TRAIL", R: combinedR, closeTime: b.time, tp1Hit: true };
        } else {
            return { result: "loss", exit: trailSl, why: "SL", R: -1, closeTime: b.time, tp1Hit: false };
        }
      }
    }
  }
  
  const last = bars[bars.length - 1];
  const holdLimit = peakFav >= 1.0 ? (18 * 3600) : MAX_HOLD_SEC;
  if (last && now - a.time >= holdLimit) {
    let R = calcR(a.side, a.entry, a.sl, last.close);
    let why = "TIME";
    if (tp1Hit) {
        R = (0.5 * 1.5) + (0.5 * R);
        why = "TIME_PARTIAL";
    }
    return { result: R >= 0 ? "win" : "loss", exit: last.close, why: why, R: R, closeTime: last.time, tp1Hit: tp1Hit };
  }
  return null;
}

function applyOutcomeToHistory(history, id, side, day, outcome, now) {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.id === id && h.side === side && !h.result) {
      h.result = outcome.result; h.exit = outcome.exit; h.why = outcome.why; h.R = +Number(outcome.R).toFixed(2); h.closeTime = outcome.closeTime || now; h.tp1Hit = outcome.tp1Hit;
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
        const [a, h] = await loadCached(u, now);
        const dataSrc = (a && a._src) || (DC.get(u[0]) && DC.get(u[0]).src) || (u[4] && TOK ? "oanda" : (u[1] ? "okx" : "yahoo"));

        if (a.length < 50) {
          allRows.push({ id: u[0], side: null, d: u[3], mkt: mktOf(u), fail: "No Data", pass: 0, total: 7, mode: modes[0], u: u, checks: [] });
          continue;
        }

        const cl = dropForming(a, 300, now);
        const bt = cl.length ? cl[cl.length - 1].time : 0;
        const packCandles = (arr) => arr.slice(-210).map(c => [c.time, c.open, c.high, c.low, c.close]);

        const probe = evaluate(u[0], a, h, { mode: "pattern", adx: false, trend: false, emax: false, nc: false, pat: false, m15: false, h1: false, rsi: false }, now);
        let useMode = pickModeByAdx(probe.adx);
        if (!modes.includes(useMode)) useMode = modes[0];

        const opts = { mode: useMode, m15: F15, h1: FH1, h1Strict: STRICT, rsi: RSI_ON, rsiL: RSI_L, rsiS: RSI_S, adx: false };
        const r = evaluate(u[0], a, h, opts, now);

        const blocked = r.side && isOpen(u[0]);
        const emitSide = blocked ? null : r.side;

        if (r.side) {
          allRows.push({
            id: u[0], side: emitSide, entry: r.entry, sl: r.sl, rsi: r.rsi, d: u[3], mkt: mktOf(u),
            pass: r.pass || 0, total: r.total || 7, bt: bt, mode: useMode, u: u, src: dataSrc,
            a: packCandles(a), h: packCandles(h), checks: r.checks || [], 
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
            a: packCandles(a), h: packCandles(h), checks: r.checks || []
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
    barMap[r.id] = (r.a || []).map(c => Array.isArray(c) ? { time: c[0], open: c[1], high: c[2], low: c[3], close: c[4] } : c);
    if (r._src) barMap[r.id]._src = r._src;
  });

  try {
    const oandaBars = await fetchOandaBarsForActive(STATE.active);
    Object.keys(oandaBars).forEach(id => { barMap[id] = oandaBars[id]; barMap[id]._src = "oanda"; });
  } catch (e) {}
  
  touchActives(now, barMap, history);

  try {
    if (typeof filterCorrelated === "function") {
      const active = allRows.filter(r => r && r.side);
      const kept = new Set(filterCorrelated(active).map(r => r.id + "|" + r.side));
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
    openSig(row.id, row.side, row.entry, row.mode, now, { sl: row.sl, tp: row.tp, d: row.d, bt: row.bt });
    
    const checksData = row._checks || [];
    if (!history.some(h => h.id === row.id && h.side === row.side && dayKey(h.time) === dayKey(now))) {
      history.push({ id: row.id, side: row.side, entry: row.entry, sl: row.sl, rsi: row.rsi, time: now, bt: row.bt, k: histKey, d: row.d, mode: row.mode, src: row.src || "oanda", checks: checksData, totalConds: row.total });
    }
    
    const L = row.side === "LONG";
    const ageMin = Math.max(0, Math.round((now - ((row.bt || now) + 300)) / 60));
    if (ageMin > 15) { row._pendingNotify = false; continue; }
    
    const modeName = NAME[row.mode] || row.mode;
    const sent = await tg(
      "🌐 [پس‌زمینه] " + (L ? "🟢 LONG " : "🔴 SHORT ") + row.id + "\n" + modeName +
      "\nEntry " + fd(row.entry, row.d) + " | SL " + fd(row.sl, row.d) +
      "\nRSI " + fd(row.rsi, 1) + " | کندل " + ageMin + " دقیقه پیش\nخروج: " + (row.mode === "range" ? "حد سود 1.5R یا SL" : "50% در 1.5R + مابقی در 4R (تریلینگ)"),
      TH_SIG
    );
    
    if (!sent && process.env.TELEGRAM_TOKEN) {
      delete STATE.sent[lockKey]; delete STATE.sent[histKey];
    } else {
      try {
        const riskDist = Math.abs(row.entry - row.sl);
        const tpVal = row.tp != null ? row.tp : (L ? row.entry + 1.5 * riskDist : row.entry - 1.5 * riskDist);
        fs.writeFileSync("latest_signal.txt", row.id + "," + (L ? "BUY" : "SELL") + "," + fd(row.entry, row.d) + "," + fd(row.sl, row.d) + "," + fd(tpVal, row.d) + "," + now);
      } catch (e) {}
    }
    row._pendingNotify = false;
  }

  try { const n = await processAlerts(now); if (n) console.log(`Price alerts sent: ${n}`); } catch (e) {}
  for (const k of Object.keys(STATE.sent)) if (now - STATE.sent[k] > 2 * 86400) delete STATE.sent[k];

  const threeDaysAgo = now - (3 * 24 * 3600);
  history = history.filter(h => h.time > threeDaysAgo);
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
