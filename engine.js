// Port of src/lib/strategy/engine.ts (Dual Strategy: Trend & Range) - Improved v46
const DEF = {
  mode: "pattern",
  trend: true,
  emax: true,
  nc: true,
  pat: true,
  adx: false,           // فیلتر سخت ADX خاموش؛ برای رژیم جداگانه استفاده می‌شود
  adxMin: 22,           // اگر adx روشن شود
  adxSoft: false,       // فیلتر نرم ADX (اختیاری — پیش‌فرض خاموش)
  adxSoftMin: 18,       // حداقل ADX برای فیلتر نرم
  m15: true,
  h1: true,
  h1Strict: false,
  rsi: true,
  rsiL: 38,             // پولبک عمیق‌تر
  rsiS: 62,
  ef: 21,
  em: 50,
  es: 200,
  rsiP: 14,
  minRatio: 0.52,       // متعادل: کیفیت خوب بدون خشکی کامل
  atrP: 14,
  bbP: 20,
  bbDev: 2,

  maxDistATR: 3.0,      // ✨ v46: از 2.6 به 3.0 افزایش یافت (اجازه فاصله بیشتر)
  swingLook: 10,
  atrMultSL: 2.0,
  minSlAtr: 1.35,       // کف SL معقول
  spreadAtr: 0.40,      // بافر اسپرد واقعی‌تر
  tpR: 2.0,             // حد سود ثابت ۲R
  exitMode: "tp_r",     // tp_r | rsi_div
  useConfluence: false,
  minConfluence: 7,
  requirePaStrong: true, // engulf / pin / classic اجباری
  minPaScore: 2.0,      // ✨ v46: از 2.2 به 2.0 کاهش یافت (پترن‌های بیشتری قبول می‌شوند)
  minSlopeAtr: 0.010,   // ✨ v46: از 0.02 به 0.01 کاهش یافت (شیب ضعیف‌تر قبول می‌شود)
  sessionFilter: true,  // فیلتر سشن جفت‌ارز
  d1Filter: false,      // پیش‌فرض خاموش
  rangeLookback: 96,    // ≈۸ ساعت M5
  rangeAdxMax: 20,
  rangeMinATR: 3.0,
  rangeMinTouches: 3,
  rangeRsiL: 32,
  rangeRsiS: 68,
  rangeMinRR: 1.6,
  rangeMaxRiskATR: 2.8,
  rangeH1: true,
  rangeTouchPct: 0.12,
  rangeRequireVol: false,
  rangeVolMult: 1.10,
  trailAfterR: 1.0,
  trailAtr: 1.2,
  maxHoldSoftSec: 6 * 3600,
  maxHoldStrongSec: 18 * 3600
}
const ENGINE_VER = 46; // ✨ v46

function ema(v, p) {
  const o = Array(v.length).fill(null);
  if (v.length < p) return o;
  const k = 2 / (p + 1);
  let s = 0;
  for (let i = 0; i < p; i++) s += v[i];
  let pr = s / p;
  o[p - 1] = pr;
  for (let i = p; i < v.length; i++) {
    pr = v[i] * k + pr * (1 - k);
    o[i] = pr;
  }
  return o;
}

function rsi(c, p) {
  const o = Array(c.length).fill(null);
  if (c.length <= p) return o;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) {
    const d = c[i] - c[i - 1];
    d >= 0 ? g += d : l -= d;
  }
  let ag = g / p, al = l / p;
  o[p] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = p + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p;
    al = (al * (p - 1) + (d < 0 ? -d : 0)) / p;
    o[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return o;
}

function atr(cs, p) {
  const o = Array(cs.length).fill(null);
  if (cs.length <= p) return o;
  const tr = cs.map((c, i) => i
    ? Math.max(c.high - c.low, Math.abs(c.high - cs[i - 1].close), Math.abs(c.low - cs[i - 1].close))
    : c.high - c.low);
  let s = 0;
  for (let i = 0; i < p; i++) s += tr[i];
  let pr = s / p;
  o[p - 1] = pr;
  for (let i = p; i < tr.length; i++) {
    pr = (pr * (p - 1) + tr[i]) / p;
    o[i] = pr;
  }
  return o;
}

function sma(v, p) {
  const o = Array(v.length).fill(null);
  if (v.length < p) return o;
  let s = 0;
  for (let i = 0; i < p; i++) s += v[i];
  o[p - 1] = s / p;
  for (let i = p; i < v.length; i++) {
    s = s - v[i - p] + v[i];
    o[i] = s / p;
  }
  return o;
}

function stdDev(v, p) {
  const m = sma(v, p);
  const o = Array(v.length).fill(null);
  for (let i = p - 1; i < v.length; i++) {
    let s = 0;
    for (let j = 0; j < p; j++) s += Math.pow(v[i - j] - m[i], 2);
    o[i] = Math.sqrt(s / p);
  }
  return o;
}

