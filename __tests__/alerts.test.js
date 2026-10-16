const AL = require("../alerts.js");

describe("toMin", () => {
  test("ساعت معتبر → دقیقه", () => {
    expect(AL.toMin("09:30")).toBe(570);
    expect(AL.toMin("00:00")).toBe(0);
    expect(AL.toMin("23:59")).toBe(1439);
  });
  test("نامعتبر → null", () => {
    expect(AL.toMin("bad")).toBeNull();
    expect(AL.toMin("")).toBeNull();
    expect(AL.toMin(null)).toBeNull();
  });
});

describe("inWindow", () => {
  test("بدون بازه → true", () => {
    expect(AL.inWindow({}, { dow: 1, min: 500 })).toBe(true);
  });
  test("بازه‌ی عادی ۰۸:۰۰–۲۲:۰۰", () => {
    const a = { from: "08:00", to: "22:00" };
    expect(AL.inWindow(a, { dow: 1, min: 600 })).toBe(true);
    expect(AL.inWindow(a, { dow: 1, min: 100 })).toBe(false);
    expect(AL.inWindow(a, { dow: 1, min: 1400 })).toBe(false);
  });
  test("بازه‌ی شبانه ۲۲:۰۰–۰۶:۰۰", () => {
    const a = { from: "22:00", to: "06:00" };
    expect(AL.inWindow(a, { dow: 1, min: 1380 })).toBe(true);
    expect(AL.inWindow(a, { dow: 1, min: 120 })).toBe(true);
    expect(AL.inWindow(a, { dow: 1, min: 720 })).toBe(false);
  });
  test("روزهای هفته فیلتر می‌کند", () => {
    const a = { days: [1, 3] };
    expect(AL.inWindow(a, { dow: 1, min: 500 })).toBe(true);
    expect(AL.inWindow(a, { dow: 2, min: 500 })).toBe(false);
  });
});

describe("perDay", () => {
  test("بازه‌ی کامل با فاصله‌ی ۶۰ دقیقه → ۲۴", () => {
    expect(AL.perDay({ every: 60 })).toBe(24);
  });
  test("بازه‌ی ۸ ساعته با فاصله‌ی ۳۰ دقیقه", () => {
    expect(AL.perDay({ every: 30, from: "09:00", to: "17:00" })).toBe(17);
  });
});

describe("validate", () => {
  test("نماد خالی → خطا", () => {
    expect(AL.validate({})).toBeTruthy();
    expect(AL.validate({ sym: "BTCUSDT" })).toBeTruthy();
  });
  test("above با قیمت معتبر → null", () => {
    expect(AL.validate({ sym: "BTCUSDT", type: "above", price: 100 })).toBeNull();
  });
  test("above با قیمت نامعتبر → خطا", () => {
    expect(AL.validate({ sym: "BTCUSDT", type: "above", price: 0 })).toBeTruthy();
    expect(AL.validate({ sym: "BTCUSDT", type: "above", price: -1 })).toBeTruthy();
  });
  test("time بدون ساعت → خطا", () => {
    expect(AL.validate({ sym: "BTCUSDT", type: "time", at: [] })).toBeTruthy();
  });
  test("time با ساعت → null", () => {
    expect(AL.validate({ sym: "BTCUSDT", type: "time", at: ["09:00"] })).toBeNull();
  });
  test("every با مقدار مجاز → null", () => {
    expect(AL.validate({ sym: "BTCUSDT", type: "every", every: 5 })).toBeNull();
    expect(AL.validate({ sym: "BTCUSDT", type: "every", every: 0 })).toBeTruthy();
    expect(AL.validate({ sym: "BTCUSDT", type: "every", every: 2000 })).toBeTruthy();
  });
});

describe("resolve", () => {
  const U = [["BTCUSDT", "BTC-USDT", "BTC-USD", 2]];
  test("نماد شناخته‌شده", () => {
    expect(AL.resolve("BTCUSDT", U)).toEqual(U[0]);
  });
  test("نماد ناشناخته‌ی کریپتو → حدس USDT", () => {
    const r = AL.resolve("PEPEUSDT", U);
    expect(r[1]).toBe("PEPE-USDT");
  });
  test("نماد فارکس ۶ حرفی → حدس OANDA", () => {
    const r = AL.resolve("EURUSD", U);
    expect(r[4]).toBe("EUR_USD");
  });
});

describe("check — every", () => {
  test("در پنجره‌ی زمانی، فقط یک بار در هر slot", () => {
    const tz = "UTC";
    const a = { id: "a1", sym: "X", type: "every", every: 5, on: true };
    const list = [a];
    const bars = Array.from({ length: 20 }, (_, i) => ({
      time: 1700000000 + i * 300, open: 100, high: 101, low: 99, close: 100.5
    }));
    const data = { X: { bars, dg: 2 } };
    const st = {};
    const t1 = 1700000200;
    const out1 = AL.check(list, data, t1, st, tz);
    expect(out1.length).toBe(1);
    const out2 = AL.check(list, data, t1 + 60, st, tz);
    expect(out2.length).toBe(0);
    const out3 = AL.check(list, data, t1 + 300, st, tz);
    expect(out3.length).toBe(1);
  });
});

describe("check — above", () => {
  test("قیمت از سطح بالاتر رفت → شلیک می‌کند", () => {
    const a = { id: "a1", sym: "X", type: "above", price: 105, repeat: "once", on: true };
    const bars = [{ time: 1700000000, open: 100, high: 110, low: 99, close: 108 }];
    const out = AL.check([a], { X: { bars, dg: 2 } }, 1700000000 + 60, {}, "UTC");
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe("price");
  });

  test("repeat=once → فقط یک بار", () => {
    const a = { id: "a1", sym: "X", type: "above", price: 105, repeat: "once", on: true };
    const bars = [{ time: 1700000000, open: 100, high: 110, low: 99, close: 108 }];
    const st = {};
    AL.check([a], { X: { bars, dg: 2 } }, 1700000000 + 60, st, "UTC");
    const out2 = AL.check([a], { X: { bars, dg: 2 } }, 1700000000 + 120, st, "UTC");
    expect(out2.length).toBe(0);
  });

  test("repeat=cool با فاصله → تکرار می‌شود", () => {
    const a = { id: "a1", sym: "X", type: "above", price: 105, repeat: "cool", cool: 1, on: true };
    const bars = [{ time: 1700000000, open: 100, high: 110, low: 99, close: 108 }];
    const st = {};
    AL.check([a], { X: { bars, dg: 2 } }, 1700000000 + 60, st, "UTC");
    const out2 = AL.check([a], { X: { bars, dg: 2 } }, 1700000000 + 121, st, "UTC");
    expect(out2.length).toBe(1);
  });

  test("on=false → هیچ", () => {
    const a = { id: "a1", sym: "X", type: "above", price: 105, on: false };
    const bars = [{ time: 1700000000, open: 100, high: 110, low: 99, close: 108 }];
    const out = AL.check([a], { X: { bars, dg: 2 } }, 1700000000 + 60, {}, "UTC");
    expect(out.length).toBe(0);
  });
});