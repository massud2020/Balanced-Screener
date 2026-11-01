// Port of src/lib/strategy/engine.ts (Dual Strategy: Trend & Range) - Improved v40
const DEF = {
  mode: "pattern",
  trend: true,
  emax: true,
  nc: true,
  pat: true,
  adx: true,
  adxMin: 25,
  m15: true,
  h1: true,
  h1Strict: false,
  rsi: true,
  rsiL: 45,
  rsiS: 55,
  ef: 21,
  em: 50,
  es: 200,
  rsiP: 14,
  minRatio: 0.55,
  atrP: 14,
  bbP: 20,
  bbDev: 2,
  maxDistATR: 3.5,
  swingLook: 10,
  atrMultSL: 1.8,
  useConfluence: false,
  minConfluence: 7,
  rangeAdxMax: 20,
  rangeMinATR: 2.8,
  rangeMinTouches: 3,
  rangeRsiL: 32,
  rangeRsiS: 68,
  rangeMinRR: 1.6,
  rangeMaxRiskATR: 2.8,
  rangeH1: true,
  rangeTouchPct: 0.12
};
const ENGINE_VER = 40;

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

function adx(cs, p) {
  if (cs.length < p * 2) return Array(cs.length).fill(null);
  let trs = [], pDMs = [], nDMs = [];
  for (let i = 1; i < cs.length; i++) {
    const h = cs[i].high, l = cs[i].low, ph = cs[i - 1].high, pl = cs[i - 1].low, pc = cs[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    const pDM = (h - ph > pl - l && h - ph > 0) ? h - ph : 0;
    const nDM = (pl - l > h - ph && pl - l > 0) ? pl - l : 0;
    trs.push(tr); pDMs.push(pDM); nDMs.push(nDM);
  }
  let str = [], spDM = [], snDM = [];
  let sTR = 0, sPDM = 0, sNDM = 0;
  for (let i = 0; i < p; i++) { sTR += trs[i]; sPDM += pDMs[i]; sNDM += nDMs[i]; }
  str.push(sTR); spDM.push(sPDM); snDM.push(sNDM);
  for (let i = p; i < trs.length; i++) {
    sTR = sTR - sTR / p + trs[i];
    sPDM = sPDM - sPDM / p + pDMs[i];
    sNDM = sNDM - sNDM / p + nDMs[i];
    str.push(sTR); spDM.push(sPDM); snDM.push(sNDM);
  }
  let dx = [];
  for (let i = 0; i < str.length; i++) {
    const pDI = 100 * (spDM[i] / str[i]);
    const nDI = 100 * (snDM[i] / str[i]);
    const sum = pDI + nDI;
    dx.push(sum === 0 ? 0 : 100 * Math.abs(pDI - nDI) / sum);
  }
  const adxArr = Array(cs.length).fill(null);
  let sDX = 0;
  for (let i = 0; i < p; i++) sDX += dx[i];
  adxArr[p * 2 - 1] = sDX / p;
  for (let i = p; i < dx.length; i++) {
    const prev = adxArr[p * 2 - 2 + i];
    adxArr[p * 2 - 1 + i] = (prev * (p - 1) + dx[i]) / p;
  }
  return adxArr;
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

function checkPriceAction(candles, dir, minRatio = 0.55) {
  if (candles.length < 4) return { ok: false, ratio: 0, type: "none", score: 0 };
  const [c0, c1, c2, c3] = candles;
  const body = Math.abs(c0.close - c0.open);
  const range = c0.high - c0.low;
  const bodyRatio = range > 0 ? body / range : 0;
  const isBull = c0.close > c0.open;
  const isBear = c0.close < c0.open;
  if (dir === "LONG" && (!isBull || bodyRatio < minRatio * 0.7)) return { ok: false, ratio: bodyRatio, type: "weak", score: 0 };
  if (dir === "SHORT" && (!isBear || bodyRatio < minRatio * 0.7)) return { ok: false, ratio: bodyRatio, type: "weak", score: 0 };
  const engulfs = dir === "LONG"
    ? (c0.close > c1.open && c0.open < c1.close && body > Math.abs(c1.close - c1.open) * 0.9)
    : (c0.close < c1.open && c0.open > c1.close && body > Math.abs(c1.close - c1.open) * 0.9);
  const upperWick = c0.high - Math.max(c0.open, c0.close);
  const lowerWick = Math.min(c0.open, c0.close) - c0.low;
  const pinOk = dir === "LONG" ? (lowerWick > body * 1.4 && upperWick < body * 0.6) : (upperWick > body * 1.4 && lowerWick < body * 0.6);
  let structureOk = false;
  if (dir === "LONG") {
    const lows = [c1.low, c2.low, c3.low];
    structureOk = c0.low >= Math.min(...lows) * 0.999;
  } else {
    const highs = [c1.high, c2.high, c3.high];
    structureOk = c0.high <= Math.max(...highs) * 1.001;
  }
  let classicOk = false;
  let g = 0, r = 0, gs = 0, rs = 0;
  for (const c of candles) {
    const s = c.high - c.low;
    if (c.close > c.open) { g++; gs += s; } else if (c.close < c.open) { r++; rs += s; }
  }
  if (dir === "LONG" && g === 1 && r === 3 && isBull && rs > 0) classicOk = (gs / rs) >= minRatio;
  if (dir === "SHORT" && r === 1 && g === 3 && isBear && gs > 0) classicOk = (rs / gs) >= minRatio;
  const score = (engulfs ? 2 : 0) + (pinOk ? 2 : 0) + (structureOk ? 1.5 : 0) + (classicOk ? 1 : 0) + (bodyRatio >= minRatio ? 1 : 0);
  const ok = score >= 2.5;
  return { ok, ratio: bodyRatio, type: engulfs ? "engulf" : pinOk ? "pin" : classicOk ? "classic" : structureOk ? "structure" : "none", score };
}

function checkPattern(l4, dir, minRatio) { return checkPriceAction(l4, dir, minRatio); }

function rangeAnalyze(m5, h1, S, ind) {
  const { rA, aA, smaA, stdA, adxA } = ind;
  const n = m5.length, i = n - 1;
  const b = m5[i], pv = m5[i - 1], pv2 = m5[i - 2], sc = b.close;
  const smaV = smaA[i], stdV = stdA[i], smaP = smaA[i - 1], stdP = stdA[i - 1];
  const r = rA[i], rP = rA[i - 1], rP2 = rA[i - 2], a = aA[i], adxV = adxA[i], adxB = adxA[i - 3];
  const up = smaV + S.bbDev * stdV, lo = smaV - S.bbDev * stdV, upP = smaP + S.bbDev * stdP, loP = smaP - S.bbDev * stdP;
  const lb = m5.slice(-52, -2);
  const rh = Math.max(...lb.map(c => c.high)), rl = Math.min(...lb.map(c => c.low)), H = rh - rl;
  let dir = pv.close <= loP ? "LONG" : pv.close >= upP ? "SHORT" : (sc < smaV ? "LONG" : "SHORT");
  const L = dir === "LONG";
  const touchPct = S.rangeTouchPct || 0.12;
  const touches = f => { let k = 0, inn = false; for (const c of lb) { const t = f(c); if (t && !inn) k++; inn = t; } return k; };
  const tTop = touches(c => c.high >= rh - touchPct * H), tBot = touches(c => c.low <= rl + touchPct * H);
  const roomOk = H >= S.rangeMinATR * a, touchOk = tTop >= 1 && tBot >= 1 && (tTop + tBot) >= S.rangeMinTouches;
  const broke = sc > rh + 0.4 * a || sc < rl - 0.4 * a, rangeOk = roomOk && touchOk && !broke;
  const adxOk = adxV < S.rangeAdxMax || (adxV < S.adxMin && adxB != null && adxV < adxB);
  const body = Math.abs(b.close - b.open), rangeC = b.high - b.low, goodBody = rangeC > 0 && body / rangeC >= 0.45;
  const trig = L ? (pv.close <= loP && sc > lo && b.close > b.open && goodBody) : (pv.close >= upP && sc < up && b.close < b.open && goodBody);
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
  add("trg", "تأیید برگشت قوی", trig, trig ? "بله" : "خیر", "برگشت تأیید نشده");
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
  const lookback = m5.slice(-50);
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
    const pl = checkPriceAction(patCandles, "LONG", S.minRatio), ps = checkPriceAction(patCandles, "SHORT", S.minRatio);
    const ab = sc > es, be = sc < es, slope = (ef - efp) !== 0 && (em - emp) !== 0;
    const nc = ef !== em && efp !== emp && ((ef > em && efp > emp) || (ef < em && efp < emp));
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
    const distATR = a > 0 ? Math.abs(sc - es) / a : 99, distOk = distATR <= (S.maxDistATR || 3.5);
    let rsiOk = true;
    if (S.rsi) {
      const r1 = last(rA, 1), r2 = last(rA, 2);
      if (isL) { const wasOversold = (r1 != null && r1 < S.rsiL) || (r2 != null && r2 < S.rsiL) || r < S.rsiL + 5; rsiOk = wasOversold && r > (r1 || r) - 0.5 && r < 62; }
      else { const wasOverbought = (r1 != null && r1 > S.rsiS) || (r2 != null && r2 > S.rsiS) || r > S.rsiS - 5; rsiOk = wasOverbought && r < (r1 || r) + 0.5 && r > 38; }
    }
    if (S.trend !== false) addCheck(`قیمت ${isL ? "بالای" : "پایین"} EMA${S.es}`, isL ? ab : be, `قیمت روی EMA200`);
    if (S.nc !== false) addCheck(`هم‌جهتی EMAها (بدون تقاطع)`, nc && slope, `تقاطع یا شیب نامناسب`);
    if (S.emax !== false) addCheck(`هم‌راستایی EMA${S.ef}/${S.em}`, isL ? ef > em : ef < em, `هم‌راستایی EMA21/50`);
    if (S.pat !== false) addCheck(`پرایس‌اکشن تأیید`, isL ? pl.ok : ps.ok, `الگوی پرایس‌اکشن ضعیف`);
    if (S.adx !== false) addCheck(`ADX > ${S.adxMin} (روند)`, adxV > S.adxMin, `بازار روند کافی ندارد`);
    if (S.m15) addCheck(`فیلتر M15`, isL ? m15L : m15S, `فیلتر M15`);
    if (S.h1) addCheck(`فیلتر H1`, isL ? h1L : h1S, `فیلتر H1`);
    if (S.rsi) addCheck(`RSI پولبک`, rsiOk, `RSI پولبک مناسب نیست`);
    addCheck(`فاصله منطقی از EMA200`, distOk, `فاصله از EMA200 زیاد است (${distATR.toFixed(1)} ATR)`);
    if (pass === total && total > 0) { side = D; fail = null; }
  }
  let sl = null, tp = null, tp2 = null, rr = null;
  if (side && RA) { sl = RA.sl; tp = RA.tp; tp2 = RA.tp2; rr = RA.rr; }
  else if (side) {
    const look = Math.min(S.swingLook || 10, m5.length - 1);
    const recent = m5.slice(-look - 1, -1);
    const swingLow = Math.min(...recent.map(c => c.low)), swingHigh = Math.max(...recent.map(c => c.high));
    const atrSL = (S.atrMultSL || 1.8) * a;
    if (side === "LONG") sl = Math.min(swingLow - 0.25 * a, sc - atrSL);
    else sl = Math.max(swingHigh + 0.25 * a, sc + atrSL);
    const minDist = 1.1 * a;
    if (Math.abs(sc - sl) < minDist) sl = side === "LONG" ? sc - minDist : sc + minDist;
    const risk = Math.abs(sc - sl);
    tp = side === "LONG" ? sc + risk * 2.0 : sc - risk * 2.0;
    tp2 = side === "LONG" ? sc + risk * 3.0 : sc - risk * 3.0;
    rr = 2.0;
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
    const pl = checkPriceAction(l4, "LONG", S.minRatio), ps = checkPriceAction(l4, "SHORT", S.minRatio);
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
  const lookback = m5.slice(-50);
  out.rangeHigh = Math.max(...lookback.map(c => c.high)); out.rangeLow = Math.min(...lookback.map(c => c.low));
  const add = (k, label, ok, txt, viz) => { out.checks.push({ k, label, ok: !!ok, txt, viz }); out.total++; if (ok) out.pass++; };
  if (S.mode === "range") {
    const RA = rangeAnalyze(m5, h1, S, { rA, aA, smaA, stdA, adxA, dg });
    out.dir = RA.dir; out.rangeHigh = RA.rh; out.rangeLow = RA.rl; out.slEst = RA.risk; out.tp = RA.tp; out.tp2 = RA.tp2; out.rr = +RA.rr.toFixed(2);
    RA.checks.forEach(c => add(c.k, c.label, c.ok, c.txt, c.viz));
    out.checks.push({ k: "range", label: "محدوده رنج", ok: true, txt: `سقف: ${RA.rh.toFixed(dg)} | کف: ${RA.rl.toFixed(dg)} | TP: ${RA.tp.toFixed(dg)}`, viz: { t: "range", price: sc, low: RA.rl, high: RA.rh } });
  } else {
    if (S.trend !== false) add("trend", `قیمت ${L ? "بالای" : "پایین"} EMA${S.es} و شیب`, (L ? sc > es : sc < es) && sl, ((sc - es) / a >= 0 ? "+" : "") + ((sc - es) / a).toFixed(1) + "×ATR", { t: "dist", v: (sc - es) / a });
    const pat = m5.slice(-4).reverse(), pl = checkPriceAction(pat, "LONG", S.minRatio), ps = checkPriceAction(pat, "SHORT", S.minRatio);
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

if (typeof module !== "undefined") {
  module.exports = { explain, dropForming, marks, divExit, lci, evaluate, ema, rsi, atr, resample, checkPattern, checkPriceAction, DEF, ENGINE_VER };
}
