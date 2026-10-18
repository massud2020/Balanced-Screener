// Background scanner for GitHub Actions: scans all symbols, sends ntfy.sh push alerts.
const fs = require("fs"),
  { evaluate, dropForming } = require("./engine.js"),
  { U } = require("./symbols.js"),
  AL = require("./alerts.js");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN,
  TOK = process.env.OANDA_TOKEN,
  ENV = process.env.OANDA_ENV || "practice";
const F15 = process.env.M15 !== "0",
  FH1 = process.env.H1 !== "0",
  STRICT = process.env.H1_STRICT === "1";
const MODES = (process.env.MODES || "pattern")
  .split(",").map(x => x.trim()).filter(x => x === "pattern");
if (!MODES.length) MODES.push("pattern");

function enabledModes() {
  let m = MODES;
  try {
    const c = { strategies: {} };
    if (c && c.strategies && typeof c.strategies === "object")
      m = m.filter(x => c.strategies[x] !== false);
  } catch (e) {}
  return m;
}

const MK_LABEL = { crypto: "کریپتو", forex: "فارکس", metal: "فلزات", commodity: "کالا", index: "شاخص", stock: "سهام" },
  METALS = new Set(["XAUUSD", "XAGUSD", "XCUUSD"]),
  COMMS = new Set(["WTICO", "BRENT", "NATGAS", "CORN", "WHEAT", "SOYBEAN", "SUGAR"]),
  INDS = new Set(["SPX500", "NAS100", "US30", "US2000", "DE30", "UK100", "FR40", "EU50", "JP225", "HK33", "AU200"]);
const mktOf = u => u[1] ? "crypto" : METALS.has(u[0]) ? "metal" : COMMS.has(u[0]) ? "commodity" : INDS.has(u[0]) ? "index" : (u[4] && u[4] !== 0) ? "forex" : "stock";
const NAME = { pattern: "الگوی ۳+۱" },
  MAXAGE = 1200,
  SF = ".state/sent.json",
  AF = ".state/alerts.json";

