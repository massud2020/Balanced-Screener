const TradePolicy = require("../trade-policy.js");

describe("shared live/backtest exit policy (New Logic)", () => {
  const base = { side: "LONG", entry: 100, sl: 99, startTime: 1000 };

  test("Trend does not use dynamic trailing stop without TP1", () => {
    const bars = [
      { time: 1000, high: 101.6, low: 100.2, close: 101.4 },
      { time: 1300, high: 104.1, low: 101.1, close: 103.8 },
      { time: 1600, high: 103.5, low: 100.5, close: 100.8 }
    ];
    const r = TradePolicy.resolveTrade({ ...base, mode: "pattern", bars, now: 1600 });
    expect(r.status).toBe("open");
  });

  test("Range closes full position at 1.5R", () => {
    const bars = [{ time: 1000, high: 101.6, low: 100.2, close: 101.4 }];
    const r = TradePolicy.resolveTrade({ ...base, mode: "range", bars, now: 1000 });
    expect(r.status).toBe("closed");
    expect(r.why).toBe("TP");
    expect(r.R).toBeCloseTo(1.5, 6);
  });
});
