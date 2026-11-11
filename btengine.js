// btengine.js — Unified Backtest Engine (Browser & Node) V5
(function (root, factory) {
    if (typeof define === 'function' && define.amd) { define(['./engine.js'], factory); }
    else if (typeof module === 'object' && module.exports) { module.exports = factory(require('./engine.js')); }
    else { root.Backtest = factory(root.Engine); }
}(typeof self !== 'undefined' ? self : this, function (Engine) {
    'use strict';
    if (!Engine) throw new Error("Engine.js required");

    // 🛠 فیلتر تعطیلی بازار (کریپتو ۲۴/۷، فارکس از جمعه شب تا یکشنبه شب تعطیل)
    function isMarketOpen(timestampSec, symbol) {
        if (symbol.endsWith('USDT') || symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('SOL')) return true;
        const d = new Date(timestampSec * 1000);
        const day = d.getUTCDay();
        const hour = d.getUTCHours();
        if (day === 6) return false;
        if (day === 0 && hour < 21) return false;
        if (day === 5 && hour >= 21) return false;
        return true;
    }

    // 🛠 شبیه‌سازی معامله با کسر هزینه (costR)
    function simulateTrade(side, entry, sl, tp1, tp2, trailingAtrStep, futureCandles, costR) {
        let tp1Hit = false;
        let currentSl = sl;
        const risk = Math.abs(entry - sl);

        for (const b of futureCandles) {
            const hitSl = side === "LONG" ? b.low <= currentSl : b.high >= currentSl;
            const hitTp1 = side === "LONG" ? b.high >= tp1 : b.low <= tp1;
            const hitTp2 = side === "LONG" ? b.high >= tp2 : b.low <= tp2;

            if (!tp1Hit && hitSl) {
                return { result: "loss", exit: currentSl, why: "SL", R: -1 - costR, closeTime: b.time, tp1Hit: false };
            }
            if (!tp1Hit && hitTp1) {
                tp1Hit = true;
                currentSl = entry; // Move to BE
            }
            if (hitTp2) {
                const grossR = tp1Hit ? (0.5 * 1.5) + (0.5 * 3.0) : 3.0;
                return { result: "win", exit: tp2, why: "TP2", R: grossR - costR, closeTime: b.time, tp1Hit: true };
            }
            if (tp1Hit && hitSl) {
                const trailR = side === "LONG" ? (currentSl - entry) / risk : (entry - currentSl) / risk;
                const grossR = (0.5 * 1.5) + (0.5 * trailR);
                return { result: (grossR - costR) >= 0 ? "win" : "loss", exit: currentSl, why: "TP1+TRAIL", R: grossR - costR, closeTime: b.time, tp1Hit: true };
            }

            if (tp1Hit) {
                const fav = side === "LONG" ? (b.high - entry) / risk : (entry - b.low) / risk;
                if (fav >= 1.0) {
                    const newSl = side === "LONG" ? Math.max(currentSl, b.high - trailingAtrStep, entry) : Math.min(currentSl, b.low + trailingAtrStep, entry);
                    currentSl = newSl;
                }
            }
        }
        const last = futureCandles[futureCandles.length - 1];
        const closeR = side === "LONG" ? (last.close - entry) / risk : (entry - last.close) / risk;
        const grossR = tp1Hit ? (0.5 * 1.5) + (0.5 * closeR) : closeR;
        return { result: (grossR - costR) >= 0 ? "win" : "loss", exit: last.close, why: "TIME", R: grossR - costR, closeTime: last.time, tp1Hit };
    }

    function runBacktestOnSymbol(symbol, candlesM5, candlesM15, candlesH1, opts = {}) {
        const trades = [];
        let openTrade = null;
        if (candlesM5.length < 200) return trades;

        const spreadPips = opts.spreadPips || 1.5;
        const commissionPips = opts.commissionPips || 0.5;
        const totalCostPips = spreadPips + commissionPips;

        for (let i = 200; i < candlesM5.length; i++) {
            const currentM5 = candlesM5.slice(0, i + 1);
            
            // 🛠 فیلتر تعطیلی بازار
            if (!isMarketOpen(currentM5[i].time, symbol)) continue;

            if (openTrade && currentM5[i].time < openTrade.closeTime) {
                continue;
            } else if (openTrade) {
                openTrade = null;
            }

            const currentM15 = candlesM15.filter(c => c.time <= currentM5[i].time);
            const currentH1 = candlesH1.filter(c => c.time <= currentM5[i].time);

            const result = Engine.evaluate(symbol, currentM5, currentM15, currentH1, opts, currentM5[i].time);
            if (result.side) {
                const riskDist = Math.abs(result.entry - result.sl);
                
                let pipValue = 0.0001; 
                if (symbol.endsWith('USDT')) pipValue = 1;
                else if (symbol.includes('JPY')) pipValue = 0.01;
                else if (['XAUUSD', 'XAGUSD'].includes(symbol)) pipValue = 0.1;
                
                const costR = riskDist > 0 ? (totalCostPips * pipValue) / riskDist : 0; 
                
                const futureCandles = candlesM5.slice(i + 1, i + 500);
                if (futureCandles.length === 0) break;
                
                const outcome = simulateTrade(result.side, result.entry, result.sl, result.tp, result.tp2, Math.abs(result.entry - result.sl) * 0.5, futureCandles, costR);
                openTrade = { ...result, ...outcome, symbol, openTime: currentM5[i].time };
                trades.push(openTrade);
            }
        }
        return trades;
    }

    function calculateStats(trades) {
        if (!trades || !trades.length) return { total: 0, wins: 0, losses: 0, winRate: 0, netR: 0, pf: 0, maxDD: 0 };
        const sortedTrades = [...trades].sort((a, b) => a.closeTime - b.closeTime);
        let wins = 0, losses = 0, netR = 0, grossProfit = 0, grossLoss = 0;
        let peakR = 0, maxDD = 0, currentR = 0;

        sortedTrades.forEach(t => {
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

    return { runBacktestOnSymbol, calculateStats, isMarketOpen };
}));