function adx(cs, p = 14) {
  const n = cs.length;
  const out = Array(n).fill(null);
  if (n < p * 2 + 1) return out;
  const tr = [], pdm = [], ndm = [];
  for (let i = 1; i < n; i++) {
    const h = cs[i].high, l = cs[i].low, ph = cs[i - 1].high, pl = cs[i - 1].low, pc = cs[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const up = h - ph, dn = pl - l;
    pdm.push(up > dn && up > 0 ? up : 0);
    ndm.push(dn > up && dn > 0 ? dn : 0);
  }
  let atr = 0, sp = 0, sn = 0;
  for (let i = 0; i < p; i++) { atr += tr[i]; sp += pdm[i]; sn += ndm[i]; }
  const dx = Array(tr.length).fill(null);
  for (let i = p - 1; i < tr.length; i++) {
    if (i >= p) {
      atr = atr - atr / p + tr[i];
      sp = sp - sp / p + pdm[i];
      sn = sn - sn / p + ndm[i];
    }
    const pdi = atr ? 100 * (sp / atr) : 0;
    const ndi = atr ? 100 * (sn / atr) : 0;
    const s = pdi + ndi;
    dx[i] = s === 0 ? 0 : 100 * Math.abs(pdi - ndi) / s;
  }
  let adxVal = 0, filled = 0;
  for (let i = p - 1; i < tr.length; i++) {
    if (dx[i] == null) continue;
    if (filled < p) {
      adxVal += dx[i];
      filled++;
      if (filled === p) {
        adxVal /= p;
        out[i + 1] = adxVal;
      }
    } else {
      adxVal = (adxVal * (p - 1) + dx[i]) / p;
      out[i + 1] = adxVal;
    }
  }
  return out;
}

const last = (a, n = 0) => {
  const v = a[a.length - 1 - n];
  return v == null || !isFinite(v) ? null : v;
};

function dropForming(c, sec, now) {
  return c.length && now < c[c.length - 1].time + sec ? c.slice(0, -1) : c;
}

function resample(c, min) {
  const sz = min * 60, m = new Map();
  for (const x of c) {
    const b = Math.floor(x.time / sz) * sz;
    (m.get(b) || m.set(b, []).get(b)).push(x);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([time, a]) => ({
    time, open: a[0].open, high: Math.max(...a.map(x => x.high)), low: Math.min(...a.map(x => x.low)), close: a[a.length - 1].close
  }));
}

function checkPriceAction(candles, dir, minRatio = 0.55, atrVal, minScore = 2.0) {
  if (!candles || candles.length < 4) return { ok: false, ratio: 0, type: "none", score: 0 };
  const [c0, c1, c2, c3] = candles;
  const body = Math.abs(c0.close - c0.open);
  const range = c0.high - c0.low;
  const bodyRatio = range > 0 ? body / range : 0;
  const isBull = c0.close > c0.open;
  const isBear = c0.close < c0.open;
  if (dir === "LONG" && (!isBull || bodyRatio < minRatio * 0.75)) return { ok: false, ratio: bodyRatio, type: "weak", score: 0 };
  if (dir === "SHORT" && (!isBear || bodyRatio < minRatio * 0.75)) return { ok: false, ratio: bodyRatio, type: "weak", score: 0 };

  const prevBody = Math.abs(c1.close - c1.open);
  const engulfs = dir === "LONG"
    ? (c0.close >= c1.open && c0.open <= c1.close && body >= prevBody * 0.95 && isBull && c1.close < c1.open)
    : (c0.close <= c1.open && c0.open >= c1.close && body >= prevBody * 0.95 && isBear && c1.close > c1.open);

  const upperWick = c0.high - Math.max(c0.open, c0.close);
  const lowerWick = Math.min(c0.open, c0.close) - c0.low;
  const pinOk = dir === "LONG"
    ? (lowerWick > body * 1.6 && upperWick < body * 0.5 && bodyRatio >= 0.25)
    : (upperWick > body * 1.6 && lowerWick < body * 0.5 && bodyRatio >= 0.25);

  const pad = (atrVal && atrVal > 0) ? 0.15 * atrVal : (range * 0.25);
  let structureOk = false;
  if (dir === "LONG") {
    const swingLow = Math.min(c1.low, c2.low, c3.low);
    structureOk = c0.low >= swingLow - pad && c0.close > c1.high;
  } else {
    const swingHigh = Math.max(c1.high, c2.high, c3.high);
    structureOk = c0.high <= swingHigh + pad && c0.close < c1.low;
  }

  let classicOk = false;
  let g = 0, r = 0, gs = 0, rs = 0;
  for (const c of candles) {
    const s = Math.max(c.high - c.low, 1e-12);
    if (c.close > c.open) { g++; gs += s; }
    else if (c.close < c.open) { r++; rs += s; }
  }
  if (dir === "LONG" && g === 1 && r === 3 && isBull && rs > 0) classicOk = (gs / rs) >= minRatio && bodyRatio >= minRatio * 0.9;
  if (dir === "SHORT" && r === 1 && g === 3 && isBear && gs > 0) classicOk = (rs / gs) >= minRatio && bodyRatio >= minRatio * 0.9;

  let score = 0;
  if (engulfs) score += 2.2;
  if (pinOk) score += 2.0;
  if (classicOk) score += 2.5;
  if (structureOk) score += 0.8;
  if (bodyRatio >= minRatio) score += 0.6;

  const strong = engulfs || pinOk || classicOk;
  const ok = strong && score >= minScore;
  const type = classicOk ? "classic" : engulfs ? "engulf" : pinOk ? "pin" : structureOk ? "structure" : "none";
  return { ok, ratio: bodyRatio, type, score, strong };
}

function checkPattern(l4, dir, minRatio) { return checkPriceAction(l4, dir, minRatio); }

function rangeAnalyze(m5, h1, S, ind) {
  const { rA, aA, smaA, stdA, adxA } = ind;
  const n = m5.length, i = n - 1;
  const b = m5[i], pv = m5[i - 1], pv2 = m5[i - 2], sc = b.close;
  const smaV = smaA[i], stdV = stdA[i], smaP = smaA[i - 1], stdP = stdA[i - 1];
  const r = rA[i], rP = rA[i - 1], rP2 = rA[i - 2], a = aA[i], adxV = adxA[i], adxB = adxA[i - 3];
  const up = smaV + S.bbDev * stdV, lo = smaV - S.bbDev * stdV, upP = smaP + S.bbDev * stdP, loP = smaP - S.bbDev * stdP;
  const lbN = Math.min(m5.length - 2, (S.rangeLookback || 96));
  const lb = m5.slice(-lbN - 2, -2);
  const rh = Math.max(...lb.map(c => c.high)), rl = Math.min(...lb.map(c => c.low)), H = rh - rl;
  let dir = pv.close <= loP ? "LONG" : pv.close >= upP ? "SHORT" : (sc < smaV ? "LONG" : "SHORT");
  const L = dir === "LONG";
  const touchPct = S.rangeTouchPct || 0.12;
  const touches = f => { let k = 0, inn = false; for (const c of lb) { const t = f(c); if (t && !inn) k++; inn = t; } return k; };
  const tTop = touches(c => c.high >= rh - touchPct * H), tBot = touches(c => c.low <= rl + touchPct * H);
  const roomOk = H >= S.rangeMinATR * a, touchOk = tTop >= 1 && tBot >= 1 && (tTop + tBot) >= S.rangeMinTouches;
  const broke = sc > rh + 0.4 * a || sc < rl - 0.4 * a, rangeOk = roomOk && touchOk && !broke;
  const adxOk = adxV < S.rangeAdxMax || (adxV < S.adxMin && adxB != null && adxV < adxB);
  const body = Math.abs(b.close - b.open), rangeC = b.high - b.low;
  
  // ✨ v46: نرم کردن بدنه کندل و واکنش به لبه
  const goodBody = rangeC > 0 && body / rangeC >= 0.30;
  const edgeLong = (pv.low <= loP + 0.25 * a || pv.close <= loP + 0.15 * a) && sc > lo && b.close > b.open && goodBody;
  const edgeShort = (pv.high >= upP - 0.25 * a || pv.close >= upP - 0.15 * a) && sc < up && b.close < b.open && goodBody;
  
  const trig = L ? edgeLong : edgeShort;
  let volOk = true;
  if (S.rangeRequireVol !== false) {
    const volOf = c => (c.volume != null ? c.volume : (c.high - c.low));
    const look = m5.slice(Math.max(0, i - 20), i);
    const avg = look.length ? look.reduce((s, c) => s + volOf(c), 0) / look.length : 0;
    const vNow = volOf(b);
    volOk = avg <= 0 || vNow >= (S.rangeVolMult || 1.15) * avg;
  }
  const rv = [r, rP, rP2].filter(x => x != null);
  const rsiOk = L ? (Math.min(...rv) < S.rangeRsiL && r > rP) : (Math.max(...rv) > S.rangeRsiS && r < rP);
  let h1Ok = true, h1adx = null;
  if (S.rangeH1 && h1 && h1.length >= 40) { h1adx = last(adx(h1, 14)); if (h1adx != null) h1Ok = h1adx < 26; }
  const ext = L ? Math.min(b.low, pv.low, pv2.low) : Math.max(b.high, pv.high, pv2.high);
  let sl = L ? ext - 0.45 * a : ext + 0.45 * a;
  const minRisk = 1.2 * a;
  if (Math.abs(sc - sl) < minRisk) sl = L ? sc - minRisk : sc + minRisk;
  const risk = Math.abs(sc - sl), tp = smaV, tp2 = L ? up : lo, reward = L ? tp - sc : sc - tp, rr = risk > 0 ? reward / risk : 0;
  const rrOk = reward > 0 && rr >= S.rangeMinRR && risk <= S.rangeMaxRiskATR * a;
  const dg = ind.dg == null ? 5 : ind.dg, checks = [];
  const add = (k, label, ok, txt, fail, viz) => checks.push({ k, label, ok: !!ok, txt, fail, viz });
  if (S.adx !== false) add("adx", `ADX < ${S.rangeAdxMax} (رنج)`, adxOk, adxV.toFixed(1), "بازار روند دارد (ADX)", { t: "dist", v: (adxV - S.rangeAdxMax) / 25 });
  add("rng", "رنج معتبر (برخورد به کف/سقف)", rangeOk, `${tBot} کف · ${tTop} سقف · ${(H / a).toFixed(1)}×ATR${broke ? " · شکست" : ""}`, broke ? "رنج شکسته شده" : "رنج معتبر نیست");
  add("trg", "واکنش به لبه باند بولینگر", trig, trig ? "بله" : "خیر", "واکنش لبه باند تأیید نشد");
  add("vol", "حجم نسبی بالای میانگین", volOk, volOk ? "بله" : "خیر", "حجم کافی نیست");
  if (S.rsi !== false) add("rsi", "RSI اشباع و در حال برگشت", rsiOk, r.toFixed(1), "RSI در محدوده اشباع نیست", { t: "dist", v: (r - 50) / 50 });
  if (S.rangeH1) add("h1", "H1 بدون روند قوی", h1Ok, h1adx == null ? "-" : "ADX " + h1adx.toFixed(1), "H1 رونددار است");
  add("rr", "نسبت ریسک/ریوارد ≥ " + S.rangeMinRR, rrOk, "R:R " + rr.toFixed(2), "نسبت ریسک به ریوارد کافی نیست");
  return { dir, checks, sl, tp, tp2, rr, rh, rl, risk, price: sc, low: rl, high: rh, dg };
}

function evaluate(id, raw5, rawH1, S, now = Date.now() / 1000) {
  S = { ...DEF, ...S };
  const m5 = dropForming(raw5, 300, now), h1 = dropForming(rawH1, 3600, now);
  const price = raw5.length ? raw5[raw5.length - 1].close : 0;
  const row = (x = {}) => ({ id, side: null, price, fail: null, pass: 0, total: 0, checks: [], ...x });
  if (m5.length < S.es + 5) return row({ fail: "تاریخچه M5 کافی نیست" });
  const cl = m5.map(c => c.close);
  const efA = ema(cl, S.ef), emA = ema(cl, S.em), esA = ema(cl, S.es), rA = rsi(cl, S.rsiP), aA = atr(m5, S.atrP);
  const smaA = sma(cl, S.bbP), stdA = stdDev(cl, S.bbP), adxA = adx(m5, S.rsiP);
  const ef = last(efA), em = last(emA), es = last(esA), r = last(rA), a = last(aA), efp = last(efA, 1), emp = last(emA, 1);
  const smaV = last(smaA), stdV = last(stdA), adxV = last(adxA);
  if ([ef, em, es, r, a, efp, emp, smaV, stdV, adxV].some(x => x == null)) return row({ fail: "اندیکاتورها آماده نیست" });
  const sc = m5[m5.length - 1].close;
  const lookback = m5.slice(-(S.rangeLookback || 96));
  const rangeHigh = Math.max(...lookback.map(c => c.high)), rangeLow = Math.min(...lookback.map(c => c.low));
  let pass = 0, total = 0, checks = [], fail = null, side = null;
  const addCheck = (label, ok, failMsg) => { total++; checks.push({ l: label, ok: !!ok }); if (ok) pass++; else if (!fail) fail = failMsg; };
  let RA = null;
  if (S.mode === "range") {
    RA = rangeAnalyze(m5, h1, S, { rA, aA, smaA, stdA, adxA });
    RA.checks.forEach(c => addCheck(c.label, c.ok, c.fail));
    if (pass === total && total > 0) { side = RA.dir; fail = null; }
  } else {
    const patCandles = m5.slice(-4).reverse();
    const pl = checkPriceAction(patCandles, "LONG", S.minRatio, a, S.minPaScore),
          ps = checkPriceAction(patCandles, "SHORT", S.minRatio, a, S.minPaScore);
    const ab = sc > es, be = sc < es;
    
    // ✨ v46: نرم کردن هم‌جهتی EMA (اجازه کراس در ۲ کندل اخیر)
    const ef2 = last(efA, 2), em2 = last(emA, 2);
    const nc = ef !== em && ((ef > em && efp >= emp && ef2 <= em2) || (ef < em && efp <= emp && ef2 >= em2));

    const slopeOk = a > 0 && Math.abs(ef - efp) / a >= (S.minSlopeAtr || 0.010) && Math.abs(em - emp) / a >= (S.minSlopeAtr || 0.010) * 0.5;
    const slopeDirL = (ef - efp) > 0 && (em - emp) >= 0;
    const slopeDirS = (ef - efp) < 0 && (em - emp) <= 0;
    const slope = slopeOk;
    
    const D = sc >= es ? "LONG" : "SHORT", isL = D === "LONG";
    let m15L = true, m15S = true;
    if (S.m15) {
      const m = dropForming(resample(m5, 15), 900, now);
      if (m.length < S.em + 2) return row({ rsi: r, fail: "تاریخچه M15 کافی نیست" });
      const mc = m.map(c => c.close), f = last(ema(mc, S.ef)), mm = last(ema(mc, S.em));
      m15L = f > mm; m15S = f < mm;
    }
    let h1L = true, h1S = true;
    if (S.h1) {
      if (h1.length < S.es + 2) return row({ rsi: r, fail: "تاریخچه H1 کافی نیست" });
      const hc = h1.map(c => c.close), hs = last(ema(hc, S.es)), c = hc[hc.length - 1];
      if (S.h1Strict) { const f = last(ema(hc, S.ef)), m = last(ema(hc, S.em)); h1L = c > hs && f > m && m > hs; h1S = c < hs && f < m && m < hs; }
      else { h1L = c > hs; h1S = c < hs; }
    }
    const distATR = a > 0 ? Math.abs(sc - es) / a : 99, distOk = distATR <= (S.maxDistATR || 3.0);
    let rsiOk = true;
    if (S.rsi) {
      const r1 = last(rA, 1), r2 = last(rA, 2);
      if (isL) { const wasOversold = (r1 != null && r1 < S.rsiL) || (r2 != null && r2 < S.rsiL) || r < S.rsiL + 5; rsiOk = wasOversold && r > (r1 || r) - 0.5 && r < 62; }
      else { const wasOverbought = (r1 != null && r1 > S.rsiS) || (r2 != null && r2 > S.rsiS) || r > S.rsiS - 5; rsiOk = wasOverbought && r < (r1 || r) + 0.5 && r > 38; }
    }
    if (S.trend !== false) addCheck(`قیمت ${isL ? "بالای" : "پایین"} EMA${S.es}`, isL ? ab : be, `قیمت روی EMA200`);
    if (S.nc !== false) addCheck(`هم‌جهتی و شیب EMAها`, nc && slope && (isL ? slopeDirL : slopeDirS), `تقاطع یا شیب نامناسب`);
    if (S.emax !== false) addCheck(`هم‌راستایی EMA${S.ef}/${S.em}`, isL ? ef > em : ef < em, `هم‌راستایی EMA21/50`);
    if (S.pat !== false) addCheck(`پرایس‌اکشن تأیید`, isL ? pl.ok : ps.ok, `الگوی پرایس‌اکشن ضعیف`);
    if (S.adx !== false) addCheck(`ADX > ${S.adxMin} (روند)`, adxV > S.adxMin, `بازار روند کافی ندارد`);
    if (S.adxSoft === true) {
      const adxSoft = adxV != null && adxV >= (S.adxSoftMin || 18);
      addCheck(`ADX≥${S.adxSoftMin || 18} (نرم)`, adxSoft, `بازار بدون روند کافی (ADX)`);
    }
    if (S.m15) addCheck(`فیلتر M15`, isL ? m15L : m15S, `فیلتر M15`);
    if (S.h1) addCheck(`فیلتر H1`, isL ? h1L : h1S, `فیلتر H1`);
    if (S.rsi) addCheck(`RSI پولبک`, rsiOk, `RSI پولبک مناسب نیست`);
    addCheck(`فاصله منطقی از EMA200`, distOk, `فاصله از EMA200 زیاد است (${distATR.toFixed(1)} ATR)`);
    if (pass === total && total > 0) { side = D; fail = null; }
  }
  
  if (side && S.sessionFilter !== false && typeof isInTradingSession === "function") {
    if (!isInTradingSession(id, now)) {
      side = null;
      fail = fail || "خارج از سشن معاملاتی / رول‌اور";
    }
  }
  
  if (side && S.d1Filter === true) {
    const db = dailyBias(m5, now);
    if (db && db.e21 != null && db.e50 != null && a > 0) {
      const sep = Math.abs(db.e21 - db.e50) / a;
      const strongDown = db.down && sep >= 0.8;
      const strongUp = db.up && sep >= 0.8;
      if (side === "LONG" && strongDown) { side = null; fail = fail || "خلاف روند روزانه قوی (D1)"; }
      if (side === "SHORT" && strongUp) { side = null; fail = fail || "خلاف روند روزانه قوی (D1)"; }
    }
  }

  let sl = null, tp = null, tp2 = null, rr = null;
  if (side && RA) { sl = RA.sl; tp = RA.tp; tp2 = RA.tp2; rr = RA.rr; }
  else if (side) {
    const look = Math.min(S.swingLook || 10, m5.length - 1);
    const recent = m5.slice(-look - 1, -1);
    const swingLow = Math.min(...recent.map(c => c.low)), swingHigh = Math.max(...recent.map(c => c.high));
    const atrSL = (S.atrMultSL || 2.0) * a;
    const spreadBuf = (S.spreadAtr != null ? S.spreadAtr : 0.4) * a;
    const sym = String(id || "").toUpperCase();
    let floorDist = (S.minSlAtr || 1.6) * a;
    if (/USDT$|BTC|ETH/.test(sym)) floorDist = Math.max(floorDist, sc * 0.005, 1.8 * a);
    else if (/JPY/.test(sym)) floorDist = Math.max(floorDist, 0.15, 1.7 * a);
    else if (/XAU|GOLD/.test(sym)) floorDist = Math.max(floorDist, 2.0, 1.7 * a);
    else if (/XAG/.test(sym)) floorDist = Math.max(floorDist, 0.05, 1.7 * a);
    else floorDist = Math.max(floorDist, 0.0012, 1.6 * a);
    if (side === "LONG") {
      sl = Math.min(swingLow - 0.3 * a, sc - atrSL) - spreadBuf;
      if (sc - sl < floorDist) sl = sc - floorDist;
    } else {
      sl = Math.max(swingHigh + 0.3 * a, sc + atrSL) + spreadBuf;
      if (sl - sc < floorDist) sl = sc + floorDist;
    }
    const risk = Math.abs(sc - sl);
    const R = S.tpR || 2.0;
    tp = side === "LONG" ? sc + risk * R : sc - risk * R;
    tp2 = side === "LONG" ? sc + risk * (R + 1) : sc - risk * (R + 1);
    rr = R;
  }
  return row({ side, rsi: r, atr: a, entry: side ? sc : null, sl, tp, tp2, rr: rr != null ? +rr.toFixed(2) : null, fail, ef, em, es, adx: adxV, rangeHigh: RA ? RA.rh : rangeHigh, rangeLow: RA ? RA.rl : rangeLow, pass, total, checks });
}

function lci(b, sec, asOf) {
  let lo = 0, hi = b.length - 1, a = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (b[m].time + sec <= asOf) { a = m; lo = m + 1; } else hi = m - 1; }
  return a;
}

