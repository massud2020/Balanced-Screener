const Backtest = require('../btengine.js');
const TradePolicy = require('../trade-policy.js');

function makeTrendFixture() {
  const candles = [];
  let price = 1.1;
  const start = 1794207600;
  for (let i = 0; i < 200; i++) {
    const open = price;
    let close;
    if (i >= 196 && i <= 198) close = open - 0.00025;
    else if (i === 199) close = open + 0.00045;
    else close = open + 0.00018;
    candles.push({ time: start + i * 300, open, high: Math.max(open, close) + 0.00006, low: Math.min(open, close) - 0.00006, close });
    price = close;
  }
  for (let i = 200; i < 280; i++) {
    const open = i === 200 ? price + 0.0002 : price;
    const close = open + 0.000001;
    candles.push({ time: start + i * 300, open, high: close + 0.000005, low: open - 0.000005, close });
    price = close;
  }
  return candles;
}

describe('Backtest phase 4 execution and time-exit accuracy', () => {
  test('max-hold exits on the first eligible candle, not the end of the supplied history', () => {
    const bars = Array.from({ length: 10 }, (_, i) => ({
      time: 1000 + i * 300, open: 100.2, high: 100.3, low: 100.1, close: 100.2
    }));
    const result = TradePolicy.resolveTrade({
      side: 'LONG', entry: 100, sl: 99, mode: 'pattern',
      bars, startTime: 1000, maxHoldSec: 600, now: 3700,
      opts: { initialAtr: 2, previousClose: 100 }
    });
    expect(result.status).toBe('closed');
    expect(result.why).toBe('TIME');
    expect(result.closeTime).toBe(1600);
  });

  test('backtest fills at the next M5 candle open', () => {
    const bars = makeTrendFixture();
    const trades = Backtest.runBacktestOnSymbol('EURUSD', bars, [], [], {
      mode: 'pattern', h1: false, m15: false, pa: false, nc: false, rsi: false, adx: false, maxDistATR: 0,
      spreadPips: 0, commissionPips: 0, slippagePips: 0
    });
    expect(trades.length).toBeGreaterThan(0);
    
    // سیگنال روی بسته‌شدن کندل ۲۰۰ کندلی (اندیس ۱۹۹) صادر و در Open کندل ۲۰۰ اجرا می‌شود.
    expect(trades[0].entry).toBeCloseTo(bars[200].open, 10);
    expect(trades[0].entry).not.toBeCloseTo(bars[199].open, 10);
  });
});

describe('Portfolio correlation overlap protection', () => {
  test('overlapping group memberships block EURUSD and EURJPY together', () => {
    const selected = Backtest.applyPortfolioConstraints([
      { symbol: 'EURUSD', openTime: 100, closeTime: 500, scorePercent: 90 },
      { symbol: 'EURJPY', openTime: 200, closeTime: 600, scorePercent: 95 }
    ], { maxOpenPositions: 3, maxPerCorrelationGroup: 1 });
    expect(selected.length).toBe(1);
    expect(selected[0].symbol).toBe('EURUSD');
  });
});
