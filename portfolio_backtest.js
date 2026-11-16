// Combined Trend + Range H1 portfolio simulation with non-overlap and correlation limits.
const fs = require('fs');
const Engine = require('./engine.js');
const TradePolicy = require('./trade-policy.js');
const { getPreset } = require('./presets.js');
const { loadCsv, inspectFile } = require('./data-utils.js');

const SYMBOLS = ['EURUSD', 'GBPUSD', 'GOLD', 'EURJPY', 'AUDUSD', 'NZDUSD', 'USDCAD'];
const INTERVAL = 3600;
const COST_PRICE = { EURUSD: 0.0001, GBPUSD: 0.0001, EURJPY: 0.01, AUDUSD: 0.0001, NZDUSD: 0.0001, USDCAD: 0.0001, GOLD: 0.30 };
const RISK_PCT = Number(process.env.RISK_PER_TRADE_PCT) > 0 ? Number(process.env.RISK_PER_TRADE_PCT) / 100 : 0.005;

function runSymbolMode(symbol, bars, mode, rangeTpMult, rangeSlAtr = 2.5) {
  const preset = getPreset(symbol);
  if (preset.enabled === false || bars.length < 300) return [];
  const opts = {
    ...preset, mode, signalIntervalSec: INTERVAL, sessionFilter: !!preset.session,
    h1: false, m15: false, adx: true, pa: false, rsi: true,
    minScorePercent: mode === 'range' ? 70 : (Number(preset.minScorePercent) || 70),
    rangeSlAtr, rangeTpMult, trailingAtrMult: 0.5
  };
  const trades = [];
  let nextAllowedTime = 0;
  for (let i = 199; i < bars.length - 1; i++) {
    const decisionTime = bars[i].time + INTERVAL;
    if (decisionTime <= nextAllowedTime) continue;
    const windowStart = Math.max(0, i - 799); // 600+ bars after EMA200 seed keeps EMA warm-up error negligible.
    const result = Engine.evaluate(symbol, bars.slice(windowStart, i + 1), [], [], opts, decisionTime);
    if (!result.side) continue;
    const openTime = bars[i + 1].time;
    const entry = Number(bars[i + 1].open);
    const riskDist = Math.abs(result.entry - result.sl);
    if (!(riskDist > 0) || !Number.isFinite(entry)) continue;
    const direction = result.side === 'LONG' ? 1 : -1;
    const sl = entry - direction * riskDist;
    const future = bars.slice(Math.max(0, i - 100), i + 1 + 500);
    if (!future.length) break;
    const state = TradePolicy.resolveTrade({
      side: result.side, entry, sl, mode, bars: future, startTime: openTime,
      maxHoldSec: 7 * 24 * 3600,
      opts: { rangeTpMult, trailingAtrMult: 0.5 }
    });
    if (state.status !== 'closed') break;
    const costPrice = COST_PRICE[symbol] || 0;
    const costR = costPrice / riskDist;
    trades.push({
      symbol, mode, side: result.side, openTime, closeTime: state.closeTime,
      entry, sl, exit: state.exit, why: state.why, scorePercent: result.scorePercent,
      grossR: state.R, costR, R: +(state.R - costR).toFixed(4),
      correlationGroups: Engine.getCorrelationGroups(symbol)
    });
    nextAllowedTime = state.closeTime + INTERVAL;
  }
  return trades;
}

function selectPortfolio(candidates, maxOpenPositions = 3, maxPerGroup = 1) {
  const ordered = [...candidates].sort((a, b) => a.openTime - b.openTime || (b.scorePercent || 0) - (a.scorePercent || 0));
  const selected = [], active = [];
  for (const trade of ordered) {
    for (let i = active.length - 1; i >= 0; i--) if (active[i].closeTime < trade.openTime) active.splice(i, 1);
    const groups = trade.correlationGroups || Engine.getCorrelationGroups(trade.symbol);
    if (active.some(t => t.symbol === trade.symbol)) continue;
    const sameGroup = groups.some(group => active.filter(t => (t.correlationGroups || Engine.getCorrelationGroups(t.symbol)).includes(group)).length >= maxPerGroup);
    if (sameGroup) continue;
    if (active.length >= maxOpenPositions) continue;
    selected.push(trade); active.push(trade);
  }
  return selected;
}

