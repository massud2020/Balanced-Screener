// presets.js - تنظیمات پیشنهادی برای جفت‌های مختلف (همگام با engine v40)
const PRESETS = {
  EURUSD: { mode: "pattern", adxMin: 23, rsiL: 42, rsiS: 58, minRatio: 0.52, maxDistATR: 3.2, atrMultSL: 1.7, swingLook: 12, rangeAdxMax: 18, rangeMinATR: 2.6, rangeMinRR: 1.7, rangeMaxRiskATR: 2.6 },
  GBPUSD: { mode: "pattern", adxMin: 24, rsiL: 40, rsiS: 60, minRatio: 0.55, maxDistATR: 3.8, atrMultSL: 1.9, swingLook: 10, rangeAdxMax: 19, rangeMinATR: 2.9, rangeMinRR: 1.6, rangeMaxRiskATR: 2.9 },
  USDJPY: { mode: "pattern", adxMin: 25, rsiL: 45, rsiS: 55, minRatio: 0.50, maxDistATR: 3.0, atrMultSL: 1.6, swingLook: 14, rangeAdxMax: 20, rangeMinATR: 2.5, rangeMinRR: 1.8, rangeMaxRiskATR: 2.5 },
  AUDUSD: { mode: "pattern", adxMin: 22, rsiL: 43, rsiS: 57, minRatio: 0.53, maxDistATR: 3.4, atrMultSL: 1.75, swingLook: 11, rangeAdxMax: 19, rangeMinATR: 2.7, rangeMinRR: 1.65 },
  XAUUSD: { mode: "pattern", adxMin: 22, rsiL: 38, rsiS: 62, minRatio: 0.48, maxDistATR: 4.5, atrMultSL: 2.1, swingLook: 8, rangeAdxMax: 21, rangeMinATR: 3.2, rangeMinRR: 1.5, rangeMaxRiskATR: 3.2, rangeRsiL: 28, rangeRsiS: 72 },
  BTCUSDT: { mode: "pattern", adxMin: 20, rsiL: 35, rsiS: 65, minRatio: 0.45, maxDistATR: 5.0, atrMultSL: 2.3, swingLook: 7, rangeAdxMax: 22, rangeMinATR: 3.5, rangeMinRR: 1.4, rangeMaxRiskATR: 3.5, rangeRsiL: 25, rangeRsiS: 75 },
  ETHUSDT: { mode: "pattern", adxMin: 21, rsiL: 36, rsiS: 64, minRatio: 0.47, maxDistATR: 4.8, atrMultSL: 2.2, swingLook: 8, rangeAdxMax: 22, rangeMinATR: 3.3, rangeMinRR: 1.45, rangeMaxRiskATR: 3.4 },
  RANGE_STRICT: { mode: "range", rangeAdxMax: 17, rangeMinATR: 3.0, rangeMinTouches: 4, rangeMinRR: 1.8, rangeMaxRiskATR: 2.5, rangeRsiL: 30, rangeRsiS: 70, rangeTouchPct: 0.10 },
  RANGE_RELAXED: { mode: "range", rangeAdxMax: 22, rangeMinATR: 2.4, rangeMinTouches: 2, rangeMinRR: 1.4, rangeMaxRiskATR: 3.0, rangeRsiL: 35, rangeRsiS: 65, rangeTouchPct: 0.15 }
};

function getPreset(symbol) {
  const key = (symbol || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (typeof DEF === "undefined") return PRESETS[key] || {};
  if (PRESETS[key]) return { ...DEF, ...PRESETS[key] };
  if (key.includes("XAU") || key.includes("GOLD")) return { ...DEF, ...PRESETS.XAUUSD };
  if (key.includes("BTC")) return { ...DEF, ...PRESETS.BTCUSDT };
  if (key.includes("ETH")) return { ...DEF, ...PRESETS.ETHUSDT };
  return { ...DEF };
}

if (typeof module !== "undefined") module.exports = { PRESETS, getPreset };
