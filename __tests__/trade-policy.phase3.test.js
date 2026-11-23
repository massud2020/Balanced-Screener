const TradePolicy = require('../trade-policy.js');

describe('Trade policy ATR trailing and conservative intrabar resolution', () => {
  test('Trend trailing distance is 0.5 ATR, not 0.5 initial risk', () => {
    const result = TradePolicy.resolveTrade({
      side: 'LONG', entry: 100, sl: 98, mode: 'pattern', startTime: 1,
      opts: { initialAtr: 1, previousClose: 100, trailingAtrMult: 0.5 },
      bars: [
        { time: 1, open: 100, high: 101.8, low: 100, close: 101.8 },
        { time: 2, open: 101.8, high: 102, low: 101.0, close: 101.2 }
      ]
    });
    expect(result.status).toBe('closed');
    expect(result.why).toBe('TRAIL_SL');
    expect(result.exit).toBeGreaterThan(101.2);
    expect(result.exit).toBeLessThan(101.8);
  });

  test('SL wins when a candle could touch both the stop and range TP', () => {
    const result = TradePolicy.resolveTrade({
      side: 'LONG', entry: 100, sl: 99, mode: 'range', startTime: 1,
      opts: { rangeTpMult: 1.0 },
      bars: [{ time: 1, open: 100, high: 102, low: 98.5, close: 101 }]
    });
    expect(result.status).toBe('closed');
    expect(result.why).toBe('SL');
    expect(result.R).toBe(-1);
  });
});

describe('Trade policy gap fills', () => {
  test('a gap through the stop is filled at the worse candle open', () => {
    const result = TradePolicy.resolveTrade({
      side: 'LONG', entry: 100, sl: 99, mode: 'range', startTime: 1,
      opts: { rangeTpMult: 1 },
      bars: [{ time: 1, open: 98.5, high: 102, low: 98, close: 101 }]
    });
    expect(result.why).toBe('SL');
    expect(result.exit).toBe(98.5);
    expect(result.R).toBe(-1.5);
  });
});


test('caps gap loss at 2R across SL and TIME exits', () => {
  const slGap = TradePolicy.resolveTrade({
    side: 'LONG', entry: 100, sl: 99, mode: 'pattern', startTime: 1,
    bars: [{ time: 1, open: 96, high: 97, low: 95, close: 96.5 }]
  });
  expect(slGap.why).toBe('TRAIL_SL');
  expect(slGap.R).toBe(-2);
  expect(slGap.exit).toBe(98);

  const timeGap = TradePolicy.resolveTrade({
    side: 'LONG', entry: 100, sl: 90, mode: 'pattern', startTime: 1, maxHoldSec: 10,
    bars: [{ time: 20, open: 95, high: 96, low: 91, close: 75 }]
  });
  expect(timeGap.why).toBe('TIME');
  expect(timeGap.R).toBe(-2);
});
