// btengine.js — Unified Backtest Engine (Browser & Node) V6
(function (root, factory) {
    if (typeof define === 'function' && define.amd) { define(['./engine.js', './trade-policy.js'], factory); }
    else if (typeof module === 'object' && module.exports) { module.exports = factory(require('./engine.js'), require('./trade-policy.js')); }
    else { root.Backtest = factory(root.Engine, root.TradePolicy || (typeof TradePolicy !== "undefined" ? TradePolicy : null)); }
}(typeof self !== 'undefined' ? self : this, function (Engine, TradePolicy) {
    'use strict';
    if (!Engine) throw new Error("Engine.js required");
    if (!TradePolicy) throw new Error("trade-policy.js required");

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

    // Shared exit policy used by live scanner and historical simulation.
    function simulateTrade(side, entry, sl, tp1, tp2, trailingAtrStep, futureCandles, costR, mode = "pattern", startTime = 0, opts = {}) {
        const state = TradePolicy.resolveTrade({
            side, entry, sl, mode, bars: futureCandles,
            startTime, maxHoldSec: opts.maxHoldSec || (6 * 3600), opts,
            now: futureCandles.length ? futureCandles[futureCandles.length - 1].time : startTime
        });
        if (state.status !== "closed") return null;
        const netR = Number(state.R) - Math.max(0, Number(costR) || 0);
        return {
            ...state,
            result: netR > 0 ? "win" : (netR < 0 ? "loss" : "flat"),
            R: +netR.toFixed(4)
        };
    }

    function runBacktestOnSymbol(symbol, candlesM5, candlesM15, candlesH1, opts = {}) {
        const trades = [];
        let openTrade = null;
        if (!Array.isArray(candlesM5) || candlesM5.length < 200) return trades;
        candlesM15 = Array.isArray(candlesM15) ? candlesM15 : [];
        candlesH1 = Array.isArray(candlesH1) ? candlesH1 : [];

        const spreadPips = opts.spreadPips == null ? 1.5 : Math.max(0, Number(opts.spreadPips) || 0);
        const commissionPips = opts.commissionPips == null ? 0.5 : Math.max(0, Number(opts.commissionPips) || 0);
        const slippagePips = opts.slippagePips == null ? 0 : Math.max(0, Number(opts.slippagePips) || 0);
        const totalCostPips = spreadPips + commissionPips + slippagePips;
        const signalIntervalSec = Number(opts.signalIntervalSec) > 0 ? Number(opts.signalIntervalSec) : 300;
        const maxSpreadR = Number(opts.maxSpreadR) > 0 ? Number(opts.maxSpreadR) : 0.28;

        // Precompute pip/cost once (was inside loop)
        const normalizedSymbol = String(symbol || '').toUpperCase();
        const inferredPipSize = normalizedSymbol.endsWith("USDT") ? 1
            : (normalizedSymbol.includes("BTC") || normalizedSymbol.includes("ETH") || normalizedSymbol.includes("SOL") ? 1
            : (normalizedSymbol.includes("JPY") ? 0.01
            : (["XAUUSD", "XAGUSD", "GOLD"].includes(normalizedSymbol) ? 0.1 : 0.0001)));
        const configuredPipSize = opts.pipSizeBySymbol && Number(opts.pipSizeBySymbol[symbol]) > 0
            ? Number(opts.pipSizeBySymbol[symbol])
            : (Number(opts.pipSize) > 0 ? Number(opts.pipSize) : inferredPipSize);
        const symbolCostPips = opts.costPipsBySymbol && Number(opts.costPipsBySymbol[symbol]) >= 0
            ? Number(opts.costPipsBySymbol[symbol]) : totalCostPips;
        const explicitCostPrice = opts.costPriceBySymbol && Number(opts.costPriceBySymbol[symbol]) >= 0
            ? Number(opts.costPriceBySymbol[symbol]) : null;
        const baseCostPrice = explicitCostPrice == null ? symbolCostPips * configuredPipSize : explicitCostPrice;

        // Avoid O(n²) array copies: truncate .length in-place (restored after loop)
        const m5 = candlesM5;
        const m15 = candlesM15;
        const h1 = candlesH1;
        const m5Full = m5.length;
        const m15Full = m15.length;
        const h1Full = h1.length;
        let i15 = 0, iH1 = 0;

        try {
        for (let i = 199; i < m5Full - 1; i++) {
            const decisionTime = m5[i].time + signalIntervalSec;
            const executionTime = Number(m5[i + 1].time);

            // Cheap gates first — no copies
            if (!isMarketOpen(executionTime, symbol)) continue;
            if (openTrade && decisionTime <= openTrade.closeTime) continue;
            if (openTrade) openTrade = null;

            // Advance higher-TF cursors (monotonic)
            while (i15 < m15Full && m15[i15].time <= decisionTime) i15++;
            while (iH1 < h1Full && h1[iH1].time <= decisionTime) iH1++;

            m5.length = i + 1;
            m15.length = i15;
            h1.length = iH1;

            const result = Engine.evaluate(symbol, m5, m15, h1, opts, decisionTime);
            if (!result || !result.side) continue;

            const executionEntry = Number(m5[i + 1] ? m5[i + 1].open : candlesM5[i + 1].open);
            // m5.length truncated — use original for next bar open
            const nextOpen = Number(candlesM5[i + 1].open);
            const riskDist = Math.abs(result.entry - result.sl);
            if (!(riskDist > 0) || !Number.isFinite(riskDist) || !Number.isFinite(nextOpen)) continue;
            const direction = result.side === "LONG" ? 1 : -1;
            const executionSl = nextOpen - direction * riskDist;
            const tp1R = Number(result.tp1R) > 0 ? Number(result.tp1R) : 1.5;
            const tp2R = Number(result.tp2R) > 0 ? Number(result.tp2R) : (result.mode === "range" ? 1.5 : 4.0);
            const executionTp1 = nextOpen + direction * riskDist * tp1R;
            const executionTp2 = nextOpen + direction * riskDist * tp2R;
            const executionResult = {
                ...result, entry: nextOpen, sl: executionSl,
                tp: result.mode === 'range' ? executionTp1 : null,
                tp1: result.mode === 'range' ? executionTp1 : null,
                tp2: result.mode === 'range' ? executionTp2 : null,
                openTime: executionTime
            };

            const costR = baseCostPrice / riskDist;
            if (costR > maxSpreadR) continue;

            // Need full m5 for exit simulation window — restore length temporarily
            m5.length = m5Full;
            const from = Math.max(0, i - 100);
            const to = Math.min(m5Full, i + 501);
            const futureCandles = m5.slice(from, to);
            if (!futureCandles.length) break;

            const tradeOpts = {
                ...opts,
                rangeTpMult: Number(opts.rangeTpMult) > 0 ? Number(opts.rangeTpMult) : Number(result.tp1R) || 1.5,
                trailingAtrMult: Number(opts.trailingAtrMult) > 0 ? Number(opts.trailingAtrMult) : 0.5
            };
            const outcome = simulateTrade(
                executionResult.side, executionResult.entry, executionResult.sl, executionResult.tp1,
                executionResult.tp2, executionResult.trailingAtrStep, futureCandles, costR,
                executionResult.mode || opts.mode || "pattern", executionTime, tradeOpts
            );
            if (!outcome) break;

            openTrade = { ...executionResult, ...outcome, symbol, openTime: executionTime, costR };
            trades.push(openTrade);
        }
        } finally {
            m5.length = m5Full;
            m15.length = m15Full;
            h1.length = h1Full;
        }
        return trades;
    }

    function calculateStats(trades) {
        if (!trades || !trades.length) return { total: 0, wins: 0, losses: 0, flats: 0, winRate: 0, netR: 0, pf: 0, maxDD: 0, maxDDUnit: "R" };
        const sortedTrades = [...trades].sort((a, b) => a.closeTime - b.closeTime);
        let wins = 0, losses = 0, flats = 0, netR = 0, grossProfit = 0, grossLoss = 0;
        let peakR = 0, maxDD = 0, currentR = 0;

        sortedTrades.forEach(t => {
            const r = Number(t.R || 0);
            netR += r;
            currentR += r;
            if (r > 0) { wins++; grossProfit += r; }
            else if (r < 0) { losses++; grossLoss += Math.abs(r); }
            else { flats++; }
            if (currentR > peakR) peakR = currentR;
            const dd = peakR - currentR;
            if (dd > maxDD) maxDD = dd;
        });

        const total = wins + losses + flats;
        const winRate = total > 0 ? (wins / total) * 100 : 0;
        const pf = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? Infinity : 0);

        return { total, wins, losses, flats, winRate: +winRate.toFixed(1), netR: +netR.toFixed(2), pf: +pf.toFixed(2), maxDD: +maxDD.toFixed(2), maxDDUnit: "R" };
    }

    function applyPortfolioConstraints(trades, options = {}) {
        const maxOpenPositions = Number.isInteger(options.maxOpenPositions) && options.maxOpenPositions > 0 ? options.maxOpenPositions : 3;
        const maxPerCorrelationGroup = Number.isInteger(options.maxPerCorrelationGroup) && options.maxPerCorrelationGroup > 0 ? options.maxPerCorrelationGroup : 1;
        const selected = [], active = [];
        const ordered = [...(trades || [])].sort((a, b) => (a.openTime || 0) - (b.openTime || 0) || (Number(b.scorePercent) || 0) - (Number(a.scorePercent) || 0) || (a.closeTime || 0) - (b.closeTime || 0));
        for (const trade of ordered) {
            const openTime = Number(trade.openTime) || 0;
            for (let i = active.length - 1; i >= 0; i--) if (active[i].closeTime < openTime) active.splice(i, 1);
            const sameSymbol = active.some(t => t.symbol === trade.symbol);
            const groups = Engine.getCorrelationGroups ? Engine.getCorrelationGroups(trade.symbol) : [];
            const sameGroup = groups.some(group => active.filter(t => (Engine.getCorrelationGroups ? Engine.getCorrelationGroups(t.symbol) : []).includes(group)).length >= maxPerCorrelationGroup);
            if (sameSymbol || sameGroup || active.length >= maxOpenPositions) continue;
            selected.push(trade); active.push(trade);
        }
        return selected;
    }

    return { runBacktestOnSymbol, calculateStats, isMarketOpen, simulateTrade, applyPortfolioConstraints };
}));
