const B = require("../btengine.js");

const mkCandle = (time, o, h, l, c) => ({ time, open: o, high: h, low: l, close: c });

describe("sessInfo", () => {
  test("بدون شکاف → یک سشن", () => {
    const m = Array.from({ length: 10 }, (_, i) => mkCandle(1700000000 + i * 300, 1, 1, 1, 1));
    const s = B.sessInfo(m, 30);
    expect(s.gaps).toBe(0);
    expect(s.start[0]).toBe(0);
    expect(s.end[9]).toBe(9);
  });
  test("با شکاف بزرگ → دو سشن", () => {
    const m = [];
    for (let i = 0; i < 5; i++) m.push(mkCandle(1700000000 + i * 300, 1, 1, 1, 1));
    for (let i = 0; i < 5; i++) m.push(mkCandle(1700000000 + 3600 + i * 300, 1, 1, 1, 1));
    const s = B.sessInfo(m, 30);
    expect(s.gaps).toBe(1);
    expect(s.start[0]).toBe(0);
    expect(s.end[4]).toBe(4);
    expect(s.start[5]).toBe(5);
    expect(s.end[9]).toBe(9);
  });
});

describe("decodeBuf", () => {
  test("UTF-8 با BOM", () => {
    const buf = new Uint8Array([0xEF, 0xBB, 0xBF, 0x41, 0x42]).buffer;
    expect(B.decodeBuf(buf)).toBe("AB");
  });
  test("UTF-16LE", () => {
    const buf = new Uint8Array([0xFF, 0xFE, 0x41, 0x00, 0x42, 0x00]).buffer;
    expect(B.decodeBuf(buf)).toBe("AB");
  });
});

describe("parseMT5", () => {
  test("فایل با هدر Tab-separated", () => {
    const rows = ["<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>"];
    for (let i = 0; i < 100; i++) {
      const d = new Date(1700000000000 + i * 300000);
      const dd = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
      const tt = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
      rows.push(`${dd}\t${tt}\t100.0\t101.0\t99.0\t100.5`);
    }
    const r = B.parseMT5(rows.join("\n"));
    expect(r.error).toBeUndefined();
    expect(r.t.length).toBe(100);
    expect(r.step).toBe(300);
  });

  test("فایل بدون هدر با Date Time ترکیبی", () => {
    const rows = [];
    for (let i = 0; i < 100; i++) {
      const d = new Date(1700000000000 + i * 300000);
      const dt = `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)}`;
      rows.push(`${dt},100,101,99,100.5`);
    }
    const r = B.parseMT5(rows.join("\n"));
    expect(r.error).toBeUndefined();
    expect(r.t.length).toBe(100);
  });

  test("فایل کوچک → خطا", () => {
    const r = B.parseMT5("a,b,c\n1,2,3");
    expect(r.error).toBeTruthy();
  });

  test("تایم‌فریم M1 → تبدیل به M5 می‌شود", () => {
    // ۳۰۰ کندل ۱ دقیقه‌ای = ۵ ساعت داده (کافی برای resample مطمئن)
    const rows = ["<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>"];
    for (let i = 0; i < 300; i++) {
      const d = new Date(1700000000000 + i * 60000);
      const dd = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
      const tt = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:00`;
      rows.push(`${dd}\t${tt}\t100.0\t101.0\t99.0\t100.5`);
    }
    const r = B.parseMT5(rows.join("\n"));
    expect(r.error).toBeUndefined();
    // بعد از resample به M5، step باید ۳۰۰ ثانیه باشه
    expect(r.step).toBe(300);
    // ۳۰۰ کندل ۱ دقیقه‌ای → ۶۰ کندل ۵ دقیقه‌ای
    expect(r.t.length).toBeGreaterThanOrEqual(55);
    expect(r.t.length).toBeLessThanOrEqual(65);
  });
});

describe("metrics", () => {
  test("بدون معامله → n=0", () => {
    expect(B.metrics([], 1).n).toBe(0);
  });
  test("همه برنده", () => {
    const tr = [
      { tX: 1, R: 2, side: "LONG", bars: 5 },
      { tX: 2, R: 1, side: "LONG", bars: 5 },
    ];
    const m = B.metrics(tr, 1);
    expect(m.wr).toBe(100);
    expect(m.pf).toBe(Infinity);
    expect(m.sumR).toBe(3);
  });
  test("همه بازنده → PF=0", () => {
    const tr = [
      { tX: 1, R: -1, side: "SHORT", bars: 5 },
      { tX: 2, R: -1, side: "SHORT", bars: 5 },
    ];
    const m = B.metrics(tr, 1);
    expect(m.wr).toBe(0);
    expect(m.pf).toBe(0);
  });
  test("باخت متوالی درست شمرده می‌شود", () => {
    const tr = [
      { tX: 1, R: -1, side: "LONG", bars: 5 },
      { tX: 2, R: -1, side: "LONG", bars: 5 },
      { tX: 3, R: 2, side: "LONG", bars: 5 },
      { tX: 4, R: -1, side: "LONG", bars: 5 },
    ];
    const m = B.metrics(tr, 1);
    expect(m.maxLossStreak).toBe(2);
  });
});

describe("equityOf", () => {
  test("منحنی انباشته درست", () => {
    const tr = [
      { tX: 1, R: 1 },
      { tX: 3, R: -0.5 },
      { tX: 2, R: 2 },
    ];
    const eq = B.equityOf(tr);
    expect(eq.length).toBe(3);
    expect(eq[0].v).toBe(1);
    expect(eq[1].v).toBe(3);
    expect(eq[2].v).toBe(2.5);
  });
});