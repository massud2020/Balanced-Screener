const E = require('../engine.js');

const candle = (time, open, high, low, close) => ({ time, open, high, low, close });

describe('Phase 1 core-engine corrections', () => {
  test('RSI returns 50 for a completely flat series', () => {
    const values = E.rsi(Array(40).fill(100), 14);
    expect(values[39]).toBe(50);
  });

  test('ADX uses Wilder smoothing and remains within 0..100', () => {
    const bars = Array.from({ length: 80 }, (_, i) =>
      candle(i * 300, 100 + i, 102 + i, 99 + i, 101 + i)
    );
    const values = E.adx(bars, 14);
    expect(values[27]).toBeCloseTo(100, 8);
    expect(values[79]).toBeCloseTo(100, 8);
    expect(values.filter(Number.isFinite).every(v => v >= 0 && v <= 100)).toBe(true);
  });

  test('3+1 LONG accepts any candle order and enforces the 50% body ratio', () => {
    const bars = [
      candle(0, 100, 100, 99, 99),
      candle(300, 99, 99, 98, 98),
      candle(600, 99.5, 99.5, 98.5, 98.5),
      candle(900, 98, 99.5, 98, 99.5)
    ];
    expect(E.checkPattern3to1(bars).pattern_buy).toBe(true);

    const weakBars = [
      candle(0, 100, 100, 99, 99),
      candle(300, 99, 99, 98, 98),
      candle(600, 98, 99.1, 98, 99.1),
      candle(900, 99.1, 99.1, 98.1, 98.1)
    ];
    expect(E.checkPattern3to1(weakBars).pattern_buy).toBe(false);
  });

  test('3+1 SHORT is the inverse pattern and also enforces body ratio', () => {
    const bars = [
      candle(0, 100, 101, 100, 101),
      candle(300, 101, 102, 101, 102),
      candle(600, 100.5, 101.5, 100.5, 101.5),
      candle(900, 102, 102, 100.5, 100.5)
    ];
    expect(E.checkPattern3to1(bars).pattern_sell).toBe(true);
  });

  test('evaluate ignores a still-forming H1 candle', () => {
    const now = 10_000_000;
    const m5 = Array.from({ length: 240 }, (_, i) => {
      const close = 100 + i * 0.1;
      return candle(now - (240 - i) * 300, close - 0.05, close + 0.1, close - 0.1, close);
    });
    const h1 = Array.from({ length: 200 }, (_, i) => {
      const close = 100 + i * 0.2;
      return candle(now - (200 - i) * 3600, close - 0.1, close + 0.2, close - 0.2, close);
    });
    // This unfinished H1 bar strongly reverses the trend. It must not affect the H1 EMA check.
    h1.push(candle(now - 1800, 200, 201, 50, 50));

    const result = E.evaluate('TEST', m5, [], h1, {
      mode: 'pattern', adx: false, trend: false, emax: false,
      nc: false, pat: false, pa: false, m15: false, h1: true
    }, now);
    const h1Check = result.checks.find(item => typeof item.l === "string" && item.l.includes("H1") && item.l.includes("روند"));
    expect(h1Check).toBeTruthy();
    expect(h1Check.ok).toBe(true);
  });

  test('adx:false disables the ADX gate instead of silently applying it', () => {
    const bars = Array.from({ length: 240 }, (_, i) => {
      const close = 100 + i * 0.1;
      return candle(i * 300, close - 0.05, close + 0.1, close - 0.1, close);
    });
    const result = E.evaluate('TEST', bars, [], [], {
      mode: 'pattern', adx: false, trend: false, emax: false,
      nc: false, pat: false, pa: false, m15: false, h1: false
    }, 240 * 300 + 600);
    expect(result.checks.some(item => item.l.includes('ADX'))).toBe(false);
  });
});
