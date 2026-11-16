const Backtest = require("../btengine.js");

describe("backtest phase 2 exit alignment (New Logic)", () => {
  test("Trend exits with trailing stop", () => {
    const bars = [
      { time: 1000, high: 101.6, low: 100.2, close: 101.4 },
      { time: 1300, high: 104.1, low: 101.1, close: 103.8 },
      { time: 1600, high: 103.5, low: 100.5, close: 100.8 }
    ];
    const r = Backtest.simulateTrade("LONG", 100, 99, 101.5, 104, 0.5, bars, 0, "pattern", 1000, {});
    expect(r.why).toBe("TRAIL_SL");
    expect(r.R).toBeGreaterThan(0);
  });

  test("Range exits the full position at 1.5R", () => {
    const bars = [{ time: 1000, high: 101.6, low: 100.2, close: 101.4 }];
    const r = Backtest.simulateTrade("LONG", 100, 99, 101.5, 101.5, 0.5, bars, 0, "range", 1000, {});
    expect(r.why).toBe("TP");
    expect(r.R).toBeCloseTo(1.5, 6);
  });

  test("Flat trades are not classified as losses", () => {
    const stats = Backtest.calculateStats([
      { R: 1, closeTime: 1 }, { R: -1, closeTime: 2 }, { R: 0, closeTime: 3 }
    ]);
    expect(stats.flats).toBe(1);
    expect(stats.losses).toBe(1);
  });
});
