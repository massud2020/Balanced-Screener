// engine.js — Balanced Screener Core Engine (V6.1 - Quality Filter (WR-focused))
(function (root, factory) {
    var eng = factory(root);
    try { if (typeof define === 'function' && define.amd) { define([], function () { return eng; }); } } catch (e) {}
    try { if (typeof module === 'object' && module.exports) { module.exports = eng; } } catch (e) {}
    root.Engine = eng;
    if (typeof globalThis !== 'undefined') globalThis.Engine = eng;
    if (typeof window !== 'undefined') window.Engine = eng;
}(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
    'use strict';

    let PresetAPI = root && root.Presets;
    if (!PresetAPI && typeof require === 'function') { try { PresetAPI = require('./presets.js'); } catch (e) {} }
    const getPreset = PresetAPI && PresetAPI.getPreset ? PresetAPI.getPreset : (() => ({}));

    const CORRELATION_GROUPS = [
        ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD'],
        ['USDJPY', 'USDCHF', 'USDCAD'],
        ['EURUSD', 'EURGBP', 'EURJPY', 'EURAUD', 'EURCHF'],
        ['GBPUSD', 'GBPJPY', 'GBPAUD', 'GBPCHF', 'GBPNZD'],
        ['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'CHFJPY', 'NZDJPY'],
        ['XAUUSD', 'XAGUSD'],
        ['BTCUSDT', 'ETHUSDT'],
        ['SOLUSDT', 'DOTUSDT', 'AVAXUSDT', 'LINKUSDT', 'ADAUSDT', 'SUIUSDT', 'DOGEUSDT', 'XRPUSDT', 'LTCUSDT', 'BNBUSDT'],
        ['US30', 'NAS100', 'SPX500', 'US2000'],
        ['UK100', 'DE40', 'FR40'],
        ['WTICO', 'BRENT'],
        ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'AVGO', 'NFLX', 'PLTR']
    ];

    function getCorrelationGroups(symbol) {
        const key = PresetAPI && PresetAPI.normalizeSymbol ? PresetAPI.normalizeSymbol(symbol) : String(symbol || '').toUpperCase();
        const groups = [];
        for (let i = 0; i < CORRELATION_GROUPS.length; i++) if (CORRELATION_GROUPS[i].includes(key)) groups.push(i);
        return groups;
    }

    function getCorrelationGroup(symbol) {
        const groups = getCorrelationGroups(symbol);
        return groups.length ? groups[0] : -1;
    }

    function filterCorrelated(rows) {
        const ordered = [...(rows || [])].sort((a, b) => (Number(b.scorePercent) || Number(b.pass) || 0) - (Number(a.scorePercent) || Number(a.pass) || 0));
        const kept = [], used = new Set();
        for (const row of ordered) {
            const groups = getCorrelationGroups(row.id || row.symbol);
            if (groups.some(group => used.has(group))) continue;
            groups.forEach(group => used.add(group));
            kept.push(row);
        }
        return kept;
    }

    function isSessionActive(nowSec, opts = {}) {
        if (opts.sessionFilter !== true) return true;
        const session = opts.session || { start: Number.isFinite(Number(opts.sessionStart)) ? Number(opts.sessionStart) : 7, end: Number.isFinite(Number(opts.sessionEnd)) ? Number(opts.sessionEnd) : 21 };
        const d = new Date(nowSec * 1000);
        const utcHour = d.getUTCHours();
        const day = d.getUTCDay();
        if (day === 0 || day === 6) return false;
        const start = Number(session.start), end = Number(session.end);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return true;
        return start < end ? (utcHour >= start && utcHour < end) : (utcHour >= start || utcHour < end);
    }

    function isNewsBlackout(nowSec, opts = {}) {
        if (!opts.newsHours || !opts.newsHours.length) return false;
        const d = new Date(nowSec * 1000);
        const utcHour = d.getUTCHours();
        return opts.newsHours.includes(utcHour);
    }

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
        if (!Array.isArray(data) || !Number.isInteger(period) || period < 1 || data.length <= period) {
            return new Array(Array.isArray(data) ? data.length : 0).fill(null);
        }
        const out = new Array(data.length).fill(null);
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const diff = data[i] - data[i - 1];
            if (diff > 0) gains += diff;
            else if (diff < 0) losses += Math.abs(diff);
        }
        let avgGain = gains / period, avgLoss = losses / period;
        const value = () => {
            if (avgGain === 0 && avgLoss === 0) return 50;
            if (avgLoss === 0) return 100;
            if (avgGain === 0) return 0;
            const rs = avgGain / avgLoss;
            return 100 - (100 / (1 + rs));
        };
        out[period] = value();
        for (let i = period + 1; i < data.length; i++) {
            const diff = data[i] - data[i - 1];
            const gain = diff > 0 ? diff : 0;
            const loss = diff < 0 ? -diff : 0;
            avgGain = ((avgGain * (period - 1)) + gain) / period;
            avgLoss = ((avgLoss * (period - 1)) + loss) / period;
            out[i] = value();
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
        const length = Array.isArray(candles) ? candles.length : 0;
        const out = new Array(length).fill(null);
        if (!Array.isArray(candles) || !Number.isInteger(period) || period < 1 || length < (period * 2)) return out;

        const tr = new Array(length).fill(0);
        const plusDM = new Array(length).fill(0);
        const minusDM = new Array(length).fill(0);
        for (let i = 1; i < length; i++) {
            const current = candles[i], previous = candles[i - 1];
            tr[i] = Math.max(
                current.high - current.low,
                Math.abs(current.high - previous.close),
                Math.abs(current.low - previous.close)
            );
            const upMove = current.high - previous.high;
            const downMove = previous.low - current.low;
            plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
            minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
        }

        // Wilder's smoothed sums: seed with a period sum, then subtract 1/period
        // of the previous sum before adding the new observation.
        const trSmooth = new Array(length).fill(null);
        const plusSmooth = new Array(length).fill(null);
        const minusSmooth = new Array(length).fill(null);
        let trSeed = 0, plusSeed = 0, minusSeed = 0;
        for (let i = 1; i <= period; i++) {
            trSeed += tr[i];
            plusSeed += plusDM[i];
            minusSeed += minusDM[i];
        }
        trSmooth[period] = trSeed;
        plusSmooth[period] = plusSeed;
        minusSmooth[period] = minusSeed;

        for (let i = period + 1; i < length; i++) {
            trSmooth[i] = trSmooth[i - 1] - (trSmooth[i - 1] / period) + tr[i];
            plusSmooth[i] = plusSmooth[i - 1] - (plusSmooth[i - 1] / period) + plusDM[i];
            minusSmooth[i] = minusSmooth[i - 1] - (minusSmooth[i - 1] / period) + minusDM[i];
        }

        const dx = new Array(length).fill(null);
        for (let i = period; i < length; i++) {
            const smoothedTR = trSmooth[i];
            if (!Number.isFinite(smoothedTR) || smoothedTR <= 0) { dx[i] = 0; continue; }
            const plusDI = (plusSmooth[i] / smoothedTR) * 100;
            const minusDI = (minusSmooth[i] / smoothedTR) * 100;
            const diSum = plusDI + minusDI;
            dx[i] = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;
        }

        // The first ADX is the arithmetic mean of the first `period` DX values.
        const firstAdxIndex = period * 2 - 1;
        let dxSeed = 0;
        for (let i = period; i <= firstAdxIndex; i++) {
            if (!Number.isFinite(dx[i])) return out;
            dxSeed += dx[i];
        }
        out[firstAdxIndex] = dxSeed / period;
        for (let i = firstAdxIndex + 1; i < length; i++) {
            if (!Number.isFinite(dx[i])) continue;
            out[i] = ((out[i - 1] * (period - 1)) + dx[i]) / period;
        }
        return out.map(v => v === null ? null : Math.max(0, Math.min(100, v)));
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

    function checkPattern3to1(candles, minBodyRatio = 0.75) {
        if (!Array.isArray(candles) || candles.length < 4) {
            return { pattern_buy: false, pattern_sell: false, buyRatio: null, sellRatio: null };
        }
        const recent = candles.slice(-4);
        let greenCount = 0, redCount = 0, greenBody = 0, redBody = 0;
        for (const candle of recent) {
            const body = Math.abs(candle.close - candle.open);
            if (candle.close > candle.open) { greenCount++; greenBody += body; }
            else if (candle.close < candle.open) { redCount++; redBody += body; }
        }
        const buyRatio = redBody > 0 && greenCount === 1 ? greenBody / redBody : null;
        const sellRatio = greenBody > 0 && redCount === 1 ? redBody / greenBody : null;
        const threshold = Number.isFinite(minBodyRatio) && minBodyRatio >= 0 ? minBodyRatio : 0.75;
        // Last candle should be the impulse (buy=green, sell=red)
        const last = recent[3];
        const lastGreen = last.close > last.open;
        const lastRed = last.close < last.open;
        return {
            pattern_buy: redCount === 3 && greenCount === 1 && lastGreen && buyRatio !== null && buyRatio >= threshold,
            pattern_sell: greenCount === 3 && redCount === 1 && lastRed && sellRatio !== null && sellRatio >= threshold,
            buyRatio,
            sellRatio
        };
    }

    function nearEmaPullback(candles, emaArr, atrVal, side, opts = {}) {
        // محدوده پولبک (نه فقط لمس دقیق): پیش‌فرض تا 1.8 ATR از EMA
        // تا معاملات خوبِ کمی دور از خط از دست نروند، ولی ورودهای خیلی کشیده رد شوند.
        if (!candles || !emaArr || candles.length < 6) return false;
        const atr = Math.max(Number(atrVal) || 0, 1e-12);
        const minDist = Number.isFinite(Number(opts.pullbackMinAtr)) ? Number(opts.pullbackMinAtr) : 0.0;
        const maxDist = Number.isFinite(Number(opts.pullbackMaxAtr)) ? Number(opts.pullbackMaxAtr) : 1.8;
        const lookback = Math.max(4, Math.floor(Number(opts.pullbackLookback) || 12));
        const from = Math.max(0, candles.length - lookback);
        for (let i = from; i < candles.length; i++) {
            const e = emaArr[i];
            if (!Number.isFinite(e)) continue;
            const bar = candles[i];
            if (side === 'LONG') {
                // کمینه قیمت در محدوده زیر/روی EMA، و کلوز نباید خیلی زیر EMA شکسته باشد
                const dist = (e - bar.low) / atr; // مثبت = low زیر EMA
                const distClose = (bar.close - e) / atr;
                const inZone = bar.low <= e + atr * 0.25 && dist <= maxDist && dist >= -0.25;
                const notBroken = distClose >= -0.35; // کلوز خیلی زیر EMA نباشد
                if (inZone && notBroken && Math.abs(Math.min(dist, 0)) <= maxDist) return true;
                // نزدیک از بالا هم قبول (پولبک سطحی)
                if (bar.low <= e + atr * maxDist && bar.close >= e - atr * 0.35 && (e - bar.low) / atr <= maxDist) return true;
            } else {
                const dist = (bar.high - e) / atr;
                const distClose = (e - bar.close) / atr;
                const inZone = bar.high >= e - atr * 0.25 && dist <= maxDist && dist >= -0.25;
                const notBroken = distClose >= -0.35;
                if (inZone && notBroken) return true;
                if (bar.high >= e - atr * maxDist && bar.close <= e + atr * 0.35 && (bar.high - e) / atr <= maxDist) return true;
            }
        }
        return false;
    }

    function countBandTouches(candles, bandArr, atrVal, side, lookback = 30) {
        if (!candles || !bandArr) return 0;
        const n = candles.length;
        const from = Math.max(1, n - lookback);
        const tol = Math.max(Number(atrVal) * 0.12, 1e-12);
        let touches = 0;
        for (let i = from; i < n; i++) {
            const b = bandArr[i];
            if (!Number.isFinite(b)) continue;
            if (side === 'LONG' && candles[i].low <= b + tol) touches++;
            if (side === 'SHORT' && candles[i].high >= b - tol) touches++;
        }
        return touches;
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

    function evaluate(symbol, candlesM5, candlesM15, candlesH1, opts = {}, nowSec = Date.now() / 1000) {
        const preset = getPreset(symbol);
        opts = { ...preset, ...opts };
        if (opts.enabled === false) {
            return { side: null, checkedSide: 'LONG', fail: "نماد در تنظیمات غیرفعال است", pass: 0, total: 0, checks: [], score: 0, maxScore: 0, scorePercent: 0, tier: null };
        }
        if (!isSessionActive(nowSec, opts)) {
            return { side: null, checkedSide: 'LONG', fail: "خارج از سشن معاملاتی", pass: 0, total: 0, checks: [], score: 0, maxScore: 0, scorePercent: 0, tier: null };
        }
        if (isNewsBlackout(nowSec, opts)) {
            return { side: null, checkedSide: 'LONG', fail: "ساعت خبر مهم", pass: 0, total: 0, checks: [], score: 0, maxScore: 0, scorePercent: 0, tier: null };
        }

        const signalIntervalSec = Number(opts.signalIntervalSec) > 0 ? Number(opts.signalIntervalSec) : 300;
        const cl = dropForming(candlesM5, signalIntervalSec, nowSec);
        if (!cl || cl.length < 200) {
            return { side: null, checkedSide: 'LONG', fail: "کمبود کندل تایم‌فریم سیگنال", pass: 0, total: 0, checks: [], score: 0, maxScore: 0, scorePercent: 0, tier: null };
        }

        const closes = cl.map(c => c.close);
        const ema21 = ema(closes, 21), ema50 = ema(closes, 50), ema200 = ema(closes, 200);
        const rsiArr = rsi(closes, 14), atrArr = atr(cl, 14), adxArr = adx(cl, 14);
        const bb = bollingerBands(closes, 20, 2);

        const idx = cl.length - 1;
        const lastClose = closes[idx], lastRsi = rsiArr[idx];
        const lastAtr = (Number.isFinite(atrArr[idx]) && atrArr[idx] > 0) ? atrArr[idx] : (cl[idx].high - cl[idx].low);
        const lastAdx = Number.isFinite(adxArr[idx]) ? adxArr[idx] : 20;
        const lastUpper = bb.upper[idx], lastLower = bb.lower[idx];

        // MTF filters must use the latest fully closed candle, never a forming bar.
        const closedH1 = dropForming(candlesH1 || [], 3600, nowSec);
        const closedM15 = dropForming(candlesM15 || [], 900, nowSec);

        let h1Trend = 'NEUTRAL';
        if (closedH1.length >= 200) {
            const h1Closes = closedH1.map(c => c.close);
            const h1Ema50 = ema(h1Closes, 50)[closedH1.length - 1];
            const h1Ema200 = ema(h1Closes, 200)[closedH1.length - 1];
            if (Number.isFinite(h1Ema50) && Number.isFinite(h1Ema200)) {
                if (h1Ema50 > h1Ema200) h1Trend = 'UP'; else if (h1Ema50 < h1Ema200) h1Trend = 'DOWN';
            }
        }

        let m15Trend = 'NEUTRAL';
        if (closedM15.length >= 50) {
            const m15Closes = closedM15.map(c => c.close);
            const m15Ema21 = ema(m15Closes, 21)[closedM15.length - 1];
            const m15Ema50 = ema(m15Closes, 50)[closedM15.length - 1];
            if (Number.isFinite(m15Ema21) && Number.isFinite(m15Ema50)) {
                if (m15Ema21 > m15Ema50) m15Trend = 'UP'; else if (m15Ema21 < m15Ema50) m15Trend = 'DOWN';
            }
        }

        const mode = opts.mode || (preset.mode) || (lastAdx >= 22 ? "pattern" : "range");
        const checks = [];
        let side = null;
        let checkedSide = 'LONG';

        if (mode === "range") {
            const useRsiFilter = opts.rsi !== false;
            const useBbFilter = opts.bb !== false;
            const useWidthFilter = opts.rangeWidth !== false;
            const useReversalFilter = opts.rangeReversal !== false;
            const rangeRsiL = opts.rangeRsiL ?? opts.rsiL ?? 42;
            const rangeRsiS = opts.rangeRsiS ?? opts.rsiS ?? 58;
            const rsiBuy = !useRsiFilter || lastRsi <= rangeRsiL;
            const rsiSell = !useRsiFilter || lastRsi >= rangeRsiS;
            const cLast = cl[idx], cPrev = cl[idx - 1] || cLast;
            const bodyLast = Math.abs(cLast.close - cLast.open);
            const lowerWick = Math.min(cLast.open, cLast.close) - cLast.low;
            const upperWick = cLast.high - Math.max(cLast.open, cLast.close);
            const bullRejection = !useReversalFilter || (cLast.close > cLast.open) || (lowerWick > bodyLast * 1.2);
            const bearRejection = !useReversalFilter || (cLast.close < cLast.open) || (upperWick > bodyLast * 1.2);

            const touchedLower = Number.isFinite(lastLower) && (cLast.low <= lastLower + (lastAtr * 0.15) || cPrev.low <= lastLower + (lastAtr * 0.15));
            const touchedUpper = Number.isFinite(lastUpper) && (cLast.high >= lastUpper - (lastAtr * 0.15) || cPrev.high >= lastUpper - (lastAtr * 0.15));

            const insideLower = !Number.isFinite(lastLower) || cLast.close > lastLower;
        const insideUpper = !Number.isFinite(lastUpper) || cLast.close < lastUpper;
        const bbBuy = !useBbFilter || (touchedLower && bullRejection && insideLower);
        const bbSell = !useBbFilter || (touchedUpper && bearRejection && insideUpper);
            if ((useRsiFilter || useBbFilter) && rsiBuy && bbBuy) { side = "LONG"; checkedSide = "LONG"; }
            else if ((useRsiFilter || useBbFilter) && rsiSell && bbSell) { side = "SHORT"; checkedSide = "SHORT"; }
            else { side = null; checkedSide = ema50[idx] > ema200[idx] ? "LONG" : "SHORT"; }

            // ذخیره برای چک لمس‌های متعدد باند
            opts.__rangeTouchSide = side;
        } else {
            if (ema50[idx] > ema200[idx]) {
                side = "LONG";
                checkedSide = "LONG";
            } else if (ema50[idx] < ema200[idx]) {
                side = "SHORT";
                checkedSide = "SHORT";
            } else {
                side = null;
                checkedSide = "NEUTRAL";
            }
        }

        let failReason = null;
        // Trend's defining EMA structure is a hard gate, not a weighted score.
        // A valid score must never compensate for a broken EMA21/50/200 alignment.
        let trendEmaGate = true;
        let trendPatternGate = true;
        if (mode !== "range") {
            trendEmaGate = checkedSide === "LONG"
                ? ema21[idx] > ema50[idx] && ema50[idx] > ema200[idx]
                : checkedSide === "SHORT"
                    ? ema21[idx] < ema50[idx] && ema50[idx] < ema200[idx]
                    : false;
            checks.push({
                l: "گیت الزامی چینش EMA21/50/200",
                ok: trendEmaGate,
                v: trendEmaGate ? "تایید" : "رد",
                w: 0
            });
            if (!trendEmaGate && !failReason) failReason = "چینش الزامی EMA21/50/200 برقرار نیست";
        }

        if (mode === "range") {
            if (opts.adx !== false) {
                const rangeAdxMax = Number.isFinite(Number(opts.rangeAdxMax)) ? Number(opts.rangeAdxMax) : 25;
                const isLowTrend = lastAdx <= rangeAdxMax;
                checks.push({ l: `رنج / ADX ملایم (${lastAdx.toFixed(1)})`, ok: isLowTrend, v: isLowTrend ? 'تایید' : 'رد', w: 1.0 });
                if (!isLowTrend && !failReason) failReason = "ADX قوی است";
            }

            const minBandWidthAtr = Number.isFinite(Number(opts.rangeMinATR)) ? Number(opts.rangeMinATR) : 1.5;
            const bandWidthAtr = (lastUpper - lastLower) / Math.max(lastAtr, Number.EPSILON);
            const useWidthFilter = opts.rangeWidth !== false;
            const isNotSqueeze = !useWidthFilter || bandWidthAtr >= minBandWidthAtr;
            checks.push({ l: "عرض بولینگر / ATR", ok: isNotSqueeze, v: `${bandWidthAtr.toFixed(2)} ATR`, w: 1.0 });
            if (!isNotSqueeze && !failReason) failReason = "عرض باند رنج کمتر از حداقل است";

            const minTouches = Math.max(2, Math.floor(Number(opts.rangeMinTouches) || 2));
            if (minTouches > 0) {
                const lookback = Math.max(4, Math.floor(Number(opts.rangeTouchLookback) || 30));
                const touchPct = Math.max(0, Number(opts.rangeTouchPct) || 0.1);
                let touches = 0;
                for (let j = Math.max(0, idx - lookback + 1); j <= idx; j++) {
                    const a = Number(atrArr[j]);
                    if (!Number.isFinite(a) || !Number.isFinite(bb.upper[j]) || !Number.isFinite(bb.lower[j])) continue;
                    const tol = a * touchPct;
                    if (cl[j].high >= bb.upper[j] - tol || cl[j].low <= bb.lower[j] + tol) touches++;
                }
                const enoughTouches = touches >= minTouches;
                checks.push({ l: `تعداد برخورد باند (${minTouches} حداقل)`, ok: enoughTouches, v: String(touches), w: 1.0 });
                if (!enoughTouches && !failReason) failReason = "برخورد کافی به باندهای رنج وجود ندارد";
            }

            const isRangeOk = !!side;
            const rangeLabel = (opts.rsi !== false && opts.bb !== false) ? "اشباع RSI + برخورد بولینگر" : (opts.bb !== false) ? "برخورد بولینگر (بدون فیلتر RSI)" : "اشباع RSI (بدون بولینگر)";
            checks.push({ l: rangeLabel, ok: isRangeOk, v: `RSI ${lastRsi.toFixed(1)}`, w: 2.0 });
            if (!isRangeOk && !failReason) failReason = "شرایط رنج برقرار نیست";
        } else {
            if (opts.adx !== false) {
                const prevAdx = Number.isFinite(adxArr[idx - 2]) ? adxArr[idx - 2] : lastAdx;
            const adxExhausted = lastAdx > 38 && lastAdx < prevAdx;
            const isTrending = lastAdx >= (opts.adxMin || 20) && !adxExhausted;
                checks.push({ l: `روند / ADX قوی (${lastAdx.toFixed(1)})`, ok: isTrending, v: isTrending ? 'تایید' : 'رد', w: 1.0 });
                if (!isTrending && !failReason) failReason = "ADX ضعیف";
            }

            if (opts.trend !== false) {
                const isOk = checkedSide === 'LONG' ? lastClose > ema200[idx] : lastClose < ema200[idx];
                checks.push({ l: "قیمت نسبت به EMA200", ok: isOk, v: isOk ? 'تایید' : 'رد', w: 1.5 });
                if (!isOk && !failReason) failReason = "مخالف EMA200";
            }
            if (opts.emax !== false) {
                const isOk = checkedSide === 'LONG' ? ema21[idx] > ema50[idx] : ema21[idx] < ema50[idx];
                checks.push({ l: "ترازبندی EMA21/50", ok: isOk, v: isOk ? 'تایید' : 'رد', w: 1.0 });
                if (!isOk && !failReason) failReason = "مخالف EMA21/50";
            }
            if (Number(opts.maxDistATR) > 0) {
                const distanceAtr = Math.abs(lastClose - ema21[idx]) / Math.max(lastAtr, Number.EPSILON);
                const distanceOk = distanceAtr <= Number(opts.maxDistATR);
                checks.push({ l: "فاصله ورود از EMA21", ok: distanceOk, v: `${distanceAtr.toFixed(2)} ATR`, w: 1.0 });
                if (!distanceOk && !failReason) failReason = "فاصله قیمت از EMA21 بیش از حد است";
            }
            if (opts.nc !== false) {
                let isOk = true;
                const lookNc = Math.min(5, idx);
                for (let k = idx - lookNc; k <= idx; k++) {
                    if (checkedSide === 'LONG' && ema21[k] <= ema50[k]) { isOk = false; break; }
                    if (checkedSide === 'SHORT' && ema21[k] >= ema50[k]) { isOk = false; break; }
                }
                checks.push({ l: "بدون تقاطع EMA21/50 (۵ کندل اخیر)", ok: isOk, v: isOk ? 'تایید' : 'رد', w: 0.5 });
                if (!isOk && !failReason) failReason = "تقاطع اخیر EMA21/50";
            }

            if (opts.rsi !== false) {
                const rsiTrendOk = checkedSide === 'LONG'
                    ? (lastRsi >= 42 && lastRsi <= 58)
                    : (lastRsi >= 42 && lastRsi <= 58);
                checks.push({ l: "محدوده RSI پولبک روند", ok: rsiTrendOk, v: `RSI ${lastRsi.toFixed(1)}`, w: 1.2 });
                if (!rsiTrendOk && !failReason) failReason = checkedSide === 'LONG' ? "RSI خارج از محدوده پولبک (42-58)" : "RSI خارج از محدوده پولبک (42-58)";
            }
        }

        if (opts.h1 !== false && closedH1.length >= 200) {
            const isOk = mode === "range"
                ? (h1Trend === 'NEUTRAL' || (checkedSide === 'LONG' && h1Trend === 'UP') || (checkedSide === 'SHORT' && h1Trend === 'DOWN'))
                : ((checkedSide === 'LONG' && h1Trend === 'UP') || (checkedSide === 'SHORT' && h1Trend === 'DOWN'));
            checks.push({ l: mode === "range" ? "عدم مخالفت روند H1" : "همسو با روند H1", ok: isOk, v: isOk ? 'تایید' : 'رد', w: 1.0 });
            if (!isOk && !failReason) failReason = "مخالف H1";
        }

        if (opts.m15 !== false && closedM15.length >= 50) {
            let isOk = true, valStr = 'تایید';
            if (mode === "range") {
                isOk = (m15Trend === 'NEUTRAL' || (checkedSide === 'LONG' && m15Trend === 'UP') || (checkedSide === 'SHORT' && m15Trend === 'DOWN'));
                valStr = isOk ? (m15Trend === 'NEUTRAL' ? 'خنثی (ایده‌آل)' : 'تایید') : 'رد';
            } else {
                if (m15Trend === 'NEUTRAL') { isOk = false; valStr = 'بدون دیتا'; }
                else { isOk = (checkedSide === 'LONG' && m15Trend === 'UP') || (checkedSide === 'SHORT' && m15Trend === 'DOWN'); valStr = isOk ? 'تایید' : 'رد'; }
            }
            checks.push({ l: mode === "range" ? "عدم مخالفت روند M15" : "همسو با روند M15", ok: isOk, v: valStr, w: 1.0 });
            if (!isOk && !failReason) failReason = "مخالف M15 یا بدون دیتا";
        }

        if (mode !== "range") {
            // The 3+1 pattern is mandatory for every Trend signal; opts.pat
            // cannot disable a strategy-defining condition.
            const patternMinRatio = Math.max(0.75, Number(opts.minRatio) > 0 ? Number(opts.minRatio) : 0.75);
            const pattern = checkPattern3to1(cl, patternMinRatio);
            trendPatternGate = checkedSide === 'LONG' ? pattern.pattern_buy : pattern.pattern_sell;
            checks.push({ l: "الگوی الزامی دقیق ۳+۱", ok: trendPatternGate, v: trendPatternGate ? 'تایید' : 'رد', w: 1.5 });
            if (!trendPatternGate && !failReason) failReason = "الگوی الزامی ۳+۱ برقرار نیست";

            // پولبک به EMA21/50 الزامی — جلوگیری از ورود وسط فضای خالی
            // محدوده پولبک فقط نسبت به EMA21 (تا 1.8 ATR) — EMA50 معیار پولبک نیست
            const pbOpts = {
                pullbackMinAtr: opts.pullbackMinAtr,
                pullbackMaxAtr: opts.pullbackMaxAtr != null ? opts.pullbackMaxAtr : 1.8,
                pullbackLookback: opts.pullbackLookback != null ? opts.pullbackLookback : 12
            };
            const pb21 = nearEmaPullback(cl, ema21, lastAtr, checkedSide, pbOpts);
            const pullbackOk = pb21;
            checks.push({ l: "محدوده پولبک EMA21", ok: pullbackOk, v: pullbackOk ? 'EMA21' : 'خارج محدوده', w: 1.1 });
            if (!pullbackOk && !failReason) failReason = "خارج از محدوده پولبک EMA21";
            if (!pullbackOk && (opts.pullbackHard !== true)) {
                /* soft: فقط روی امتیاز اثر دارد */
            } else if (!pullbackOk) {
                trendPatternGate = false;
            }

            // ضدکشیدگی: فاصله تا EMA200 نباید خیلی زیاد باشد
            const maxStretch = Number(opts.maxDistATR) > 0 ? Number(opts.maxDistATR) : 3.5;
            const distEma200 = Math.abs(lastClose - ema200[idx]) / Math.max(lastAtr, 1e-12);
            const notStretched = distEma200 <= maxStretch;
            checks.push({ l: `فاصله تا EMA200 (${distEma200.toFixed(1)} ATR)`, ok: notStretched, v: notStretched ? 'تایید' : 'کشیده', w: 1.0 });
            if (!notStretched && !failReason) failReason = "قیمت بیش از حد از EMA200 فاصله دارد";
        }

        // Price Action confirmation was removed from Trend entry logic in Build 94.
        // opts.pa is intentionally ignored to prevent legacy callers re-enabling it.

        const swingLook = Number(opts.swingLook) > 0 ? Math.floor(Number(opts.swingLook)) : 50;
        const swings = findSwingLevels(cl, swingLook);
        const requestedSlAtr = mode === "range"
            ? (Number(opts.rangeSlAtr) > 0 ? Number(opts.rangeSlAtr) : (Number(opts.slAtr) > 0 ? Number(opts.slAtr) : 1.6))
            : (Number(opts.slAtr) > 0 ? Number(opts.slAtr) : (Number(opts.atrMultSL) > 0 ? Number(opts.atrMultSL) : 1.5));
        const maxRiskAtr = mode === "range" && Number(opts.rangeMaxRiskATR) > 0 ? Number(opts.rangeMaxRiskATR) : Infinity;
        const effectiveSlAtr = Math.min(requestedSlAtr, maxRiskAtr);
        const riskDist = lastAtr * effectiveSlAtr;
        let structOk = true;
        if (mode !== "range") {
            if (checkedSide === "LONG" && Number.isFinite(swings.swingHigh) && swings.swingHigh > lastClose && (swings.swingHigh - lastClose) < riskDist) structOk = false;
            if (checkedSide === "SHORT" && Number.isFinite(swings.swingLow) && swings.swingLow < lastClose && (lastClose - swings.swingLow) < riskDist) structOk = false;
        }
        checks.push({ l: "ساختار بازار", ok: structOk, v: structOk ? 'تایید' : 'رد', w: 1.0 });
        if (!structOk && !failReason) failReason = "نزدیک به ساختار";

        const entry = lastClose;
        let sl = checkedSide === "LONG" ? entry - riskDist : entry + riskDist;
        const isCrypto = /USDT$|BTC|ETH|SOL|BNB|XRP|ADA|DOGE/i.test(String(symbol));
        let tp1R = mode === "range"
            ? (Number(opts.rangeTpMult) > 0 ? Number(opts.rangeTpMult) : (Number(opts.rangeMinRR) > 0 ? Number(opts.rangeMinRR) : 1.5))
            : (Number(opts.tp1R) > 0 ? Number(opts.tp1R) : 2.0);
        // حداقل RR خالص‌تر برای فارکس/فلزات
        if (!isCrypto && mode === "range") tp1R = Math.max(tp1R, 1.8);
        if (!isCrypto && mode !== "range") tp1R = Math.max(tp1R, 1.8);
        const tp2R = mode === "range" ? tp1R : (Number(opts.tp2R) > 0 ? Number(opts.tp2R) : 3.5);
        let tp1 = checkedSide === "LONG" ? entry + riskDist * tp1R : entry - riskDist * tp1R;
        let tp2 = checkedSide === "LONG" ? entry + riskDist * tp2R : entry - riskDist * tp2R;

        if (checkedSide === "LONG") {
            if (sl >= entry) sl = entry - riskDist;
            if (tp1 <= entry) tp1 = entry + riskDist * tp1R;
            if (tp2 <= entry) tp2 = entry + riskDist * tp2R;
        } else {
            if (sl <= entry) sl = entry + riskDist;
            if (tp1 >= entry) tp1 = entry - riskDist * tp1R;
            if (tp2 >= entry) tp2 = entry - riskDist * tp2R;
        }

        let score = 0, maxScore = 0;
        checks.forEach(c => {
            const w = Number.isFinite(c.w) ? c.w : 1;
            maxScore += w;
            if (c.ok) score += w;
        });
        const scorePercent = maxScore > 0 ? (score / maxScore) * 100 : 0;
        const MIN_SCORE_PERCENT = Number.isFinite(Number(opts.minScorePercent)) ? Number(opts.minScorePercent) : 85;
        let trendSideOk = true;
        if (mode !== "range" && checkedSide === "LONG") trendSideOk = lastClose >= ema200[idx];
        if (mode !== "range" && checkedSide === "SHORT") trendSideOk = lastClose <= ema200[idx];
        if (mode !== "range") {
            checks.push({ l: "سمت درست نسبت به EMA200", ok: trendSideOk, v: trendSideOk ? 'تایید' : 'رد', w: 0 });
            if (!trendSideOk && !failReason) failReason = "خلاف سمت EMA200";
        }
        const hardGatesPassed = mode === "range" || (trendEmaGate && trendPatternGate && trendSideOk);
        const allPassed = (scorePercent >= MIN_SCORE_PERCENT) && !!side && hardGatesPassed;

        let tier = null;
        if (allPassed) {
            if (scorePercent >= 95) tier = "PREMIUM";
            else if (scorePercent >= 80) tier = "STRONG";
            else tier = "STANDARD";
        }

        return {
            side: allPassed ? side : null,
            checkedSide: checkedSide,
            tier: tier,
            score: +score.toFixed(1),
            maxScore: +maxScore.toFixed(1),
            scorePercent: +scorePercent.toFixed(1),
            pass: +score.toFixed(1),
            total: +maxScore.toFixed(1),
            mode, entry, sl, tp: mode === "range" ? tp1 : null, tp1: mode === "range" ? tp1 : null, tp2: mode === "range" ? tp2 : null, tp1R: mode === "range" ? tp1R : null, tp2R: mode === "range" ? tp2R : null, rsi: lastRsi, adx: lastAdx,
            trailingAtrStep: lastAtr * (Number(opts.trailingAtrMult) > 0 ? Number(opts.trailingAtrMult) : 0.5),
            atr: lastAtr,
            effectiveSlAtr,
            correlationGroup: getCorrelationGroup(symbol),
            hardGates: mode === "range" ? [] : [
                { name: "EMA21/EMA50/EMA200", passed: trendEmaGate },
                { name: "3+1 pattern", passed: trendPatternGate }
            ],
            checks, fail: allPassed ? null : (failReason || "امتیاز کافی نیست")
        };
    }

    return { ema, rsi, atr, adx, bollingerBands, dropForming, findSwingLevels, checkPattern3to1, evaluate, getCorrelationGroup, getCorrelationGroups, filterCorrelated, CORRELATION_GROUPS, isSessionActive, isInTradingSession: isSessionActive, isNewsBlackout };
}));
