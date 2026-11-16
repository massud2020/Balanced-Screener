# Balanced Screener — Build 95 / Engine 56 Repair Notes

## Version and scope

The supplied archive was verified as Build 94 / Engine 55. The repaired working copy is versioned as Build 95 / Engine 56 so it cannot be confused with the untouched source archive. Historical CSVs were not modified.

## Core code changes

- `presets.js`: one browser/Node preset source; symbol aliases, UTC sessions, disabled USDJPY/USDCHF, and documented meanings for Trend/Range parameters.
- `engine.js`: applies per-symbol presets; supports signal timeframe duration; uses the signal candle only after close; removes Price Action as a Trend gate; wires `minRatio`, `maxDistATR` (distance from EMA21 in ATR), `swingLook`, Range ADX/band-width/touch/SL-cap/RSI/TP parameters and score thresholds; exports correlation filtering and session helpers.
- `trade-policy.js`: shared no-partial-exit policy; Wilder ATR trailing at 0.5 ATR; causal RSI-divergence confirmation; conservative SL-before-TP intrabar ordering; gap-aware stop/target fills; Range TP uses configured R.
- `btengine.js`: H1/M5 timeframe-aware decision timestamp; signal at closed candle and fill at next candle Open; historical context supplied for ATR/RSI divergence; `opts` passed to shared exit policy; corrected GOLD pip-size inference; portfolio overlap/correlation filter.
- `scan.js`: consumes presets, applies symbol sessions and ADX, stores the shared exit-policy settings for active positions, and uses the new trailing/RSI-divergence description.
- `index.html`, `backtest.html`, `btworker.js`, `build-www.js`, `sw.js`: browser/worker/build/cache integration for `presets.js`; backtest controls for Range SL/TP and Trend trailing; Trend no longer displays an active TP target.
- Added `data-utils.js`, `data-quality.js`, `range-optimization.js`, `trend-validation.js`; rewrote `portfolio_backtest.js`; legacy Range optimizer entry points now call the canonical optimizer.

## Validation

- JavaScript syntax check: all project `.js` files passed.
- Correlation protection checks overlapping group memberships, not only the first group ID returned for a symbol.
- Compatibility test runner: 50 existing/new test cases passed. The actual Jest binary could not be installed in this environment because `npm ci` timed out; therefore this is not reported as an official Jest run.
- `node build-www.js`: completed; `www/presets.js` and the updated worker/app files were copied successfully.
- Core smoke assertions: passed for RSI flat=50, ADX bounds, preset/session behavior, ATR trailing, dynamic Range TP, next-bar execution, and portfolio overlap/correlation constraints.

## Historical data quality

- The six H1 datasets used for Range optimization contained no invalid OHLC rows or duplicate timestamps after parsing.
- BTC/ETH M5 datasets each contain 210,000 valid rows, but the source ordering is mostly descending/chunked (209,790 backward transitions). The loader sorts them chronologically before analysis; the source CSVs remain untouched.
- H1 gap counts include expected weekend/market-session closures; they are not automatically classified as missing trading candles.

## Range optimization result

Chronological split: 70% in-sample / 30% out-of-sample, split at 2026-01-13T17:32:27.700Z. Tested SL = 2.0, 2.5, 3.0 ATR and TP = 1.0, 1.2, 1.5, 2.0 R across EURUSD, GBPUSD, GOLD, AUDUSD, NZDUSD and USDCAD. No candidate met the selection rule (at least 30 IS trades and IS PF > 1).