function divExit(c, rA, from, isLong) {
  const H = [], L = [];
  for (let i = Math.max(from + 2, 1); i < c.length - 1; i++) {
    const r = rA[i]; if (r == null) continue;
    if (c[i].high >= c[i - 1].high && c[i].high >= c[i + 1].high) H.push({ i, p: c[i].high, r });
    if (c[i].low <= c[i - 1].low && c[i].low <= c[i + 1].low) L.push({ i, p: c[i].low, r });
  }
  const A = isLong ? H : L;
  for (let k = 1; k < A.length; k++) {
    const a = A[k - 1], b = A[k]; if (a.i <= from) continue;
    if (isLong ? (b.p > a.p && b.r < a.r) : (b.p < a.p && b.r > a.r)) return { i: b.i, p: c[b.i].close };
  }
  return null;
}

function marks(raw5, rawH1, S, now = Date.now() / 1000) {
  S = { ...DEF, ...S };
  const m5 = dropForming(raw5, 300, now), h1 = dropForming(rawH1, 3600, now);
  if (m5.length < S.es + 4) return [];
  const cl = m5.map(c => c.close);
  const efA = ema(cl, S.ef), emA = ema(cl, S.em), esA = ema(cl, S.es), rA = rsi(cl, S.rsiP), aA = atr(m5, S.atrP);
  const m15 = S.m15 ? resample(m5, 15) : [], mc = m15.map(c => c.close), mf = S.m15 ? ema(mc, S.ef) : [], mm = S.m15 ? ema(mc, S.em) : [];
  const hc = h1.map(c => c.close), hf = S.h1 ? ema(hc, S.ef) : [], hm = S.h1 ? ema(hc, S.em) : [], hs = S.h1 ? ema(hc, S.es) : [];
  const out = []; let free = 0;
  for (let i = Math.max(m5.length - 180, S.es + 1, 3); i < m5.length; i++) {
    const ef = efA[i], em = emA[i], es = esA[i], efp = efA[i - 1], emp = emA[i - 1], r = rA[i], a = aA[i];
    if ([ef, em, es, efp, emp, r, a].some(x => x == null) || a <= 0) continue;
    if (m5[i].time <= free) continue;
    const b = m5[i], l4 = [b, m5[i - 1], m5[i - 2], m5[i - 3]];
    const pl = checkPriceAction(l4, "LONG", S.minRatio, undefined, S.minPaScore),
          ps = checkPriceAction(l4, "SHORT", S.minRatio, undefined, S.minPaScore);
    const slope = (ef - efp) !== 0 && (em - emp) !== 0, nc = ef !== em && efp !== emp && ((ef > em && efp > emp) || (ef < em && efp < emp));
    const ab = b.close > es, be = b.close < es;
    let L = ab && ef > em && nc && slope && pl.ok, Sh = be && ef < em && nc && slope && ps.ok;
    if (S.rsi) { L = L && r < 62; Sh = Sh && r > 38; }
    if (!L && !Sh) continue;
    let m15L = true, m15S = true;
    if (S.m15) { const k = lci(m15, 900, b.time + 300), f = k >= 0 ? mf[k] : null, m = k >= 0 ? mm[k] : null; if (f == null || m == null) continue; m15L = f > m; m15S = f < m; }
    let h1L = true, h1S = true;
    if (S.h1) {
      const k = lci(h1, 3600, b.time + 300), s = k >= 0 ? hs[k] : null; if (s == null) continue;
      const c = h1[k].close;
      if (S.h1Strict) { const f = hf[k], m = hm[k]; if (f == null || m == null) continue; h1L = c > s && f > m && m > s; h1S = c < s && f < m && m < s; }
      else { h1L = c > s; h1S = c < s; }
    }
    let side = null;
    if (L && m15L && h1L) side = "LONG"; if (Sh && m15S && h1S) side = "SHORT";
    if (!side) continue;
    out.push({ i, side, entry: b.close, time: b.time }); free = b.time + 1800;
  }
  return out;
}

