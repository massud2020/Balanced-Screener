// presets.js — single source of per-symbol strategy configuration.
// Session times are UTC. Costs are intentionally not hard-coded: configure them
// from the broker/instrument specification for the data being tested.
// minRatio = minimum 3+1 body ratio (the engine enforces at least 0.50);
// maxDistATR = maximum distance from EMA21 in ATR; swingLook = swing scan depth;
// rangeMinATR = minimum Bollinger width / ATR; rangeTpMult = Range target in R;
// rangeMaxRiskATR = cap on Range stop distance; rangeMinTouches counts band touches.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.Presets = api;
}(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  const SESSION_MAP = {
    EURUSD: { start: 7, end: 16 }, GBPUSD: { start: 7, end: 16 },
    EURJPY: { start: 7, end: 16 }, XAUUSD: { start: 7, end: 16 }, GOLD: { start: 7, end: 16 },
    AUDUSD: { start: 0, end: 7 }, NZDUSD: { start: 0, end: 7 },
    USDCAD: { start: 12, end: 21 }
  };

  const PRESETS = {
    EURUSD: { mode: 'pattern', adxMin: 23, rsiL: 42, rsiS: 58, minRatio: 0.52, maxDistATR: 1.7, atrMultSL: 1.7, swingLook: 12, rangeAdxMax: 18, rangeMinATR: 2.6, rangeTpMult: 1.7, rangeMaxRiskATR: 2.6, minScorePercent: 80 },
    GBPUSD: { mode: 'pattern', adxMin: 24, rsiL: 40, rsiS: 60, minRatio: 0.55, maxDistATR: 1.8, atrMultSL: 1.9, swingLook: 10, rangeAdxMax: 19, rangeMinATR: 2.9, rangeTpMult: 1.6, rangeMaxRiskATR: 2.9, minScorePercent: 90 },
    EURJPY: { mode: 'pattern', adxMin: 23, atrMultSL: 1.8, rangeAdxMax: 19, rangeMinATR: 2.7, rangeTpMult: 1.6, rangeMaxRiskATR: 2.7, minScorePercent: 80 },
    AUDUSD: { mode: 'pattern', adxMin: 22, rsiL: 43, rsiS: 57, minRatio: 0.53, maxDistATR: 1.7, atrMultSL: 1.75, swingLook: 11, rangeAdxMax: 19, rangeMinATR: 2.7, rangeTpMult: 1.65, rangeMaxRiskATR: 2.7 },
    NZDUSD: { mode: 'pattern', adxMin: 22, rsiL: 43, rsiS: 57, minRatio: 0.53, maxDistATR: 1.7, atrMultSL: 1.75, swingLook: 11, rangeAdxMax: 19, rangeMinATR: 2.7, rangeTpMult: 1.65, rangeMaxRiskATR: 2.7 },
    USDCAD: { mode: 'pattern', adxMin: 22, atrMultSL: 1.8, rangeAdxMax: 19, rangeMinATR: 2.7, rangeTpMult: 1.6, rangeMaxRiskATR: 2.7 },
    XAUUSD: { mode: 'pattern', adxMin: 22, rsiL: 38, rsiS: 62, minRatio: 0.48, maxDistATR: 2.0, atrMultSL: 2.1, swingLook: 8, rangeAdxMax: 21, rangeMinATR: 3.2, rangeTpMult: 1.5, rangeMaxRiskATR: 3.2, rangeRsiL: 28, rangeRsiS: 72, minScorePercent: 90 },
    GOLD: { mode: 'pattern', adxMin: 22, atrMultSL: 2.1, rangeAdxMax: 21, rangeMinATR: 3.2, rangeTpMult: 1.5, rangeMaxRiskATR: 3.2, rangeRsiL: 28, rangeRsiS: 72, minScorePercent: 90 },
    USDJPY: { enabled: false }, USDCHF: { enabled: false },
    BTCUSDT: { mode: 'pattern', adxMin: 20, rsiL: 35, rsiS: 65, minRatio: 0.45, maxDistATR: 2.2, atrMultSL: 2.3, swingLook: 7, rangeAdxMax: 22, rangeMinATR: 3.5, rangeTpMult: 1.4, rangeMaxRiskATR: 3.5, rangeRsiL: 25, rangeRsiS: 75 },
    ETHUSDT: { mode: 'pattern', adxMin: 21, rsiL: 36, rsiS: 64, minRatio: 0.47, maxDistATR: 2.1, atrMultSL: 2.2, swingLook: 8, rangeAdxMax: 22, rangeMinATR: 3.3, rangeTpMult: 1.45, rangeMaxRiskATR: 3.4 },
    RANGE_STRICT: { mode: 'range', rangeAdxMax: 17, rangeMinATR: 3.0, rangeMinTouches: 4, rangeTpMult: 1.8, rangeMaxRiskATR: 2.5, rangeRsiL: 30, rangeRsiS: 70, rangeTouchPct: 0.10 },
    RANGE_RELAXED: { mode: 'range', rangeAdxMax: 22, rangeMinATR: 2.4, rangeMinTouches: 2, rangeTpMult: 1.4, rangeMaxRiskATR: 3.0, rangeRsiL: 35, rangeRsiS: 65, rangeTouchPct: 0.15 }
  };

  function normalizeSymbol(symbol) {
    const key = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (key === 'GOLD') return 'XAUUSD';
    return key;
  }

  function getPreset(symbol) {
    const key = normalizeSymbol(symbol);
    const base = PRESETS[key] || {};
    const session = SESSION_MAP[key] || null;
    return { ...base, ...(session ? { session } : {}) };
  }

  return { PRESETS, SESSION_MAP, normalizeSymbol, getPreset };
}));
