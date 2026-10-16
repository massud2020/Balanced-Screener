const E = require("../engine.js");

const mkCandle = (time, o, h, l, c) => ({ time, open: o, high: h, low: l, close: c });

// ---- EMA ----
describe("ema", () => {
  test("طول خروجی با ورودی برابر است", () => {
    const out = E.ema([1, 2, 3, 4, 5], 3);
    expect(out.length).toBe(5);
  });
  test("مقادیر اول null هستند", () => {
    const out = E.ema([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).not.toBeNull();
  });
  test("برای سری ثابت، EMA همان مقدار است", () => {
    const out = E.ema([5, 5, 5, 5, 5], 3);
    expect(out[4]).toBeCloseTo(5, 6);
  });
});

// ---- RSI ----
describe("rsi", () => {
  test("سری صعودی → RSI نزدیک ۱۰۰", () => {
    const c = Array.from({ length: 30 }, (_, i) => 100 + i);
    const r = E.rsi(c, 14);
    expect(r[29]).toBeGreaterThan(95);
  });
  test("سری نزولی → RSI نزدیک ۰", () => {
    const c = Array.from({ length: 30 }, (_, i) => 100 - i);
    const r = E.rsi(c, 14);
    expect(r[29]).toBeLessThan(5);
  });
});

// ---- ATR ----
describe("atr", () => {
  test("مقدار مثبت تولید می‌کند", () => {
    const cs = Array.from({ length: 20 }, (_, i) => mkCandle(i * 300, 100, 102, 99, 101));
    const a = E.atr(cs, 14);
    expect(a[19]).toBeGreaterThan(0);
  });
});

// ---- checkPattern ----
describe("checkPattern", () => {
  test("LONG: یک صعودی بزرگ + سه نزولی کوچک → ok", () => {
    const bigUp = mkCandle(0, 100, 110, 99, 109);
    const small1 = mkCandle(300, 109, 109.5, 107, 108);
    const small2 = mkCandle(600, 108, 108.5, 106, 107);
    const small3 = mkCandle(900, 107, 107.5, 105, 106);
    const r = E.checkPattern([bigUp, small1, small2, small3], "LONG", 0.5);
    expect(r.ok).toBe(true);
    expect(r.ratio).toBeGreaterThan(0.5);
  });

  test("LONG با آستانه‌ی بالا → ok=false", () => {
    const bigUp = mkCandle(0, 100, 101, 99.9, 100.9);
    const small1 = mkCandle(300, 100.9, 101.5, 99, 99.5);
    const small2 = mkCandle(600, 99.5, 100, 98, 98.5);
    const small3 = mkCandle(900, 98.5, 99, 97, 97.5);
    const r = E.checkPattern([bigUp, small1, small2, small3], "LONG", 5);
    expect(r.ok).toBe(false);
  });

  test("SHORT: یک نزولی بزرگ + سه صعودی کوچک → ok", () => {
    const bigDn = mkCandle(0, 110, 110, 100, 101);
    const up1 = mkCandle(300, 101, 102, 100.5, 101.5);
    const up2 = mkCandle(600, 101.5, 102.5, 101, 102);
    const up3 = mkCandle(900, 102, 103, 101.5, 102.5);
    const r = E.checkPattern([bigDn, up1, up2, up3], "SHORT", 0.5);
    expect(r.ok).toBe(true);
  });

  test("۴ کندل صعودی → ok=false برای LONG و SHORT", () => {
    const up = mkCandle(0, 100, 102, 99, 101.5);
    const all = [up, up, up, up];
    expect(E.checkPattern(all, "LONG", 0.5).ok).toBe(false);
    expect(E.checkPattern(all, "SHORT", 0.5).ok).toBe(false);
  });
});

// ---- divExit ----
describe("divExit", () => {
  test("واگرایی نزولی روی سقف‌ها → برگرداند", () => {
    const cs = [];
    for (let i = 0; i < 30; i++) cs.push(mkCandle(i * 300, 100 + i * 0.1, 101 + i * 0.1, 99 + i * 0.1, 100.5 + i * 0.1));
    cs[10] = mkCandle(10 * 300, 100, 110, 99, 105);
    cs[20] = mkCandle(20 * 300, 105, 115, 104, 110);
    const rA = new Array(cs.length).fill(50);
    rA[10] = 75;
    rA[20] = 65;
    const r = E.divExit(cs, rA, 5, true);
    expect(r).not.toBeNull();
    expect(r.i).toBe(20);
  });

  test("بدون واگرایی → null", () => {
    const cs = [];
    for (let i = 0; i < 30; i++) cs.push(mkCandle(i * 300, 100, 101, 99, 100.5));
    const rA = new Array(cs.length).fill(50);
    const r = E.divExit(cs, rA, 5, true);
    expect(r).toBeNull();
  });
});

// ---- evaluate ----
describe("evaluate", () => {
  test("بدون تاریخچه کافی → fail", () => {
    const r = E.evaluate("TEST", [mkCandle(0, 1, 1, 1, 1)], [], {}, Date.now() / 1000);
    expect(r.fail).toBeTruthy();
    expect(r.side).toBeNull();
  });
});

// ---- resample ----
describe("resample", () => {
  test("۵ کندل ۱ دقیقه‌ای → ۱ کندل ۵ دقیقه‌ای", () => {
    const cs = Array.from({ length: 5 }, (_, i) => mkCandle(i * 60, 100 + i, 101 + i, 99 + i, 100.5 + i));
    const r = E.resample(cs, 5);
    expect(r.length).toBe(1);
    expect(r[0].open).toBe(100);
    expect(r[0].close).toBe(104.5);
    expect(r[0].high).toBe(105);
    expect(r[0].low).toBe(99);
  });
});