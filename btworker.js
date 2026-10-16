// btworker.js — offload backtest به Web Worker
importScripts("engine.js", "btengine.js");

self.onmessage = function (ev) {
  const { id, payload } = ev.data;
  try {
    const { m5, S, mode, sym, O, lo, hi } = payload;
    const P = btPrep(m5, S);
    const trades = btTrades(P, mode, sym, O, lo, hi, { blocked: { open: 0, close: 0, hours: 0, weekend: 0 } });
    self.postMessage({ id, ok: true, trades });
  } catch (e) {
    self.postMessage({ id, ok: false, err: (e && e.message) || String(e) });
  }
};