function stats(trades) {
  const ordered = [...trades].sort((a, b) => a.closeTime - b.closeTime);
  let netR = 0, wins = 0, grossWin = 0, grossLoss = 0, peakR = 0, equityR = 0, maxDdR = 0;
  let equity = 10000, peakEquity = equity, maxDdPct = 0;
  const riskCash = equity * RISK_PCT;
  for (const t of ordered) {
    const r = Number(t.R) || 0;
    netR += r; equityR += r;
    if (r > 0) { wins++; grossWin += r; } else if (r < 0) grossLoss += -r;
    peakR = Math.max(peakR, equityR); maxDdR = Math.max(maxDdR, peakR - equityR);
    equity += riskCash * r;
    peakEquity = Math.max(peakEquity, equity);
    if (peakEquity > 0) maxDdPct = Math.max(maxDdPct, (peakEquity - equity) / peakEquity * 100);
  }
  return {
    trades: ordered.length, wins, losses: ordered.length - wins,
    winRate: ordered.length ? +(wins / ordered.length * 100).toFixed(1) : 0,
    netR: +netR.toFixed(2), profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : (grossWin > 0 ? 'Infinity' : 0),
    maxDrawdownR: +maxDdR.toFixed(2), averageR: ordered.length ? +(netR / ordered.length).toFixed(3) : 0,
    startingEquity: 10000, endingEquity: +equity.toFixed(2), maxDrawdownPct: +maxDdPct.toFixed(2), riskPerTradePct: +(RISK_PCT * 100).toFixed(2)
  };
}

function main() {
  const datasets = {}, quality = {};
  let globalStart = Infinity, globalEnd = -Infinity;
  for (const symbol of SYMBOLS) {
    const bars = loadCsv(`${symbol}_H1_LONG.csv`);
    if (bars.length < 300) { quality[symbol] = { rows: bars.length, error: 'missing_or_insufficient' }; continue; }
    datasets[symbol] = bars;
    quality[symbol] = inspectFile(`${symbol}_H1_LONG.csv`, INTERVAL);
    globalStart = Math.min(globalStart, bars[0].time); globalEnd = Math.max(globalEnd, bars[bars.length - 1].time);
  }
  if (!Object.keys(datasets).length) throw new Error('No H1_LONG datasets found.');
  const splitTime = globalStart + (globalEnd - globalStart) * 0.70;
  let selectedTp = Number(process.env.RANGE_TP_R) || 1.0;
  let selectedSl = Number(process.env.RANGE_SL_ATR) || 2.5;
  let tpSource = 'environment/default exploratory value';
  try {
    const opt = JSON.parse(fs.readFileSync('range-optimization-report.json', 'utf8'));
    if (opt.selectedOnInSampleOnly && Number(opt.selectedOnInSampleOnly.tpR) > 0 && Number(opt.selectedOnInSampleOnly.slAtr) > 0) { selectedTp = Number(opt.selectedOnInSampleOnly.tpR); selectedSl = Number(opt.selectedOnInSampleOnly.slAtr); tpSource = 'selected using in-sample only'; }
  } catch (e) {}

  const candidates = [];
  const perStrategy = {};
  for (const [symbol, bars] of Object.entries(datasets)) {
    for (const mode of ['pattern', 'range']) {
      const tp = mode === 'range' ? selectedTp : 1.5;
      const trades = runSymbolMode(symbol, bars, mode, tp, selectedSl);
      candidates.push(...trades);
      perStrategy[`${symbol}_${mode}`] = { fullPeriod: stats(trades), outOfSample: stats(trades.filter(t => t.openTime >= splitTime)) };
    }
  }
  const selected = selectPortfolio(candidates, 3, 1);
  const oosSelected = selectPortfolio(candidates.filter(t => t.openTime >= splitTime), 3, 1);
  const report = {
    generatedAt: new Date().toISOString(), timeframe: 'H1',
    rangeTpR: selectedTp, rangeTpSource: tpSource, rangeSlAtr: selectedSl,
    portfolioRules: { maxOpenPositions: 3, maxPerCorrelationGroup: 1, sameSymbolOverlap: false, riskPerTradePct: RISK_PCT * 100 },
    costAssumptionsPriceUnits: COST_PRICE,
    warning: 'Costs are provisional proxies inherited from the project scripts, not verified broker quotes. Portfolio risk uses fixed risk cash per trade; replace costs and position sizing with broker-specific values before live use.',
    splitTime: new Date(splitTime * 1000).toISOString(),
    dataQuality: quality,
    candidates: candidates.length,
    selectedPortfolioTrades: selected.length,
    fullPeriod: stats(selected),
    outOfSample: stats(oosSelected),
    selectedByMode: { trend: stats(selected.filter(t => t.mode === 'pattern')), range: stats(selected.filter(t => t.mode === 'range')) },
    outOfSampleByMode: { trend: stats(oosSelected.filter(t => t.mode === 'pattern')), range: stats(oosSelected.filter(t => t.mode === 'range')) },
    candidatesByMode: { trend: stats(candidates.filter(t => t.mode === 'pattern')), range: stats(candidates.filter(t => t.mode === 'range')) },
    bySymbolAndMode: perStrategy,
    selectedTrades: selected
  };
  fs.writeFileSync('portfolio-backtest-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main();
module.exports = { runSymbolMode, selectPortfolio, stats };
