// engine.js — موتور ارزیابی پیشرفته Multi-Confluence (نسخه حرفه‌ای اصلاح‌شده)

function ema(data, period) {
  if (!data || data.length < period) return new Array(data ? data.length : 0).fill(null);
  const k = 2 / (period + 1);
  const out = new Array(data.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  out[period - 1] = sum / period;
  for (let i = period; i < data.length; i++) {
    out[i] = data[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

function rsi(data, period = 14) {
  if (!data || data.length <= period) return new Array(data ? data.length : 0).fill(null);
  const out = new Array(data.length).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    const g = diff >= 0 ? diff : 0;
    const l = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return out;
}

function atr(candles, period = 14) {
  if (!candles || candles.length <= period) return new Array(candles ? candles.length : 0).fill(null);
  const tr = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const out = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  out[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

function adx(candles, period = 14) {
  if (!candles || candles.length < period * 2) return new Array(candles ? candles.length : 0).fill(null);
  const tr = [], plusDM = [], minusDM = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
      plusDM.push(0);
      minusDM.push(0);
      continue;
    }
    const cur = candles[i], prev = candles[i - 1];
    const h_l = cur.high - cur.low;
    const h_pc = Math.abs(cur.high - prev.close);
    const l_pc = Math.abs(cur.low - prev.close);
    tr.push(Math.max(h_l, h_pc, l_pc));

    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    plusDM.push((upMove > downMove && upMove > 0) ? upMove : 0);
    minusDM.push((downMove > upMove && downMove > 0) ? downMove : 0);
  }

  function smoothed(arr, p) {
    const res = new Array(arr.length).fill(null);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      if (i < p) {
        sum += arr[i];
        if (i === p - 1) res[i] = sum;
      } else {
        res[i] = res[i - 1] - (res[i - 1] / p) + arr[i];
      }
    }
    return res;
  }

  const atrArr = smoothed(tr, period);
  const pDMSmoothed = smoothed(plusDM, period);
  const mDMSmoothed = smoothed(minusDM, period);

  const dxArr = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (!atrArr[i] || atrArr[i] === 0) continue;
    const pDI = (pDMSmoothed[i] / atrArr[i]) * 100;
    const mDI = (mDMSmoothed[i] / atrArr[i]) * 100;
    const sumDI = pDI + mDI;
    dxArr[i] = sumDI === 0 ? 0 : (Math.abs(pDI - mDI) / sumDI) * 100;
  }
  return smoothed(dxArr, period);
}

// 🛠 تابع جدید: محاسبه باند بولینگر
function bollingerBands(data, period = 20, mult = 2) {
  if (!data || data.length < period) return { upper: [], middle: [], lower: [] };
  const upper = [], middle = [], lower = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { upper.push(null); middle.push(null); lower.push(null); continue; }
    const slice = data.slice(i - period + 1, i + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    const sma = sum / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    upper.push(sma + mult * stdDev);
    middle.push(sma);
    lower.push(sma - mult * stdDev);
  }
  return { upper, middle, lower };
}

// 🛠 اصلاح تابع پرایس اکشن: استفاده از الگوهای قوی (Pin Bar و Engulfing)
function checkPriceActionConfirmation(candles, side) {
  if (!candles || candles.length < 2) return false;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const body = Math.abs(last.close - last.open);
  const totalRange = last.high - last.low;
  if (totalRange === 0) return false;

  const upperShadow = last.high - Math.max(last.open, last.close);
  const lowerShadow = Math.min(last.open, last.close) - last.low;
  
  const isBullish = last.close > last.open;
  const isBearish = last.close < last.open;
  const prevBullish = prev.close > prev.open;
  const prevBearish = prev.close < prev.open;

  if (side === "LONG") {
    // 1. Pin Bar (سایه پایینی بلند + بدنه کوچک)
    const pinBar = lowerShadow >= totalRange * 0.6 && body <= totalRange * 0.3 && isBullish;
    // 2. Bullish Engulfing (پوشا صعودی)
    const engulfing = isBullish && prevBearish && last.close >= prev.open && last.open <= prev.close;
    return pinBar || engulfing;
  } else {
    // 1. Pin Bar (سایه بالایی بلند + بدنه کوچک)
    const pinBar = upperShadow >= totalRange * 0.6 && body <= totalRange * 0.3 && isBearish;
    // 2. Bearish Engulfing (پوشا نزولی)
    const engulfing = isBearish && prevBullish && last.close <= prev.open && last.open >= prev.close;
    return pinBar || engulfing;
  }
}

function dropForming(candles, intervalSec = 300, nowSec = Date.now() / 1000) {
  if (!candles || !candles.length) return [];
  const last = candles[candles.length - 1];
  if (nowSec - last.time < intervalSec) return candles.slice(0, -1);
  return candles;
}

function filterCorrelated(activeRows) {
  if (!activeRows || !activeRows.length) return [];
  const map = new Map();
  for (const r of activeRows) {
    const groupKey = r.mkt || "gen";
    if (!map.has(groupKey) || (r.pass || 0) > (map.get(groupKey).pass || 0)) {
      map.set(groupKey, r);
    }
  }
  return Array.from(map.values());
}

function evaluate(symbol, candlesM5, candlesH1, opts = {}, nowSec = Date.now() / 1000) {
  const cl = dropForming(candlesM5, 300, nowSec);
  if (!cl || cl.length < 50) return { side: null, fail: "کمبود کندل M5" };

  const closes = cl.map(c => c.close);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const rsiArr = rsi(closes, 14);
  const atrArr = atr(cl, 14);
  const adxArr = adx(cl, 14);
  const bb = bollingerBands(closes, 20, 2);

  const idx = cl.length - 1;
  const lastClose = closes[idx];
  const lastRsi = rsiArr[idx];
  const lastAtr = atrArr[idx] || (cl[idx].high - cl[idx].low);
  const lastAdx = adxArr[idx] || 20;
  const lastUpper = bb.upper[idx];
  const lastLower = bb.lower[idx];

  const mode = opts.mode || (lastAdx >= 22 ? "pattern" : "range");
  const checks = [];
  let side = null;

  if (mode === "range") {
    const isLowTrend = lastAdx < 25;
    checks.push({ l: `رنج / ADX ملایم (${lastAdx.toFixed(1)})`, ok: isLowTrend });
    
    if (opts.adx !== false && !isLowTrend) {
      return { side: null, fail: `روند قوی مناسب رنج نیست (ADX: ${lastAdx.toFixed(1)})`, adx: lastAdx, checks };
    }

    // 🛠 اصلاح منطق رنج: ترکیب RSI و باند بولینگر
    const rsiBuy = lastRsi <= (opts.rsiL || 38);
    const rsiSell = lastRsi >= (opts.rsiS || 62);
    const bbBuy = lastLower && lastClose <= lastLower + (lastAtr * 0.2);
    const bbSell = lastUpper && lastClose >= lastUpper - (lastAtr * 0.2);

    if (rsiBuy && bbBuy) side = "LONG";
    else if (rsiSell && bbSell) side = "SHORT";

    checks.push({ l: `اشباع RSI + برخورد بولینگر (${lastRsi ? lastRsi.toFixed(1) : "-"})`, ok: !!side });
    if (!side) return { side: null, fail: `شرایط رنج برقرار نیست (RSI: ${lastRsi ? lastRsi.toFixed(1) : "-"})`, adx: lastAdx, checks };

  } else {
    const isTrending = lastAdx >= 20;
    checks.push({ l: `روند / ADX قوی (${lastAdx.toFixed(1)})`, ok: isTrending });

    if (ema9[idx] > ema21[idx]) side = "LONG";
    else if (ema9[idx] < ema21[idx]) side = "SHORT";

    checks.push({ l: "ترازبندی EMA", ok: !!side });
    if (!side) return { side: null, fail: "عدم هم‌راستایی روند", adx: lastAdx, checks };
  }

  const paOk = checkPriceActionConfirmation(cl, side);
  checks.push({ l: "تاییدیه پرایس‌اکشن", ok: paOk });
  if (opts.pa !== false && !paOk) {
    return { side: null, fail: "عدم تایید کندل پرایس‌اکشن", adx: lastAdx, checks };
  }

  const slMult = opts.slAtr || 1.5;
  const entry = lastClose;
  const riskDist = lastAtr * slMult;

  const sl = side === "LONG" ? entry - riskDist : entry + riskDist;
  
  // 🛠 اصلاح نهایی TP: 
  let tp1 = null;
  let tp2 = null;
  if (mode === "range") {
    tp1 = side === "LONG" ? entry + riskDist * 1.5 : entry - riskDist * 1.5;
    tp2 = side === "LONG" ? entry + riskDist * 3.0 : entry - riskDist * 3.0;
  }

  const totalPass = checks.filter(c => c.ok).length;

  return {
    side,
    mode,
    entry,
    sl,
    tp: tp1,
    tp2: tp2,
    trailingAtrStep: lastAtr * 1.2,
    rsi: lastRsi,
    adx: lastAdx,
    pass: totalPass,
    total: checks.length,
    checks
  };
}

module.exports = {
  ema,
  rsi,
  atr,
  adx,
  bollingerBands,
  checkPriceActionConfirmation,
  dropForming,
  filterCorrelated,
  evaluate
};
