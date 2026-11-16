const Engine = require('../engine.js');

function makeCandles(count = 260) {
  const candles = [];
  let price = 1.1;
  const start = 1790000000;
  for (let i = 0; i < count; i++) {
    const delta = Math.sin(i / 7) * 0.0004 + (i % 31 < 16 ? 0.00003 : -0.00002);
    const open = price;
    price += delta;
    const close = price;
    candles.push({
      time: start + i * 300,
      open,
      high: Math.max(open, close) + 0.00012,
      low: Math.min(open, close) - 0.00012,
      close
    });
  }
  return candles;
}

describe('Engine phase 4 regression', () => {
  test.each([true, false])('Range evaluation does not throw when RSI filter is %s', (rsi) => {
    const candles = makeCandles();
    const result = Engine.evaluate(
      'EURUSD', candles, [], [],
      { mode: 'range', h1: false, m15: false, rsi },
      candles[candles.length - 1].time + 300
    );
    expect(result).toBeDefined();
    expect(Array.isArray(result.checks)).toBe(true);
  });
});

describe('Build 95 configuration wiring', () => {
  test('Price Action is not an entry gate even if a legacy caller sets pa:true', () => {
    const candles = makeCandles();
    const result = Engine.evaluate('TEST', candles, [], [], {
      mode: 'pattern', h1: false, m15: false, adx: false,
      trend: false, emax: false, nc: false, pa: true, minScorePercent: 0
    }, candles[candles.length - 1].time + 300);
    expect(result.checks.some(item => item.l.includes('پرایس‌اکشن'))).toBe(false);
  });

  test('signalIntervalSec controls forming-candle exclusion for H1 tests', () => {
    const candles = makeCandles(200);
    const result = Engine.evaluate('TEST', candles, [], [], {
      mode: 'pattern', signalIntervalSec: 3600, sessionFilter: false,
      h1: false, m15: false, adx: false
    }, candles[candles.length - 1].time + 300);
    expect(result.fail).toBe('کمبود کندل تایم‌فریم سیگنال');
  });

  test('Range uses configured SL ATR and TP multiplier', () => {
    const candles = makeCandles(260);
    const result = Engine.evaluate('TEST', candles, [], [], {
      mode: 'range', signalIntervalSec: 300, sessionFilter: false,
      h1: false, m15: false, adx: false, rsi: false,
      rangeMinATR: 0, rangeSlAtr: 2.5, rangeMaxRiskATR: 3,
      rangeTpMult: 1.0, minScorePercent: 0
    }, candles[candles.length - 1].time + 300);
    expect(result.effectiveSlAtr).toBe(2.5);
    expect(result.tp1R).toBe(1.0);
    expect(result.tp2R).toBe(1.0);
  });
});

describe('Correlation groups with overlapping memberships', () => {
  test('EURUSD and EURJPY share at least one correlation group', () => {
    const a = Engine.getCorrelationGroups('EURUSD');
    const b = Engine.getCorrelationGroups('EURJPY');
    expect(a.some(group => b.includes(group))).toBe(true);
  });
});
