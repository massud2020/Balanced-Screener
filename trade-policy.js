// trade-policy.js — deterministic exit policy with real Bid/Ask spread support.
const TradePolicy = (() => {
    function calcRSI(closes, period = 14) {
        const out = new Array(closes.length).fill(null);
        if (closes.length <= period) return out;
        let avgGain = 0, avgLoss = 0;
        for (let i = 1; i <= period; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff > 0) avgGain += diff;
            else avgLoss += -diff;
        }
        avgGain /= period; avgLoss /= period;
        const value = () => (avgGain === 0 && avgLoss === 0) ? 50 : (avgLoss === 0 ? 100 : (avgGain === 0 ? 0 : 100 - (100 / (1 + avgGain / avgLoss))));
        out[period] = value();
        for (let i = period + 1; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period;
            avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period;
            out[i] = value();
        }
        return out;
    }

    function calcAtrSeries(bars, period = 14, initialAtr = null, previousClose = null) {
        const out = new Array(bars.length).fill(null);
        if (!bars.length) return out;
        let prevAtr = Number(initialAtr) > 0 ? Number(initialAtr) : null;
        let prevClose = previousClose != null && Number.isFinite(Number(previousClose)) ? Number(previousClose) : null;
        let seed = [];
        for (let i = 0; i < bars.length; i++) {
            const bar = bars[i];
            const tr = prevClose == null
                ? Math.max(0, bar.high - bar.low)
                : Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
            if (prevAtr == null) {
                seed.push(tr);
                if (seed.length < period) out[i] = seed.reduce((a, b) => a + b, 0) / seed.length;
                else if (seed.length === period) { prevAtr = seed.reduce((a, b) => a + b, 0) / period; out[i] = prevAtr; }
                else { prevAtr = ((prevAtr * (period - 1)) + tr) / period; out[i] = prevAtr; }
            } else {
                prevAtr = ((prevAtr * (period - 1)) + tr) / period;
                out[i] = prevAtr;
            }
            prevClose = bar.close;
        }
        return out;
    }

    function checkDivergence(bars, rsiArr, isLong, lookback = 15) {
        const len = bars.length;
        if (len < lookback + 2) return false;
        const start = len - lookback;
        const peaks = [], troughs = [];
        for (let i = start + 1; i < len - 1; i++) {
            if (bars[i].high > bars[i - 1].high && bars[i].high > bars[i + 1].high) peaks.push(i);
            if (bars[i].low < bars[i - 1].low && bars[i].low < bars[i + 1].low) troughs.push(i);
        }
        if (isLong && peaks.length >= 2) {
            const p1 = peaks[peaks.length - 2], p2 = peaks[peaks.length - 1];
            if (Number.isFinite(rsiArr[p1]) && Number.isFinite(rsiArr[p2]) && bars[p2].high > bars[p1].high && rsiArr[p2] < rsiArr[p1] && rsiArr[p1] > 65) return true;
        }
        if (!isLong && troughs.length >= 2) {
            const t1 = troughs[troughs.length - 2], t2 = troughs[troughs.length - 1];
            if (Number.isFinite(rsiArr[t1]) && Number.isFinite(rsiArr[t2]) && bars[t2].low < bars[t1].low && rsiArr[t2] > rsiArr[t1] && rsiArr[t1] < 35) return true;
        }
        return false;
    }

    function resolveTrade({ side, entry, sl, mode, bars, startTime = 0, maxHoldSec, opts = {} }) {
        if (!Array.isArray(bars) || bars.length === 0) return { status: 'open', currentSl: sl };
        if (!Number.isFinite(Number(entry)) || !Number.isFinite(Number(sl)) || Number(entry) === Number(sl)) {
            return { status: 'invalid', reason: 'invalid_entry_or_stop' };
        }
        const isLong = side === 'LONG';
        const risk = Math.abs(entry - sl);
        const period = Math.max(2, Math.floor(Number(opts.atrPeriod) || 14));
        const closes = bars.map(b => b.close);
        const rsiArr = calcRSI(closes, 14);
        const atrArr = calcAtrSeries(bars, period, opts.initialAtr, opts.previousClose);
        let currentSl = sl;
        const maxHold = Number(maxHoldSec) > 0 ? Number(maxHoldSec) : 24 * 3600;
        const rangeTpMult = Number(opts.rangeTpMult) > 0 ? Number(opts.rangeTpMult) : 1.5;
        const rangeTp = isLong ? entry + risk * rangeTpMult : entry - risk * rangeTpMult;
        const trailMult = Number(opts.trailingAtrMult) > 0 ? Number(opts.trailingAtrMult) : 1.2;
        const trailAfterR = Number(opts.trailAfterR) > 0 ? Number(opts.trailAfterR) : 1.0;
        const maxLossR = Number(opts.maxLossR) > 0 ? Number(opts.maxLossR) : 2.0;
    const capClosed = (res) => {
      if (!res || res.status !== 'closed' || !Number.isFinite(res.R)) return res;
      if (res.R < -maxLossR) {
        const cappedExit = isLong ? entry - risk * maxLossR : entry + risk * maxLossR;
        return { ...res, exit: cappedExit, R: -maxLossR, gapCapped: true };
      }
      return res;
    };
    let peakFav = 0;

        for (let i = 0; i < bars.length; i++) {
            const bar = bars[i];
            if (bar.time < startTime) continue;
            if (![bar.high, bar.low, bar.close, bar.time].every(Number.isFinite)) continue;

            const bidOpen = Number.isFinite(bar.bidOpen) ? bar.bidOpen : bar.open;
            const bidHigh = Number.isFinite(bar.bidHigh) ? bar.bidHigh : bar.high;
            const bidLow = Number.isFinite(bar.bidLow) ? bar.bidLow : bar.low;
            const bidClose = Number.isFinite(bar.bidClose) ? bar.bidClose : bar.close;

            const askOpen = Number.isFinite(bar.askOpen) ? bar.askOpen : bar.open;
            const askHigh = Number.isFinite(bar.askHigh) ? bar.askHigh : bar.high;
            const askLow = Number.isFinite(bar.askLow) ? bar.askLow : bar.low;
            const askClose = Number.isFinite(bar.askClose) ? bar.askClose : bar.close;

            if (mode === 'range') {
                if (isLong && bidLow <= sl) {
                    const exit = Number.isFinite(bidOpen) && bidOpen < sl ? bidOpen : sl;
                    return capClosed({ status: 'closed', why: 'SL', exit, closeTime: bar.time, R: (exit - entry) / risk, peakFav });
                }
                if (!isLong && askHigh >= sl) {
                    const exit = Number.isFinite(askOpen) && askOpen > sl ? askOpen : sl;
                    return capClosed({ status: 'closed', why: 'SL', exit, closeTime: bar.time, R: (entry - exit) / risk, peakFav });
                }
                if (isLong && bidHigh >= rangeTp) {
                    const exit = Number.isFinite(bidOpen) && bidOpen > rangeTp ? bidOpen : rangeTp;
                    return capClosed({ status: 'closed', why: 'TP', exit, closeTime: bar.time, R: (exit - entry) / risk, peakFav });
                }
                if (!isLong && askLow <= rangeTp) {
                    const exit = Number.isFinite(askOpen) && askOpen < rangeTp ? askOpen : rangeTp;
                    return capClosed({ status: 'closed', why: 'TP', exit, closeTime: bar.time, R: (entry - exit) / risk, peakFav });
                }
            } else {
                if (isLong && bidLow <= currentSl) {
                    const exit = Number.isFinite(bidOpen) && bidOpen < currentSl ? bidOpen : currentSl;
                    return capClosed({ status: 'closed', why: 'TRAIL_SL', exit, closeTime: bar.time, R: (exit - entry) / risk, peakFav });
                }
                if (!isLong && askHigh >= currentSl) {
                    const exit = Number.isFinite(askOpen) && askOpen > currentSl ? askOpen : currentSl;
                    return capClosed({ status: 'closed', why: 'TRAIL_SL', exit, closeTime: bar.time, R: (entry - exit) / risk, peakFav });
                }

                const favorable = isLong ? (bidHigh - entry) / risk : (entry - askLow) / risk;
                peakFav = Math.max(peakFav, favorable);
                if (checkDivergence(bars.slice(0, i + 1), rsiArr.slice(0, i + 1), isLong)) {
                    const exitPx = isLong ? bidClose : askClose;
                    const rMult = isLong ? (exitPx - entry) / risk : (entry - exitPx) / risk;
                    return capClosed({ status: 'closed', why: 'RSI_DIV', exit: exitPx, closeTime: bar.time, R: rMult, peakFav });
                }
                const atrNow = Number(atrArr[i]);
                if (peakFav >= trailAfterR) {
                    currentSl = isLong ? Math.max(currentSl, entry) : Math.min(currentSl, entry);
                }
                if (peakFav >= trailAfterR && Number.isFinite(atrNow) && atrNow > 0) {
                    const candidate = isLong ? bidClose - atrNow * trailMult : askClose + atrNow * trailMult;
                    if (isLong) currentSl = Math.max(currentSl, entry, candidate);
                    else currentSl = Math.min(currentSl, entry, candidate);
                }
            }

            if (bar.time - startTime >= maxHold) {
                const exitPx = isLong ? bidClose : askClose;
                const rMult = isLong ? (exitPx - entry) / risk : (entry - exitPx) / risk;
                // از بستن باخت سنگین با TIME خودداری کن مگر نزدیک BE؛ در غیر این صورت به BE محدود کن
                if (rMult < -0.25 && peakFav >= 0.8) {
                    const beExit = entry;
                    return capClosed({ status: 'closed', why: 'TIME_BE', exit: beExit, closeTime: bar.time, R: 0, peakFav });
                }
                if (rMult < -0.5) {
                    // هنوز باز بماند فقط در resolveهای open؛ اینجا به سقف ضرر ۰.۵R محدود کن
                    const capped = isLong ? entry - risk * 0.5 : entry + risk * 0.5;
                    return capClosed({ status: 'closed', why: 'TIME_CAP', exit: capped, closeTime: bar.time, R: -0.5, peakFav });
                }
                return capClosed({ status: 'closed', why: 'TIME', exit: exitPx, closeTime: bar.time, R: rMult, peakFav });
            }
        }
        const last = bars[bars.length - 1];
        const lastExecPx = last ? (isLong ? (last.bidClose ?? last.close) : (last.askClose ?? last.close)) : 0;
        const currentR = last ? (isLong ? (lastExecPx - entry) / risk : (entry - lastExecPx) / risk) : 0;
        return { status: 'open', currentSl, currentR, peakFav };
    }

    return { resolveTrade, calcRSI, calcAtrSeries, checkDivergence };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TradePolicy;
