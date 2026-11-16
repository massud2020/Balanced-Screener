// Range parameter study: chronological split, next-bar execution, no overlapping trades.
const fs = require('fs');
const Engine = require('./engine.js');
const TradePolicy = require('./trade-policy.js');
const { getPreset } = require('./presets.js');
const { loadCsv, inspectFile } = require('./data-utils.js');

const SYMBOLS = ['EURUSD', 'GBPUSD', 'GOLD', 'AUDUSD', 'NZDUSD', 'USDCAD'];
const TP_GRID = [1.0, 1.2, 1.5, 2.0];
const SL_GRID = process.env.RANGE_SL_ATR ? [Number(process.env.RANGE_SL_ATR)] : [2.0, 2.5, 3.0];
const COST_PRICE = { EURUSD: 0.0001, GBPUSD: 0.0001, AUDUSD: 0.0001, NZDUSD: 0.0001, USDCAD: 0.0001, GOLD: 0.30 };
const INTERVAL = 3600;

function metrics(trades) {
  const sorted = [...trades].sort((a, b) => a.closeTime - b.closeTime);
  let netR = 0, grossR = 0, totalCostsR = 0, wins = 0, grossWin = 0, grossLoss = 0, peak = 0, equity = 0, maxDD = 0;
  for (const t of sorted) {
    const r = Number(t.R) || 0;
    netR += r; grossR += Number(t.grossR ?? r); totalCostsR += Number(t.costR) || 0; equity += r;
    if (r > 0) { wins++; grossWin += r; } else if (r < 0) grossLoss += -r;
    peak = Math.max(peak, equity); maxDD = Math.max(maxDD, peak - equity);
  }
  return {
    trades: sorted.length,
    winRate: sorted.length ? +(wins / sorted.length * 100).toFixed(1) : 0,
    netR: +netR.toFixed(2), grossR: +grossR.toFixed(2), totalCostsR: +totalCostsR.toFixed(2),
    profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : (grossWin > 0 ? 'Infinity' : 0),
    maxDrawdownR: +maxDD.toFixed(2),
    averageR: sorted.length ? +(netR / sorted.length).toFixed(3) : 0,
    recoveryFactor: maxDD > 0 ? +(netR / maxDD).toFixed(2) : null
  };
}

function collectRangeSignals(symbol, bars, slAtr) {
  const preset = getPreset(symbol);
  const signals = [];
  const opts = {
    ...preset, mode: 'range', signalIntervalSec: INTERVAL,
    sessionFilter: !!preset.session, h1: false, m15: false, adx: true,
    rsi: true, pa: false, minScorePercent: 70,
    rangeSlAtr: slAtr, rangeTpMult: 1.0, trailingAtrMult: 0.5
  };
  for (let i = 199; i < bars.length - 1; i++) {
    const decisionTime = bars[i].time + INTERVAL;
    const windowStart = Math.max(0, i - 799); // 600+ bars after EMA200 seed keeps EMA warm-up error negligible.
    const result = Engine.evaluate(symbol, bars.slice(windowStart, i + 1), [], [], opts, decisionTime);
    if (result.side) signals.push({ i, decisionTime, result });
  }
  return signals;
}

function runRange(symbol, bars, signals, tpMult, fromTime, toTime) {
  const trades = [];
  let nextAllowedTime = 0;
  for (const signal of signals) {
    const { i, decisionTime, result } = signal;
    if (decisionTime < fromTime || decisionTime >= toTime || decisionTime <= nextAllowedTime) continue;
    const executionTime = bars[i + 1].time;
    const entry = Number(bars[i + 1].open);
    const riskDist = Math.abs(result.entry - result.sl);
    if (!(riskDist > 0) || !Number.isFinite(entry)) continue;
    const direction = result.side === 'LONG' ? 1 : -1;
    const sl = entry - direction * riskDist;
    const future = bars.slice(Math.max(0, i - 100), i + 501);
    if (!future.length) break;
    const state = TradePolicy.resolveTrade({
      side: result.side, entry, sl, mode: 'range', bars: future,
      startTime: executionTime, maxHoldSec: 7 * 24 * 3600,
      opts: { rangeTpMult: tpMult }
    });
    if (state.status !== 'closed') break;
    const costPrice = COST_PRICE[symbol] || 0;
    const costR = costPrice / riskDist;
    trades.push({ symbol, mode: 'range', side: result.side, openTime: executionTime, closeTime: state.closeTime, why: state.why, effectiveSlAtr: result.effectiveSlAtr, tpR: tpMult, grossR: state.R, costR, R: +(state.R - costR).toFixed(4) });
    nextAllowedTime = state.closeTime + INTERVAL;
  }
  return trades;
}