async function J(url, o = {}) {
  const r = await fetch(url, { ...o, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

// ---------- OKX ----------
const okx = async (id, bar) => {
  const j = await J(`https://www.okx.com/api/v5/market/candles?instId=${id}&bar=${bar}&limit=300`);
  if (j.code !== "0") return [];
  return j.data.map(r => ({
    time: +r[0] / 1000, open: +r[1], high: +r[2], low: +r[3], close: +r[4]
  })).sort((a, b) => a.time - b.time);
};

// ---------- OANDA ----------
const oanda = async (i, g) => {
  const h = ENV === "live" ? "api-fxtrade" : "api-fxpractice";
  const j = await J(`https://${h}.oanda.com/v3/instruments/${i}/candles?granularity=${g}&count=300&price=M`, {
    headers: { Authorization: "Bearer " + TOK }
  });
  return j.candles.map(c => ({
    time: Date.parse(c.time) / 1000, open: +c.mid.o, high: +c.mid.h, low: +c.mid.l, close: +c.mid.c
  })).filter(c => isFinite(c.close));
};

// ---------- CoinGecko (بدون API key) ----------
const CG_MAP = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple",
  BNB: "binancecoin", ADA: "cardano", DOGE: "dogecoin", AVAX: "avalanche-2",
  LINK: "chainlink", LTC: "litecoin", SUI: "sui", DOT: "polkadot",
  MATIC: "matic-network", TRX: "tron", TON: "the-open-network", SHIB: "shiba-inu",
  PEPE: "pepe", APT: "aptos", NEAR: "near", ATOM: "cosmos",
  ARB: "arbitrum", OP: "optimism", INJ: "injective-protocol",
  FIL: "filecoin", ICP: "internet-computer", HBAR: "hedera-hashgraph",
  VET: "vechain", ALGO: "algorand", FTM: "fantom", SAND: "the-sandbox",
  MANA: "decentraland", AXS: "axie-infinity", GRT: "the-graph",
  AAVE: "aave", UNI: "uniswap", MKR: "maker", COMP: "compound-governance-token",
  CRV: "curve-dao-token", SNX: "havven", "1INCH": "1inch",
  RUNE: "thorchain", KAVA: "kava", ZEC: "zcash", XMR: "monero",
  DASH: "dash", ETC: "ethereum-classic", XLM: "stellar",
  EOS: "eos", NEO: "neo", IOTA: "iota", QTUM: "qtum",
  WAVES: "waves", ZIL: "zilliqa", BAT: "basic-attention-token",
  ENJ: "enjincoin", CHZ: "chiliz", GALA: "gala", APE: "apecoin",
  LDO: "lido-dao", IMX: "immutable-x", STX: "blockstack",
  RNDR: "render-token", FLOKI: "floki", BONK: "bonk",
  WIF: "dogwifcoin", JUP: "jupiter-exchange-solana",
  PYTH: "pyth-network", JTO: "jito-governance-token",
  WLD: "worldcoin-wld", SEI: "sei-network", TIA: "celestia",
};

function cgId(sym) {
  const s = String(sym).toUpperCase().replace(/USDT$|USDC$|BUSD$|USD$/i, "");
  return CG_MAP[s] || s.toLowerCase();
}

async function cgPrice(sym) {
  try {
    const id = cgId(sym);
    const j = await J(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    const p = j?.[id]?.usd;
    return typeof p === "number" ? p : null;
  } catch (e) { return null; }
}

async function cgOHLC(sym, days = 1) {
  try {
    const id = cgId(sym);
    const j = await J(`https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`);
    if (!Array.isArray(j)) return [];
    return j.map(r => ({
      time: Math.floor(r[0] / 1000),
      open: +r[1], high: +r[2], low: +r[3], close: +r[4],
    }));
  } catch (e) { return []; }
}

// ---------- Yahoo ----------
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
let YC = null;

async function yahooAuth() {
  if (YC && Date.now() - YC.t < 30 * 60 * 1000) return YC;
  const r1 = await fetch("https://fc.yahoo.com/", {
    headers: { "User-Agent": UA },
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  const setCookie = r1.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  if (!cookie) throw new Error("yahoo: no cookie");
  const r2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
    signal: AbortSignal.timeout(10000),
  });
  const crumb = (await r2.text()).trim();
  if (!crumb) throw new Error("yahoo: no crumb");
  YC = { cookie, crumb, t: Date.now() };
  return YC;
}

async function yhOnce(sy, iv, rg, host, auth) {
  const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sy)}?interval=${iv}&range=${rg}&includePrePost=false&crumb=${encodeURIComponent(auth.crumb)}`;
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", Cookie: auth.cookie },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 401 || r.status === 403) throw new Error("yahoo auth " + r.status);
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

async function yh(sy, iv, rg) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const auth = await yahooAuth();
      for (const host of ["query1", "query2"]) {
        try { return await yhOnce(sy, iv, rg, host, auth); }
        catch (e) {
          lastErr = e;
          if (/auth/.test(e.message)) { YC = null; break; }
        }
      }
    } catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
  }
  throw lastErr || new Error("yahoo failed");
}

// ---------- tf: همه منابع با fallback ----------
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
  // CoinGecko fallback (فقط کریپتو)
  if (a.length < 50 && (!u[1] || u[5] === "crypto")) {
    try {
      const cg = await cgOHLC(u[0], m ? 1 : 7);
      if (cg.length > a.length) a = cg;
    } catch (e) {}
  }
  return a;
}

// ---------- cache ----------
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
    need5 && tf(u, "5m").then(a => {
      if (a.length >= 50) { e.a = a; e.t5 = now; e.fail = 0; }
      else e.fail = (c.fail || 0) + 1;
    }).catch(() => { e.fail = (c.fail || 0) + 1; }),
    need1 && tf(u, "1h").then(h => { if (h.length) { e.h = h; e.t1 = now; } }).catch(() => {}),
  ]);
  DC.set(u[0], e);
  return [e.a || [], e.h || []];
}

// loadM5 برای هشدارهای قیمت
async function loadM5(u) {
  let a = [];
  if (u[1]) { try { a = await okx(u[1], "5m"); } catch (e) {} }
  else if (u[4] && TOK) { try { a = await oanda(u[4], "M5"); } catch (e) {} }
  if (a.length < 2 && u[2]) { try { a = await yh(u[2], "5m", "1d"); } catch (e) {} }
  // CoinGecko OHLC
  if (a.length < 2) { try { a = await cgOHLC(u[0], 1); } catch (e) {} }
  // آخرین تلاش: قیمت لحظه‌ای
  if (a.length < 2) {
    const p = await cgPrice(u[0]);
    if (p) {
      const now = Math.floor(Date.now() / 1000);
      a = [{ time: now - 300, open: p, high: p, low: p, close: p }];
    }
  }
  return a;
}

function readAlerts() {
  try {
    const c = JSON.parse(fs.readFileSync("alerts.json", "utf8"));
    return { tz: typeof c.tz === "string" ? c.tz : "UTC", alerts: Array.isArray(c.alerts) ? c.alerts : [] };
  } catch (e) { return { tz: "UTC", alerts: [] }; }
}

async function notify(title, message, priority = 5, tags = [], threadId = null) {
  const TOKEN = process.env.TELEGRAM_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT_ID) {
    console.log("Telegram credentials missing. Skip.");
    return;
  }
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  
  // ۱. پاک‌سازی ورودی‌ها (حذف فاصله‌های احتمالی)
  const cleanChatId = String(CHAT_ID).trim();
  const cleanThreadId = threadId ? parseInt(String(threadId).trim(), 10) : undefined;

  // ۲. ساخت پیام بدون فرمت HTML (برای جلوگیری از خطای 400)
  const payload = {
    chat_id: cleanChatId,
    text: title + "\n\n" + message
  };
  
  if (cleanThreadId && !isNaN(cleanThreadId)) {
    payload.message_thread_id = cleanThreadId;
  }

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  
  if (!r.ok) {
    // ۳. چاپ دقیق خطای تلگرام در لاگ‌ها
    const errData = await r.text();
    throw new Error("Telegram " + r.status + " - " + errData);
  }
}

const LOOP = +(process.env.LOOP_SECONDS || 0),
  IV = +(process.env.INTERVAL || 60) * 1000,
  sleep = ms => new Promise(r => setTimeout(r, ms));

async function once(sent, ast) {
  const now = Date.now() / 1000, modes = enabledModes();
  if (modes.length) await signals(sent, modes, now, ast);
  else console.log(`${new Date().toISOString()} all strategies muted`);
  await priceAlerts(ast, now);
  fs.mkdirSync(".state", { recursive: true });
  fs.writeFileSync(SF, JSON.stringify(sent));
  fs.writeFileSync(AF, JSON.stringify(ast));
}

async function priceAlerts(ast, now) {
  const cfg = readAlerts();
  const list = cfg.alerts.filter(a => a && a.on !== false && a.id && a.sym && !AL.validate(a));
  if (!list.length) return;
  const data = {}, units = {};
  for (const a of list) {
    const s = String(a.sym).toUpperCase();
    a.sym = s;
    units[s] = units[s] || AL.resolve(s, U);
  }
  await Promise.all(Object.keys(units).map(async s => {
    const u = units[s];
    let a = null;
    const c = DC.get(s);
    if (c && c.a && c.t5 && now - c.t5 < 50) a = c.a;
    if (!a) { try { a = await loadM5(u); } catch (e) { a = []; } }
    if (a && a.length) data[s] = { bars: a, dg: u[3] };
  }));
  const fired = AL.check(list, data, now, ast, cfg.tz);
  console.log(`${new Date().toISOString()} price alerts: ${list.length} active, symbols ${Object.keys(data).length}, fired ${fired.length}`);
  for (const f of fired) {
    try {
      await notify(f.title, f.text, f.kind === "price" ? 4 : 3, [f.kind === "price" ? "bell" : f.kind === "every" ? "stopwatch" : "alarm_clock"], process.env.TELEGRAM_ALERT_THREAD_ID);
    } catch (e) {
      console.error("alert notify failed", e.message);
    }
  }
}

async function healthWarn(ast, hs, now) {
  ast.health = ast.health || {};
  const hit = Object.keys(hs).filter(m => {
    const x = hs[m];
    return x.n >= 3 && x.bad.length / x.n >= .7 && !(ast.health[m] && now - ast.health[m] < 6 * 3600);
  });
  if (!hit.length) return;
  const yahoo = hit.some(m => m !== "crypto");
  const lines = hit.map(m => `${MK_LABEL[m]}: ${hs[m].bad.length} از ${hs[m].n} نماد داده نداد`).join("\n");
  const hint = (yahoo ? "منبع فارکس/فلزات/کالا/شاخص/سهام Yahoo است و احتمالاً محدود شده." : "") +
    (hit.includes("crypto") ? (yahoo ? "\n" : "") + "OKX/CoinGecko پاسخ نداد." : "");
  try {
    await notify("⚠ منبع داده مشکل دارد", `${lines}\n${hint}`, 3, ["warning"]);
    for (const m of hit) ast.health[m] = now;
  } catch (e) {}
}

async function signals(sent, modes, now, ast) {
  for (const k of Object.keys(sent)) if (now - sent[k] > 86400) delete sent[k];
  const found = [], hs = {};
  let i = 0, errs = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < U.length) {
      const u = U[i++];
      if (!u[1] && !u[2] && !(u[4] && TOK)) continue;
      try {
        const [a, h] = await loadCached(u, now), m = mktOf(u), hm = hs[m] || (hs[m] = { n: 0, bad: [] });
        hm.n++;
        if (a.length < 50 || (DC.get(u[0]) || {}).fail > 0) hm.bad.push(u[0]);
        if (a.length < 50) { errs++; continue; }
        const cl = dropForming(a, 300, now);
        if (!cl.length) continue;
        const bt = cl[cl.length - 1].time, age = now - (bt + 300);
        if (age > MAXAGE) continue;
        for (const mode of modes) {
          const r = evaluate(u[0], a, h, { mode, m15: F15, h1: FH1, h1Strict: STRICT }, now);
          if (r.side) found.push({ u, mode, r, bt, age, key: `${u[0]}|${mode}|${r.side}|${bt}` });
        }
      } catch (e) { errs++; }
    }
  }));
  const fresh = found.filter(f => !sent[f.key]).sort((a, b) => a.u[0].localeCompare(b.u[0]));
  {
    const parts = Object.keys(hs).map(m => `${m} ${hs[m].n - hs[m].bad.length}/${hs[m].n}`);
    console.log(`${new Date().toISOString()} data health: ${parts.join(" · ")}` +
      Object.keys(hs).filter(m => hs[m].bad.length)
        .map(m => `\n   ${m} failed: ${hs[m].bad.slice(0, 10).join(",")}${hs[m].bad.length > 10 ? " …" : ""}`).join(""));
    await healthWarn(ast, hs, now);
  }
  console.log(`${new Date().toISOString()} modes ${modes.join("+")}, symbols ${U.length}, errors ${errs}, signals ${found.length}, new ${fresh.length}`);
  let n = 0;
  for (const f of fresh) {
    if (n >= 10) break;
    const { u, mode, r } = f, L = r.side === "LONG", d = u[3];
    try {
      await notify(`🌐 [پس‌زمینه] ${L ? "🟢 LONG" : "🔴 SHORT"} ${u[0]}`,
        `${NAME[mode]}\nEntry ${r.entry.toFixed(d)} | SL ${r.sl.toFixed(d)}\nRSI ${r.rsi.toFixed(1)} | کندل ${Math.max(0, Math.round(f.age / 60))} دقیقه پیش بسته شد\nخروج: اولین واگرایی RSI`,
        5, [L ? "green_circle" : "red_circle", "chart_with_upwards_trend"], process.env.TELEGRAM_SIGNAL_THREAD_ID
      );
      sent[f.key] = now;
      n++;
      // 📝 ذخیره آخرین سیگنال برای ربات MT5
      try {
        const mt5Data = `${u[0]},${L?"BUY":"SELL"},${r.entry.toFixed(d)},${r.sl.toFixed(d)},0,${now}`;
        fs.writeFileSync("latest_signal.txt", mt5Data);
      } catch(e) { console.log("MT5 File Write Error:", e); }
    } catch (e) { console.error("notify failed", e.message); }
  }
  if (fresh.length > 10) {
    try {
      await notify("سیگنال‌های بیشتر", `${fresh.length - 10} سیگنال دیگر هم هست؛ اپ را باز کنید.`, 3, ["information_source"]);
      for (const f of fresh.slice(10)) sent[f.key] = now;
    } catch (e) {}
  }
}

if (typeof module !== "undefined") module.exports = { loadCached, DC, tf, slot5, mktOf, cgPrice, cgOHLC, cgId };

if (require.main === module) (async () => {
  if (!TELEGRAM_TOKEN) { console.error("TELEGRAM_TOKEN is not set"); process.exit(1); }
  if (process.env.TEST === "1") {
    await notify("تست اسکرینر", "اعلان‌ها درست کار می‌کنند ✅", 3, ["white_check_mark"]);
    console.log("test sent");
    return;
  }
  let sent = {}, ast = {};
  try { sent = JSON.parse(fs.readFileSync(SF, "utf8")); } catch (e) {}
  try { ast = JSON.parse(fs.readFileSync(AF, "utf8")); } catch (e) {}
  const t0 = Date.now();
  let k = 0;
  for (;;) {
    try { await once(sent, ast); } catch (e) { console.error("scan failed", e.message); }
    if (!LOOP) break;
    k++;
    const next = t0 + k * IV;
    if (next - t0 > LOOP * 1000) break;
    const w = next - Date.now();
    if (w > 0) await sleep(w);
  }
})().catch(e => { console.error(e); process.exit(1); });