| SL ATR | TP R | IS Net R | IS PF | OOS Net R | OOS PF |
|---:|---:|---:|---:|---:|---:|
| 2.0 | 1.0 | -90.59 | 0.90 | -64.22 | 0.84 |
| 2.0 | 1.2 | -80.11 | 0.91 | -46.35 | 0.89 |
| 2.0 | 1.5 | -79.99 | 0.92 | -38.80 | 0.91 |
| 2.0 | 2.0 | -98.06 | 0.90 | -22.99 | 0.94 |
| 2.5 | 1.0 | -75.30 | 0.90 | -52.74 | 0.84 |
| 2.5 | 1.2 | -75.01 | 0.90 | -50.59 | 0.85 |
| 2.5 | 1.5 | -69.71 | 0.91 | -36.86 | 0.89 |
| 2.5 | 2.0 | -71.82 | 0.90 | -2.79 | 0.99 |
| 3.0 | 1.0 | -88.79 | 0.87 | -50.80 | 0.83 |
| 3.0 | 1.2 | -61.73 | 0.91 | -32.05 | 0.89 |
| 3.0 | 1.5 | -57.34 | 0.92 | -18.20 | 0.94 |
| 3.0 | 2.0 | -80.87 | 0.88 | -29.93 | 0.90 |

**Conclusion:** no SL/TP pair is accepted as an optimized Range setting. The portfolio report therefore uses SL 2.5 ATR / TP 1.0 R only as an explicitly exploratory fallback, not as a selected or production-ready configuration.

Costs in the Range study are provisional price-unit assumptions inherited from project scripts (1 pip for FX and 0.30 for GOLD), not verified broker quotes.

## Trend validation on the four reported symbols

Controlled H1 validation used ADX >= 25, score >= 90, SL 2.5 ATR, full-position trailing 0.5 ATR, RSI divergence, no PA, no MTF hard gates, 50% 3+1 body ratio, no overlapping trades, and next-bar Open execution. Preset max-distance and swing-look overrides were disabled for this comparison.

| Symbol | Full trades | Full Net R | PF | OOS trades | OOS Net R | OOS PF |
|---|---:|---:|---:|---:|---:|---:|
| EURUSD | 21 | -3.17 | 0.40 | 5 | -1.66 | 0.05 |
| GBPUSD | 36 | +3.03 | 1.52 | 12 | +1.45 | 1.78 |
| GOLD | 18 | -2.36 | 0.46 | 8 | +0.52 | 2.15 |
| EURJPY | 21 | +0.34 | 1.12 | 7 | +0.02 | 1.02 |
| **Aggregate** | **96** | **-2.15** | **0.88** | **32** | **+0.32** | **1.06** |

The OOS sample is small and does not establish a reliable edge. These results do not reproduce the previously reported Trend R figures.

## Combined portfolio validation (exploratory Range fallback)

Seven symbols, Trend + Range, max 3 concurrent positions, max 1 per correlation group, no overlapping same-symbol positions, fixed risk cash equivalent to 0.5% of initial equity per trade. Range was run at the fallback 2.5 ATR / 1.0 R because no optimized pair qualified.

- Full period: 1,748 selected trades; win rate 46.3%; Net -104.99 R; PF 0.87; Max DD 116.39 R; ending equity 4,750.61 from 10,000; max equity drawdown 55.62%.
- OOS: 518 trades; win rate 44.8%; Net -45.33 R; PF 0.82; Max DD 47.47 R; ending equity 7,733.31 from 10,000; max equity drawdown 23.74%.
- Selected Trend contribution: -21.85 R full / -9.01 R OOS.
- Selected Range contribution: -83.13 R full / -36.33 R OOS.

These are research backtests, not a live-performance guarantee. The cost assumptions and historical data source need broker-level confirmation before any deployment.

## Important explanation for prior result discrepancies

The original `test_long_term.js` and `test_all_forex.js` iterate each bar without advancing past a still-open trade, so multiple overlapping positions can be counted. They also pass the H1 candle's OPEN timestamp as `nowSec` while `Engine.dropForming` is configured for 300 seconds, which drops the latest H1 candle and shifts the signal/entry alignment. In addition, the previous trailing formula was `risk * 0.5`; with a 2.5 ATR initial stop this is 1.25 ATR, not the reported 0.5 ATR. These are concrete source inconsistencies and are plausible contributors to the earlier higher results; they do not, by themselves, prove exactly how much each issue inflated the prior figures.

## Commands

- `npm run data:check`
- `npm run optimize:range`
- `npm run validate:trend`
- `npm run backtest:portfolio`
- `npm run build:www`
- `npm test` (requires installing Jest dependencies first)