function main() {
  const data = {};
  let globalStart = Infinity, globalEnd = -Infinity;
  const quality = {};
  for (const symbol of SYMBOLS) {
    const filename = `${symbol}_H1_LONG.csv`;
    const bars = loadCsv(filename);
    if (bars.length < 300) { quality[symbol] = { error: 'missing_or_insufficient_data', rows: bars.length }; continue; }
    data[symbol] = bars;
    globalStart = Math.min(globalStart, bars[0].time);
    globalEnd = Math.max(globalEnd, bars[bars.length - 1].time);
    quality[symbol] = inspectFile(filename, INTERVAL);
  }
  if (!Object.keys(data).length) throw new Error('No valid H1 datasets found.');
  const splitTime = globalStart + (globalEnd - globalStart) * 0.70;
  const gridResults = [];
  for (const slAtr of SL_GRID) {
    const signalsBySymbol = {};
    for (const symbol of Object.keys(data)) signalsBySymbol[symbol] = collectRangeSignals(symbol, data[symbol], slAtr);
    for (const tp of TP_GRID) {
      const inSample = [], outSample = [], bySymbol = {};
      for (const symbol of Object.keys(data)) {
        const isTrades = runRange(symbol, data[symbol], signalsBySymbol[symbol], tp, globalStart, splitTime);
        const oosTrades = runRange(symbol, data[symbol], signalsBySymbol[symbol], tp, splitTime, globalEnd + INTERVAL);
        inSample.push(...isTrades); outSample.push(...oosTrades);
        bySymbol[symbol] = { inSample: metrics(isTrades), outOfSample: metrics(oosTrades) };
      }
      const isStats = metrics(inSample), oosStats = metrics(outSample);
      const objective = isStats.trades >= 30 && typeof isStats.profitFactor === 'number' && isStats.profitFactor > 1
        ? isStats.netR - 0.5 * isStats.maxDrawdownR : -Infinity;
      gridResults.push({ slAtr, tpR: tp, inSample: isStats, outOfSample: oosStats, bySymbol, selectionObjective: Number.isFinite(objective) ? +objective.toFixed(2) : null });
    }
  }
  const eligible = gridResults.filter(r => r.selectionObjective != null).sort((a, b) => b.selectionObjective - a.selectionObjective);
  const chosen = eligible[0] || null;
  const report = {
    generatedAt: new Date().toISOString(), timeframe: 'H1', split: 'chronological 70% in-sample / 30% out-of-sample',
    splitTime: new Date(splitTime * 1000).toISOString(), stopLossATRGrid: SL_GRID, takeProfitRGrid: TP_GRID,
    costAssumptionsPriceUnits: COST_PRICE,
    warning: 'Costs are provisional assumptions copied from the project test scripts, not verified broker quotes. Replace with broker-specific spread/commission/slippage before treating results as executable.',
    dataQuality: quality, grid: gridResults,
    selectedOnInSampleOnly: chosen ? { slAtr: chosen.slAtr, tpR: chosen.tpR } : null,
    selectedParameterOutOfSample: chosen ? chosen.outOfSample : null,
    selectionRule: 'At least 30 IS trades and PF > 1; maximize NetR - 0.5 * MaxDD(R). If no candidate qualifies, no SL/TP pair is selected.'
  };
  fs.writeFileSync('range-optimization-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main();
module.exports = { collectRangeSignals, runRange, metrics };
