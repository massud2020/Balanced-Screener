const Engine = require('../engine.js');

function candle(time, open, close, wick = 0.04) {
  return {
    time, open, close,
    high: Math.max(open, close) + wick,
    low: Math.min(open, close) - wick
  };
}

function makeTrendCandles({ dropStart = null, dropStep = 0 } = {}) {
  const candles = [];
  for (let i = 0; i < 300; i++) {
    let base = 100 + i * 0.08;
    if (dropStart !== null && i >= dropStart) {
      base = 100 + dropStart * 0.08 - (i - dropStart + 1) * dropStep;
    }
    let open = base;
    let close = base + 0.03;
    if (i >= 296) {
      const pattern = [
        [base + 0.1, base - 0.1],
        [base + 0.1, base - 0.05],
        [base + 0.1, base - 0.1],
        [base - 0.1, base + 0.2]
      ];
      [open, close] = pattern[i - 296];
    }
    candles.push(candle(1700000000 + i * 300, open, close));
  }
  return candles;
}

describe('Engine phase 3 math and mandatory Trend gates', () => {
  test('RSI returns 50 for flat data, 100 for all-up and 0 for all-down', () => {
    expect(Engine.rsi(Array(300).fill(1.2345), 14).at(-1)).toBe(50);
    expect(Engine.rsi(Array.from({ length: 300 }, (_, i) => 100 + i * 0.1), 14).at(-1)).toBe(100);
    expect(Engine.rsi(Array.from({ length: 300 }, (_, i) => 130 - i * 0.1), 14).at(-1)).toBe(0);
  });

  test('3+1 pattern is order-independent and enforces the 50% body ratio', () => {
    const validLong = [
      candle(1, 10, 9), candle(2, 10, 9.2),
      candle(3, 10, 9.1), candle(4, 9, 10.6)
    ];
    expect(Engine.checkPattern3to1(validLong).pattern_buy).toBe(true);

    const invalidLong = [
      candle(1, 10, 9), candle(2, 10, 9.2),
      candle(3, 10, 9.1), candle(4, 9, 10.2)
    ];
    expect(Engine.checkPattern3to1(invalidLong).pattern_buy).toBe(false);

    const validShort = [
      candle(1, 9, 10), candle(2, 9.2, 10),
      candle(3, 9.1, 10), candle(4, 10.6, 9)
    ];
    expect(Engine.checkPattern3to1(validShort).pattern_sell).toBe(true);
  });

  test('ADX values stay within the mathematical 0..100 range', () => {
    const candles = makeTrendCandles();
    const values = Engine.adx(candles, 14).filter(Number.isFinite);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every(value => value >= 0 && value <= 100)).toBe(true);
  });

  test('Trend signal passes when EMA alignment and 3+1 both pass', () => {
    const candles = makeTrendCandles();
    const result = Engine.evaluate('EURUSD', candles, [], [], {
      mode: 'pattern', adx: false, trend: false, emax: false,
      nc: false, h1: false, m15: false, pa: false, rsi: false, maxDistATR: 0, minRatio: 0.5
    }, candles.at(-1).time + 301);

    expect(result.hardGates).toEqual([
      { name: 'EMA21/EMA50/EMA200', passed: true },
      { name: '3+1 pattern', passed: true }
    ]);
    expect(result.side).toBe('LONG');
  });

  test('broken EMA alignment blocks a signal even when score is 100%', () => {
    const candles = makeTrendCandles({ dropStart: 285, dropStep: 0.3 });
    const result = Engine.evaluate('EURUSD', candles, [], [], {
      mode: 'pattern', adx: false, trend: false, emax: false,
      nc: false, h1: false, m15: false, pa: false, rsi: false, maxDistATR: 0, minRatio: 0.5
    }, candles.at(-1).time + 301);

    expect(result.scorePercent).toBe(100);
    expect(result.hardGates[0].passed).toBe(false);
    expect(result.hardGates[1].passed).toBe(true);
    expect(result.side).toBeNull();
  });
});


test('enforces EMA21 pullback tolerance (allows near-EMA21 pullback, blocks overextended entries)', () => {
  const extended = makeTrendCandles();
  const blocked = Engine.evaluate('EURUSD', extended, [], [], {
    mode: 'pattern', adx: false, trend: false, emax: false,
    nc: false, h1: false, m15: false, pa: false, rsi: false, minRatio: 0.5
  }, extended.at(-1).time + 301);
  expect(blocked.side).toBeNull();

  // شبیه‌سازی پولبک نزدیک EMA21 (با فاصله حدود 0.4 ATR بدون لمس کامل خط EMA21)
  const nearPullback = extended.map(c => ({ ...c }));
  const n = nearPullback.length;
  const refPrice = nearPullback[n - 5].close;
  nearPullback[n - 4] = candle(nearPullback[n - 4].time, refPrice - 0.60, refPrice - 0.66, 0.02);
  nearPullback[n - 3] = candle(nearPullback[n - 3].time, refPrice - 0.66, refPrice - 0.71, 0.02);
  nearPullback[n - 2] = candle(nearPullback[n - 2].time, refPrice - 0.71, refPrice - 0.75, 0.02);
  nearPullback[n - 1] = candle(nearPullback[n - 1].time, refPrice - 0.75, refPrice - 0.66, 0.02);

  const allowed = Engine.evaluate('EURUSD', nearPullback, [], [], {
    mode: 'pattern', adx: false, trend: false, emax: false,
    nc: false, h1: false, m15: false, pa: false, rsi: false, minRatio: 0.5
  }, nearPullback.at(-1).time + 301);
  expect(allowed.side).toBe('LONG');
});