function explain(id, raw5, rawH1, S, now = Date.now() / 1000, dg = 5) {
  S = { ...DEF, ...S };
  const m5 = dropForming(raw5, 300, now), h1 = dropForming(rawH1, 3600, now);
  const out = { id, checks: [], pass: 0, total: 0, err: null };
  if (m5.length < S.es + 5) { out.err = "تاریخچه M5 کافی نیست"; return out; }
  const cl = m5.map(c => c.close);
  const efA = ema(cl, S.ef), emA = ema(cl, S.em), esA = ema(cl, S.es), rA = rsi(cl, S.rsiP), aA = atr(m5, S.atrP);
  const smaA = sma(cl, S.bbP), stdA = stdDev(cl, S.bbP), adxA = adx(m5, S.rsiP);
  const ef = last(efA), em = last(emA), es = last(esA), r = last(rA), a = last(aA), efp = last(efA, 1), emp = last(emA, 1);
  const smaV = last(smaA), stdV = last(stdA), adxV = last(adxA);
  if ([ef, em, es, r, a, efp, emp, smaV, stdV, adxV].some(x => x == null)) { out.err = "اندیکاتورها آماده نیست"; return out; }
  const i = m5.length - 1, b = m5[i], sc = b.close, D = sc >= es ? "LONG" : "SHORT", L = D === "LONG", sl = (ef - efp) !== 0 && (em - emp) !== 0;
  out.dir = D; out.price = sc; out.rsi = r; out.atr = a; out.ef = ef; out.em = em; out.es = es; out.adx = adxV;
  const lookback = m5.slice(-(S.rangeLookback || 96));
  out.rangeHigh = Math.max(...lookback.map(c => c.high)); out.rangeLow = Math.min(...lookback.map(c => c.low));
  const add = (k, label, ok, txt, viz) => { out.checks.push({ k, label, ok: !!ok, txt, viz }); out.total++; if (ok) out.pass++; };
  if (S.mode === "range") {
    const RA = rangeAnalyze(m5, h1, S, { rA, aA, smaA, stdA, adxA, dg });
    out.dir = RA.dir; out.rangeHigh = RA.rh; out.rangeLow = RA.rl; out.slEst = RA.risk; out.tp = RA.tp; out.tp2 = RA.tp2; out.rr = +RA.rr.toFixed(2);
    RA.checks.forEach(c => add(c.k, c.label, c.ok, c.txt, c.viz));
    out.checks.push({ k: "range", label: "محدوده رنج", ok: true, txt: `سقف: ${RA.rh.toFixed(dg)} | کف: ${RA.rl.toFixed(dg)} | TP: ${RA.tp.toFixed(dg)}`, viz: { t: "range", price: sc, low: RA.rl, high: RA.rh } });
  } else {
    if (S.trend !== false) add("trend", `قیمت ${L ? "بالای" : "پایین"} EMA${S.es} و شیب`, (L ? sc > es : sc < es) && sl, ((sc - es) / a >= 0 ? "+" : "") + ((sc - es) / a).toFixed(1) + "×ATR", { t: "dist", v: (sc - es) / a });
    const pat = m5.slice(-4).reverse();
    const pl = checkPriceAction(pat, "LONG", S.minRatio, a, S.minPaScore),
          ps = checkPriceAction(pat, "SHORT", S.minRatio, a, S.minPaScore);
    const nc = ef !== em && efp !== emp && ((ef > em && efp > emp) || (ef < em && efp < emp)), pp = L ? pl : ps;
    if (S.emax !== false) add("emax", `EMA${S.ef} ${L ? "بالای" : "پایین"} EMA${S.em}`, L ? ef > em : ef < em, ((ef - em) / a >= 0 ? "+" : "") + ((ef - em) / a).toFixed(2) + "×ATR", { t: "dist", v: (ef - em) / a });
    if (S.nc !== false) add("nc", "هم‌جهتی دو کندل اخیر", nc, nc ? "بله" : "خیر");
    if (S.pat !== false) add("pat", "پرایس‌اکشن (" + (pp.type || "none") + ")", pp.ok, "نسبت " + pp.ratio.toFixed(2) + " | امتیاز " + (pp.score || 0).toFixed(1), { t: "pat", c: pat.slice().reverse().map(c => ({ o: c.open, h: c.high, l: c.low, c: c.close })), ratio: pp.ratio, th: S.minRatio, ok: pp.ok });
    if (S.adx !== false) add("adx", `ADX > ${S.adxMin} (روند)`, adxV > S.adxMin, adxV.toFixed(1), { t: "dist", v: (adxV - 25) / 25 });
    if (S.rsi) { const rsiOk = L ? r < 62 : r > 38; add("rsi", "فیلتر RSI پولبک", rsiOk, r.toFixed(1), { t: "dist", v: (r - 50) / 50 }); }
    const distATR = a > 0 ? Math.abs(sc - es) / a : 99;
    add("dist", "فاصله از EMA200", distATR <= (S.maxDistATR || 3.5), distATR.toFixed(1) + "×ATR", { t: "dist", v: distATR / 4 });
    out.slEst = (b.high - b.low) * 2;
  }
  return out;
}


