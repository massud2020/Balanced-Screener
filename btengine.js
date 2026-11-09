// btengine.js — Unified Backtest Engine (Browser & Node Compatible)
// این فایل از موتور مرکزی Engine.evaluate استفاده می‌کند تا منطق با اسکنر زنده یکسان باشد.

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./engine.js'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./engine.js'));
    } else {
        root.Backtest = factory(root.Engine);
    }
}(typeof self !== 'undefined' ? self : this, function (Engine) {
    'use strict';

    if (!Engine) {
        throw new Error("Engine.js must be loaded before btengine.js");
    }

    // شبیه‌سازی معامله: بررسی اینکه آیا کندل‌های بعدی به SL یا TP برخورد کرده‌اند یا خیر
    function simulateTrade(side, entry, sl, tp1, tp2, futureCandles) {
        let tp1Hit = false;
        let peakFav = 0;
        const risk = Math.abs(entry - sl);
        const trailAfterR = 1.0;
        
        // تخمین ATR برای تریلینگ (از خود کندل‌ها)
        const ranges = futureCandles.map(b => b.high - b.low).filter(x => x > 0);
        const atrEst = ranges.length ? ranges.slice(0, 14).reduce((s, x) => s + x, 0) / Math.min(14, ranges.length) : risk * 0.5;
        const trailDist = Math.max(1.2 * atrEst, 0.3 * risk);
        
        let currentSl = sl;

        for (const b of futureCandles) {
            if (side === "LONG") {
                // Check TP1
                if (!tp1Hit && b.high >= tp1) {
                    tp1Hit = true;
                    currentSl = Math.max(currentSl, entry); // Move to Breakeven
                }
                // Check Final TP
                if (b.high >= tp2) {
                    const finalR = tp1Hit ? (0.5 * 1.5) + (0.5 * 3.0) : 3.0;
                    return { result: "win", exit: tp2, why: "TP2", R: finalR, tp1Hit };
                }
                // Check Trailing / SL
                const fav = (b.high - entry) / risk;
                if (fav > peakFav) peakFav = fav;
                if (fav >= trailAfterR && tp1Hit) {
                    const newSl = Math.max(currentSl, b.high - trailDist, entry);
                    if (newSl > currentSl) currentSl = newSl;
                }
                if (b.low <= currentSl) {
                    if (tp1Hit) {
                        const trailR = (currentSl - entry) / risk;
                        const combinedR = (0.5 * 1.5) + (0.5 * trailR);
                        return { result: combinedR >= 0 ? "win" : "loss", exit: currentSl, why: "TP1+TRAIL", R: combinedR, tp1Hit: true };
                    } else {
                        return { result: "loss", exit: currentSl, why: "SL", R: -1, tp1Hit: false };
                    }
                }
            } else {
                // SHORT Logic
                if (!tp1Hit && b.low <= tp1) {
                    tp1Hit = true;
                    currentSl = Math.min(currentSl, entry);
                }
                if (b.low <= tp2) {
                    const finalR = tp1Hit ? (0.5 * 1.5) + (0.5 * 3.0) : 3.0;
                    return { result: "win", exit: tp2, why: "TP2", R: finalR, tp1Hit };
                }
                const fav = (entry - b.low) / risk;
                if (fav > peakFav) peakFav = fav;
                if (fav >= trailAfterR && tp1Hit) {
                    const newSl = Math.min(currentSl, b.low + trailDist, entry);
                    if (newSl < currentSl) currentSl = newSl;
                }
                if (b.high >= currentSl) {
                    if (tp1Hit) {
                        const trailR = (entry - currentSl) / risk;
                        const combinedR = (0.5 * 1.5) + (0.5 * trailR);
                        return { result: combinedR >= 0 ? "win" : "loss", exit: currentSl, why: "TP1+TRAIL", R: combinedR, tp1Hit: true };
                    } else {
                        return { result: "loss", exit: currentSl, why: "SL", R: -1, tp1Hit: false };
                    }
                }
            }
        }
        // اگر به هیچ کدام نخورد (پایان دیتا)
        const last = futureCandles[futureCandles.length - 1];
        const closeR = side === "LONG" ? (last.close - entry) / risk : (entry - last.close) / risk;
        const finalR = tp1Hit ? (0.5 * 1.5) + (0.5 * closeR) : closeR;
        return { result: finalR >= 0 ? "win" : "loss", exit: last.close, why: "TIME", R: finalR, tp1Hit };
    }

    // اجرای بک‌تست روی یک نماد
    function runBacktestOnSymbol(symbol, candlesM5, candlesM15, candlesH1, opts = {}) {
        const trades = [];
        let openTrade = null;
        
        // حداقل ۲۰۰ کندل برای شروع نیاز است
        if (candlesM5.length < 200) return trades;

        for (let i = 200; i < candlesM5.length; i++) {
            const currentM5 = candlesM5.slice(0, i + 1);
            const currentM15 = candlesM15.filter(c => c.time <= currentM5[i].time);
            const currentH1 = candlesH1.filter(c => c.time <= currentM5[i].time);

            // ۱. اگر معامله‌ای باز است، بررسی میکنیم که آیا به SL/TP خورده یا نه
            if (openTrade) {
                // برای سادگی در بک‌تست، کندل به کندل چک می‌کنیم
                // (در اینجا از یک کندل جلوتر شروع میکنیم چون کندل فعلی زمان صدور سیگنال بود)
                // ...
            }

            // ۲. ارزیابی سیگنال جدید
            if (!openTrade) {
                const result = Engine.evaluate(symbol, currentM5, currentM15, currentH1, opts, currentM5[i].time);
                if (result.side) {
                    // شبیه‌سازی از کندل بعدی تا ۵۰۰ کندل جلوتر (یا تا پایان دیتا)
                    const futureCandles = candlesM5.slice(i + 1, i + 500);
                    if (futureCandles.length === 0) break;
                    
                    const outcome = simulateTrade(result.side, result.entry, result.sl, result.tp, result.tp2, futureCandles);
                    trades.push({
                        symbol,
                        side: result.side,
                        entry: result.entry,
                        sl: result.sl,
                        tp1: result.tp,
                        tp2: result.tp2,
                        openTime: currentM5[i].time,
                        ...outcome
                    });
                    
                    // جلوگیری از باز شدن معامله جدید تا بسته شدن معامله قبلی (منطق اسکنر)
                    // برای بک‌تست دقیق، به جای پرش، اجازه میدهیم معامله در آینده بسته شود
                    // اما برای سادگی، فرض میکنیم تا ۵۰۰ کندل بعدی نماد بلاک است
                    // در پیاده‌سازی واقعی‌تر، باید زمان بسته شدن معامله را ثبت کنیم و از آن نقطه جلو برویم.
                    i += 10; // جلوگیری از سیگنال‌های همپوشانی (ساده سازی)
                }
            }
        }
        return trades;
    }

    // محاسبه آمار کلی
    function calculateStats(trades) {
        if (!trades || !trades.length) return { total: 0, wins: 0, losses: 0, winRate: 0, netR: 0, pf: 0, maxDD: 0 };
        
        let wins = 0, losses = 0, netR = 0, grossProfit = 0, grossLoss = 0;
        let peakR = 0, maxDD = 0, currentR = 0;

        trades.forEach(t => {
            const r = Number(t.R || 0);
            netR += r;
            currentR += r;
            if (r > 0) { wins++; grossProfit += r; } else { losses++; grossLoss += Math.abs(r); }
            if (currentR > peakR) peakR = currentR;
            const dd = peakR - currentR;
            if (dd > maxDD) maxDD = dd;
        });

        const total = wins + losses;
        const winRate = total > 0 ? (wins / total) * 100 : 0;
        const pf = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? Infinity : 0);

        return { total, wins, losses, winRate: +winRate.toFixed(1), netR: +netR.toFixed(2), pf: +pf.toFixed(2), maxDD: +maxDD.toFixed(2) };
    }

    return {
        runBacktestOnSymbol,
        calculateStats
    };
}));
