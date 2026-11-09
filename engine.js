// engine.js — Balanced Screener Core Engine (V3 - Full Checks & Directional Gauge)
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Engine = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function ema(data, period) {
        if (!data || data.length < period) return new Array(data ? data.length : 0).fill(null);
        const k = 2 / (period + 1);
        const out = new Array(data.length).fill(null);
        let sum = 0;
        for (let i = 0; i < period; i++) sum += data[i];
        out[period - 1] = sum / period;
        for (let i = period; i < data.length; i++) out[i] = data[i] * k + out[i - 1] * (1 - k);
        return out;
    }

    function rsi(data, period = 14) {
        if (!data || data.length <= period) return new Array(data ? data.length : 0).fill(null);
        const out = new Array(data.length).fill(null);
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const diff = data[i] - data[i - 1];
            if (diff >= 0) gains += diff; else losses += Math.abs(diff);
        }
        let avgGain = gains / period, avgLoss = losses / period;
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
        for (let i = period; i < candles.length; i++) out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
        return out;
    }

    function adx(candles, period = 14) {
        if (!candles || candles.length < period * 2) return new Array(candles ? candles.length : 0).fill(null);
        const tr = [], plusDM = [], minusDM = [];
        for (let i = 0; i < candles.length; i++) {
            if (i === 0) { tr.push(candles[i].high - candles[i].low); plusDM.push(0); minusDM.push(0); continue; }
            const cur = candles[i], prev = candles[i - 1];
            tr.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
            const upMove = cur.high - prev.high, downMove = prev.low - cur.low;
            plusDM.push((upMove > downMove && upMove > 0) ? upMove : 0);
            minusDM.push((downMove > upMove && downMove > 0) ? downMove : 0);
        }
        function smoothed(arr, p) {
            const res = new Array(arr.length).fill(null);
            let sum = 0;
            for (let i = 0; i < arr.length; i++) {
                if (i < p) { sum += arr[i]; if (i === p - 1) res[i] = sum; }
                else { res[i] = res[i - 1] - (res[i - 1] / p) + arr[i]; }
            }
            return res;
        }
        const atrArr = smoothed(tr, period), pDMSmoothed = smoothed(plusDM, period), mDMSmoothed = smoothed(minusDM, period);
        const dxArr = new Array(candles.length).fill(null);
        for (let i = 0; i < candles.length; i++) {
            if (!atrArr[i] || atrArr[i] === 0) continue;
            const pDI = (pDMSmoothed[i] / atrArr[i]) * 100, mDI = (mDMSmoothed[i] / atrArr[i]) * 100;
            const sumDI = pDI + mDI;
            dxArr[i] = sumDI === 0 ? 0 : (Math.abs(pDI - mDI) / sumDI) * 100;
        }
        return smoothed(dxArr, period);
    }

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
            upper.push(sma + mult * stdDev); middle.push(sma); lower.push(sma - mult * stdDev);
        }
        return { upper, middle, lower };
    }

    function dropForming(candles, intervalSec = 300, nowSec = Date.now() / 1000) {
        if (!candles || !candles.length) return [];
        const last = candles[candles.length - 1];
        if (nowSec - last.time < intervalSec) return candles.slice(0, -1);
        return candles;
    }

    function findSwingLevels(candles, lookback = 50) {
        if (!candles || candles.length < 5) return { swingHigh: null, swingLow: null };
        let swingHigh = null, swingLow = null;
        const start = Math.max(2, candles.length - lookback);
        for (let i = candles.length - 3; i >= start; i--) {
            const c = candles[i];
            if (c.high > candles[i - 1].high && c.high > candles[i - 2].high && c.high > candles[i + 1].high && c.high > candles[i + 2].high) { swingHigh = c.high; break; }
        }
        for (let i = candles.length - 3; i >= start; i--) {
            const c = candles[i];
            if (c.low < candles[i - 1].low && c.low < candles[i - 2].low && c.low < candles[i + 1].low && c.low < candles[i + 2].low) { swingLow = c.low; break; }
        }
        return { swingHigh, swingLow };
    }

    function checkPattern3to1(candles) {
        if (!candles || candles.length < 4) return { pattern_buy: false, pattern_sell: false };
        const c = candles.slice(-4);
        let greenCount = 0, redCount = 0;
        c.forEach(x => { if (x.close > x.open) greenCount++; else if (x.close < x.open) redCount++; });
        const last = c[3], isLastGreen = last.close > last.open, isLastRed = last.close < last.open;
        return { pattern_buy: (redCount === 3 && greenCount === 1 && isLastGreen), pattern_sell: (greenCount === 3 && redCount === 1 && isLastRed) };
    }

    function checkPriceActionConfirmation(candles, side) {
        if (!candles || candles.length < 2) return false;
        const last = candles[candles.length - 1], prev = candles[candles.length - 2];
        const body = Math.abs(last.close - last.open), totalRange = last.high - last.low;
        if (totalRange === 0) return false;
        const upperShadow = last.high - Math.max(last.open, last.close), lowerShadow = Math.min(last.open, last.close) - last.low;
        const isBullish = last.close > last.open, isBearish = last.close < last.open;
        const prevBullish = prev.close > prev.open, prevBearish = prev.close < prev.open;
        if (side === "LONG") {
            const pinBar = lowerShadow >= totalRange * 0.6 && body <= totalRange * 0.3 && isBullish;
            const engulfing = isBullish && prevBearish && last.close >= prev.open && last.open <= prev.close;
            return pinBar || engulfing;
        } else {
            const pinBar = upperShadow >= totalRange * 0.6 && body <= totalRange * 0.3 && isBearish;
            const engulfing = isBearish && prevBullish && last.close <= prev.open && last.open >= prev.close;
            return pinBar || engulfing;
        }
    }

    // 🛠 تغییرات اصلی: ارزیابی کامل تمام شروط بدون توقف
    function evaluate(symbol, candlesM5, candlesM15, candlesH1, opts = {}, nowSec = Date.now() / 1000) {
        const cl = dropForming(candlesM5, 300, nowSec);
        
        if (!cl || cl.length < 200) {
            return { side: null, checkedSide: 'LONG', fail: "کمبود کندل M5", pass: 0, total: 7, checks: [] };
        }

        const closes = cl.map(c => c.close);
        const ema50 = ema(closes, 50), ema200 = ema(closes, 200);
        const rsiArr = rsi(closes, 14), atrArr = atr(cl, 14), adxArr = adx(cl, 14);
        const bb = bollingerBands(closes, 20, 2);

        const idx = cl.length - 1;
        const lastClose = closes[idx], lastRsi = rsiArr[idx], lastAtr = atrArr[idx] || 1, lastAdx = adxArr[idx] || 20;
        const lastUpper = bb.upper[idx], lastLower = bb.lower[idx];

        let h1Trend = 'NEUTRAL';
        if (candlesH1 && candlesH1.length >= 200) {
            const h1Ema50 = ema(candlesH1.map(c => c.close), 50)[candlesH1.length - 1];
            const h1Ema200 = ema(candlesH1.map(c => c.close), 200)[candlesH1.length - 1];
            if (h1Ema50 > h1Ema200) h1Trend = 'UP'; else if (h1Ema50 < h1Ema200) h1Trend = 'DOWN';
        }

        let m15Trend = 'NEUTRAL';
        if (candlesM15 && candlesM15.length >= 50) {
            const m15Ema21 = ema(candlesM15.map(c => c.close), 21)[candlesM15.length - 1];
            const m15Ema50 = ema(candlesM15.map(c => c.close), 50)[candlesM15.length - 1];
            if (m15Ema21 > m15Ema50) m15Trend = 'UP'; else if (m15Ema21 < m15Ema50) m15Trend = 'DOWN';
        }

        const mode = opts.mode || (lastAdx >= 22 ? "pattern" : "range");
        
        // تعیین جهت مورد بررسی (بر اساس روند M5)
        const trendUpM5 = ema50[idx] > ema200[idx];
        const checkedSide = trendUpM5 ? 'LONG' : 'SHORT';

        const checks = [];
        let side = null;
        let failReason = null;

        if (mode === "range") {
            const isLowTrend = lastAdx < 25;
            checks.push({ l: `رنج / ADX ملایم (${lastAdx.toFixed(1)})`, ok: isLowTrend, v: isLowTrend ? 'تایید' : 'رد' });
            if (!isLowTrend && !failReason) failReason = "ADX قوی است";

            const isNotSqueeze = (lastUpper - lastLower) > (lastAtr * 1.5);
            checks.push({ l: "عرض بولینگر کافی", ok: isNotSqueeze, v: isNotSqueeze ? 'تایید' : 'رد' });
            if (!isNotSqueeze && !failReason) failReason = "بازار فشرده است";

            const rsiBuy = lastRsi <= (opts.rsiL || 38);
            const rsiSell = lastRsi >= (opts.rsiS || 62);
            const bbBuy = lastLower && lastClose <= lastLower + (lastAtr * 0.2);
            const bbSell = lastUpper && lastClose >= lastUpper - (lastAtr * 0.2);

            if (rsiBuy && bbBuy) side = "LONG";
            else if (rsiSell && bbSell) side = "SHORT";

            checks.push({ l: `اشباع RSI + برخورد بولینگر`, ok: !!side, v: `RSI ${lastRsi.toFixed(1)}` });
            if (!side && !failReason) failReason = "شرایط رنج برقرار نیست";
        } else {
            const isTrending = lastAdx >= 20;
            checks.push({ l: `روند / ADX قوی (${lastAdx.toFixed(1)})`, ok: isTrending, v: isTrending ? 'تایید' : 'رد' });
            if (!isTrending && !failReason) failReason = "ADX ضعیف";

            if (trendUpM5) side = "LONG";
            else if (ema50[idx] < ema200[idx]) side = "SHORT";

            checks.push({ l: "همسویی روند M5 (EMA50/200)", ok: !!side, v: side ? checkedSide : 'رد' });
            if (!side && !failReason) failReason = "عدم هم‌راستایی روند M5";
        }

        if (opts.h1 !== false) {
            const isOk = (checkedSide === 'LONG' && h1Trend === 'UP') || (checkedSide === 'SHORT' && h1Trend === 'DOWN');
            checks.push({ l: "همسو با روند H1 (MTF)", ok: isOk, v: isOk ? 'تایید' : 'رد' });
            if (!isOk && !failReason) failReason = "مخالف روند H1";
        }

        if (opts.m15 !== false) {
            const isOk = (checkedSide === 'LONG' && m15Trend === 'UP') || (checkedSide === 'SHORT' && m15Trend === 'DOWN');
            checks.push({ l: "همسو با روند M15", ok: isOk, v: isOk ? 'تایید' : 'رد' });
            if (!isOk && !failReason) failReason = "مخالف روند M15";
        }

        if (opts.pat !== false && mode === "pattern") {
            const pattern = checkPattern3to1(cl);
            const isOk = checkedSide === 'LONG' ? pattern.pattern_buy : pattern.pattern_sell;
            checks.push({ l: "الگوی دقیق ۳+۱", ok: isOk, v: isOk ? 'تایید' : 'رد' });
            if (!isOk && !failReason) failReason = "الگوی ۳+۱ معتبر نیست";
        }

        if (opts.pa !== false) {
            const paOk = checkPriceActionConfirmation(cl, checkedSide);
            checks.push({ l: "تاییدیه پرایس‌اکشن", ok: paOk, v: paOk ? 'تایید' : 'رد' });
            if (!paOk && !failReason) failReason = "عدم تایید PA";
        }

        const swings = findSwingLevels(cl, 50);
        const riskDist = lastAtr * (opts.slAtr || 1.5);
        let structOk = true;
        if (checkedSide === "LONG" && swings.swingHigh && (swings.swingHigh - lastClose) < riskDist) structOk = false;
        if (checkedSide === "SHORT" && swings.swingLow && (lastClose - swings.swingLow) < riskDist) structOk = false;
        
        checks.push({ l: "ساختار بازار (فاصله از سوئینگ)", ok: structOk, v: structOk ? 'تایید' : 'رد' });
        if (!structOk && !failReason) failReason = "نزدیک به ساختار";

        const entry = lastClose;
        const sl = checkedSide === "LONG" ? entry - riskDist : entry + riskDist;
        const tp1 = checkedSide === "LONG" ? entry + riskDist * 1.5 : entry - riskDist * 1.5;
        const tp2 = checkedSide === "LONG" ? entry + riskDist * 3.0 : entry - riskDist * 3.0;

        const totalPass = checks.filter(c => c.ok).length;
        const total = checks.length;
        const allPassed = (totalPass === total);

        return {
            side: allPassed ? checkedSide : null,
            checkedSide: checkedSide, // جهت مورد بررسی
            mode,
            entry, sl, tp: tp1, tp2,
            rsi: lastRsi, adx: lastAdx,
            pass: totalPass,
            total: total,
            checks,
            fail: allPassed ? null : (failReason || "شرایط کافی نیست")
        };
    }

    return { ema, rsi, atr, adx, bollingerBands, dropForming, findSwingLevels, checkPattern3to1, evaluate };
}));
