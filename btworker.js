// btworker.js — offload backtest به Web Worker
importScripts("engine.js", "btengine.js");

self.onmessage = function (ev) {
  const { id, payload } = ev.data;
  try {
    const { symbol, m5, m15, h1, opts } = payload;
    const trades = Backtest.runBacktestOnSymbol(symbol, m5, m15, h1, opts);
    const stats = Backtest.calculateStats(trades);
    self.postMessage({ id, ok: true, trades, stats });
  } catch (e) {
    self.postMessage({ id, ok: false, err: (e && e.message) || String(e) });
  }
};
