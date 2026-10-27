// Background scanner for GitHub Actions
const fs = require("fs"),
  { evaluate, dropForming } = require("./engine.js"), 
  { U } = require("./symbols.js");

const TOK = process.env.OANDA_TOKEN,
  ENV = process.env.OANDA_ENV || "practice";

const F15 = process.env.M15 !== "0";
const FH1 = process.env.H1 !== "0";
const RSI_ON = process.env.RSI !== "0";
const RSI_L = +(process.env.RSI_L || 40);
const RSI_S = +(process.env.RSI_S || 60);
const STRICT = process.env.H1_STRICT === "1";

const MODES = (process.env.MODES || "pattern").split(",").map(x => x.trim()).filter(x => x === "pattern");
if (!MODES.length) MODES.push("pattern");
function enabledModes() { return MODES; }

const METALS = new Set(["XAUUSD", "XAGUSD", "XCUUSD"]),
  COMMS = new Set(["WTICO", "BRENT", "NATGAS", "CORN", "WHEAT", "SOYBEAN", "SUGAR"]),
  INDS = new Set(["SPX500", "NAS100", "US30", "US2000", "DE30", "UK100", "FR40", "EU50", "JP225", "HK33", "AU200"]);
const mktOf = u => u[1] ? "crypto" : METALS.has(u[0]) ? "metal" : COMMS.has(u[0]) ? "commodity" : INDS.has(u[0]) ? "index" : (u[4] && u[4] !== 0) ? "forex" : "stock";
const NAME = { pattern: "الگوی ۳+۱" };

async function J(url, o = {}) {
  const r = await fetch(url, { ...o, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

const okx = async (id, bar) => {
  const j = await J(`https://www.okx.com/api/v5/market/candles?instId=${id}&bar=${bar}&limit=300`);
  if (j.code !== "0") return [];
  return j.data.map(r => ({ time: +r[0] / 1000, open: +r[1], high: +r[2], low: +r[3], close: +r[4] })).sort((a, b) => a.time - b.time);
};

const oanda = async (i, g) => {
  const h = ENV === "live" ? "api-fxtrade" : "api-fxpractice";
  const j = await J(`https://${h}.oanda.com/v3/instruments/${i}/candles?granularity=${g}&count=300&price=M`, {
    headers: { Authorization: "Bearer " + TOK }
  });
  return j.candles.map(c => ({ time: Date.parse(c.time) / 1000, open: +c.mid.o, high: +c.mid.h, low: +c.mid.l, close: +c.mid.c })).filter(c => isFinite(c.close));
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
      o.push({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] });
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

async function notify(title, message) {
  const TOKEN = process.env.TELEGRAM_TOKEN, CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: String(CHAT_ID).trim(), text: title + "\n\n" + message })
  }).catch(() => {});
}

const LOOP = +(process.env.LOOP_SECONDS || 0), IV = +(process.env.INTERVAL || 60) * 1000, sleep = ms => new Promise(r => setTimeout(r, ms));

async function once(now) {
  const modes = enabledModes();
  const allRows = [];
  
  let history = [];
  try {
    const rawHistory = fs.readFileSync("history.json", "utf8");
    const parsed = JSON.parse(rawHistory);
    if (Array.isArray(parsed)) {
      history = parsed; 
    } else if (parsed && Array.isArray(parsed.history)) {
      history = parsed.history;
    }
  } catch(e) {
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
            continue;
        }
        
        const cl = dropForming(a, 300, now);
        const bt = cl.length ? cl[cl.length - 1].time : 0;
        
        let foundSignal = false;
        
        for (const mode of modes) {
          const opts = { mode, m15: F15, h1: FH1, h1Strict: STRICT, rsi: RSI_ON, rsiL: RSI_L, rsiS: RSI_S };
          const r = evaluate(u[0], a, h, opts, now);
          
          if (r.side) {
            foundSignal = true;
            const dataRow = {
                id: u[0], side: r.side, entry: r.entry, sl: r.sl, rsi: r.rsi, d: u[3], mkt: mktOf(u),
                pass: r.total || 7, total: r.total || 7, bt: bt, mode: mode, u: u,
                a: a.slice(-210), h: h.slice(-210) // 🛠️ کاهش به ۲۱۰ برای حجم کمتر
            };
            allRows.push(dataRow);
            
            const L = r.side === "LONG";
            const checksData = (r.checks || []).map(c => ({ l: c.l, o: c.ok ? 1 : 0 }));
            
            history.push({
                id: u[0], side: r.side, entry: r.entry, sl: r.sl, rsi: r.rsi, time: now, d: u[3],
                checks: checksData, totalConds: r.total 
            });
            
            await notify(`🌐 ${L ? "🟢 LONG" : "🔴 SHORT"} ${u[0]}`, `${NAME[mode]}\nEntry ${r.entry.toFixed(u[3])} | SL ${r.sl.toFixed(u[3])}\nRSI ${r.rsi.toFixed(1)}`);
            fs.writeFileSync("latest_signal.txt", `${u[0]},${L?"BUY":"SELL"},${r.entry.toFixed(u[3])},${r.sl.toFixed(u[3])},0,${now}`);
          }
        }
        
        if (!foundSignal) {
            const opts = { mode: modes[0], m15: F15, h1: FH1, h1Strict: STRICT, rsi: RSI_ON, rsiL: RSI_L, rsiS: RSI_S };
            const r = evaluate(u[0], a, h, opts, now);
            
            allRows.push({ 
                id: u[0], side: null, d: u[3], mkt: mktOf(u), 
                fail: r.fail || "خطای نامشخص", 
                pass: r.pass || 0, 
                total: r.total || 7,
                mode: modes[0], u: u,
                a: a.slice(-210), h: h.slice(-210) // 🛠️ کاهش به ۲۱۰ برای حجم کمتر
            });
        }
      } catch (e) {
          allRows.push({ id: u[0], side: null, d: u[3], mkt: mktOf(u), fail: "Error", pass: 0, total: 7, mode: modes[0], u: u });
      }
    }
  }));
  
  const threeDaysAgo = now - (3 * 24 * 3600);
  history = history.filter(h => h.time > threeDaysAgo);
  
  fs.writeFileSync("data.json", JSON.stringify({ time: Date.now(), rows: allRows }));
  fs.writeFileSync("history.json", JSON.stringify({ time: Date.now(), history: history }));
  
  console.log(`Scan complete. Found ${allRows.filter(r => r.side).length} valid signals.`);
}

if (require.main === module) (async () => {
  const t0 = Date.now();
  let k = 0;
  for (;;) {
    try { await once(Date.now() / 1000); } catch (e) { console.error("scan failed", e.message); }
    if (!LOOP) break;
    k++;
    const next = t0 + k * IV;
    if (next - t0 > LOOP * 1000) break;
    const w = next - Date.now();
    if (w > 0) await sleep(w);
  }
})().catch(e => { console.error(e); process.exit(1); });