// ---- سشن معاملاتی (UTC) ----
function sessionOfSymbol(id) {
  const s = String(id || "").toUpperCase();
  if (/JPY|AUD|NZD|HK|JP225|AU200/.test(s)) return "asia";
  if (/GBP|EUR|CHF|DE30|UK100|FR40|EU50/.test(s)) return "london";
  if (/USD|CAD|US30|NAS|SPX|XAU|XAG|WTI|BTC|ETH/.test(s)) return "ny";
  return "london";
}
function isInTradingSession(id, nowSec) {
  const d = new Date((nowSec || Date.now() / 1000) * 1000);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  const isCrypto = /USDT$|BTC|ETH|BNB|XRP|SOL|ADA|DOGE/.test(String(id || "").toUpperCase());
  if (!isCrypto) {
    if (day === 6) return false; // شنبه
    if (day === 5 && h >= 21) return false; // جمعه شب
    if (day === 0 && h < 22) return false; // یکشنبه قبل باز شدن
    if (h >= 21 && h < 23) return false;
  }
  const sess = sessionOfSymbol(id);
  if (isCrypto) return true;
  if (sess === "asia") return (h >= 0 && h < 9) || (h >= 23);
  if (sess === "london") return h >= 7 && h < 16;
  if (sess === "ny") return h >= 12 && h < 21;
  return true;
}

function dailyBias(m5, now) {
  try {
    const d1 = dropForming(resample(m5, 1440), 86400, now || Date.now() / 1000);
    if (!d1 || d1.length < 25) return null;
    const cl = d1.map(c => c.close);
    const e21 = last(ema(cl, 21)), e50 = last(ema(cl, 50));
    if (e21 == null || e50 == null) return null;
    const cur = d1[d1.length - 1], prev = d1[d1.length - 2] || cur;
    const up = cur.close > e21 && e21 >= e50;
    const down = cur.close < e21 && e21 <= e50;
    return { up, down, pdh: prev.high, pdl: prev.low, close: cur.close, e21, e50 };
  } catch (e) { return null; }
}
function correlationGroup(id) {
  const s = String(id || "").toUpperCase();
  if (/EURUSD|GBPUSD|AUDUSD|NZDUSD|EURGBP/.test(s)) return "usd_risk_long";
  if (/USDJPY|USDCAD|USDCHF/.test(s)) return "usd_long";
  if (/XAU|XAG/.test(s)) return "metal";
  if (/BTC|ETH|BNB|XRP|SOL|USDT/.test(s)) return "crypto";
  if (/US30|NAS|SPX|US2000/.test(s)) return "us_index";
  return s;
}
function filterCorrelated(signals) {
  const best = new Map();
  for (const r of signals || []) {
    if (!r || !r.side) continue;
    const g = correlationGroup(r.id) + "|" + r.side;
    const score = (r.pass || 0) / Math.max(1, r.total || 1);
    const prev = best.get(g);
    if (!prev || score > prev._cs) best.set(g, { ...r, _cs: score });
  }
  return [...best.values()].map(({ _cs, ...r }) => r);
}

if (typeof module !== "undefined") {
  module.exports = { explain, dropForming, marks, divExit, lci, evaluate, ema, rsi, atr, adx, resample, checkPattern, checkPriceAction, DEF, ENGINE_VER, isInTradingSession, sessionOfSymbol, correlationGroup, filterCorrelated, dailyBias };
}
