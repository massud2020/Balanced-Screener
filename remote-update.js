/**
 * remote-update.js v2 — local bundled config first, then optional GitHub refresh
 * Load AFTER presets.js + engine.js
 */
(function (root) {
  'use strict';

  var APP_BUILD = 99;
  var APP_VERSION_NAME = '6.2.0';
  var DEFAULT_RAW_BASE = 'https://raw.githubusercontent.com/massud2020/Balanced-Screener/main';

  var cfg = {
    rawBase: (function () {
      try { return localStorage.getItem('rawBase') || DEFAULT_RAW_BASE; } catch (e) { return DEFAULT_RAW_BASE; }
    })(),
    strategy: null,
    version: null,
    source: 'none',
    lastError: null
  };

  function rawUrl(path) {
    return cfg.rawBase.replace(/\/$/, '') + '/' + String(path).replace(/^\//, '') + '?t=' + Date.now();
  }

  function fetchJson(path, useRaw) {
    var u = useRaw ? rawUrl(path) : (path + (path.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now());
    return fetch(u, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' HTTP ' + r.status);
      return r.json();
    });
  }

  function applyStrategyToOpts(symbol, opts) {
    opts = opts || {};
    var s = cfg.strategy;
    if (!s) return opts;
    var out = {};
    var k;
    for (k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) out[k] = opts[k];
    if (s.defaults && typeof s.defaults === 'object') {
      var prefer = {
        minRatio: 1, minScorePercent: 1, pullbackMaxAtr: 1, pullbackHard: 1,
        rsiL: 1, rsiS: 1, rangeRsiL: 1, rangeRsiS: 1
      };
      for (k in s.defaults) {
        if (!Object.prototype.hasOwnProperty.call(s.defaults, k)) continue;
        if (prefer[k] || out[k] === undefined || out[k] === null) out[k] = s.defaults[k];
      }
    }
    var sym = String(symbol || '').toUpperCase();
    if (s.symbols && s.symbols[sym]) {
      var extra = s.symbols[sym];
      for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
    }
    return out;
  }

  function patchPresets() {
    if (!root.Presets || typeof root.Presets.getPreset !== 'function') return;
    if (root.Presets.__remotePatched) return;
    var orig = root.Presets.getPreset.bind(root.Presets);
    root.Presets.getPreset = function (symbol) {
      return applyStrategyToOpts(symbol, orig(symbol) || {});
    };
    root.Presets.__remotePatched = true;
  }

  function patchEngineEvaluate() {
    if (!root.Engine || typeof root.Engine.evaluate !== 'function') return;
    if (root.Engine.__remotePatched) return;
    var orig = root.Engine.evaluate.bind(root.Engine);
    root.Engine.evaluate = function (symbol, m5, m15, h1, opts, nowSec) {
      return orig(symbol, m5, m15, h1, applyStrategyToOpts(symbol, opts || {}), nowSec);
    };
    root.Engine.__remotePatched = true;
  }

  function ensureCss() {
    if (document.getElementById('remote-update-style')) return;
    var st = document.createElement('style');
    st.id = 'remote-update-style';
    st.textContent = '' +
      '#remote-config-chip{position:fixed;top:10px;left:10px;z-index:99998;max-width:70%;' +
      'padding:6px 10px;border-radius:999px;font:600 11px/1.2 sans-serif;' +
      'background:rgba(15,23,42,.92);color:#e2e8f0;border:1px solid rgba(148,163,184,.35);' +
      'box-shadow:0 4px 16px rgba(0,0,0,.25)}' +
      '#remote-config-chip.ok{border-color:rgba(34,197,94,.55);color:#bbf7d0}' +
      '#remote-config-chip.err{border-color:rgba(239,68,68,.55);color:#fecaca}' +
      '#remote-update-banner{position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;' +
      'background:linear-gradient(135deg,#0f766e,#115e59);color:#ecfefb;padding:12px 14px;' +
      'border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.35);font-family:sans-serif;' +
      'display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}' +
      '#remote-update-banner a,#remote-update-banner button{border:0;border-radius:10px;padding:8px 12px;' +
      'font-weight:700;cursor:pointer;text-decoration:none}' +
      '#remote-update-banner a{background:#ccffee;color:#064e3b}' +
      '#remote-update-banner button{background:rgba(255,255,255,.15);color:#fff}';
    document.head.appendChild(st);
  }

  function setChip(ok, text) {
    ensureCss();
    var el = document.getElementById('remote-config-chip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'remote-config-chip';
      document.body.appendChild(el);
    }
    el.className = ok ? 'ok' : 'err';
    el.textContent = text;
  }

  function showUpdateBanner(remote) {
    if (document.getElementById('remote-update-banner')) return;
    ensureCss();
    var skip = '';
    try { skip = localStorage.getItem('skipUpdateBuild') || ''; } catch (e) {}
    if (String(skip) === String(remote.build)) return;
    if (!(Number(remote.build) > Number(APP_BUILD))) return;

    var el = document.createElement('div');
    el.id = 'remote-update-banner';
    var href = remote.apkUrl || 'https://github.com/massud2020/Balanced-Screener/releases';
    if (String(href).indexOf('raw.githubusercontent.com') >= 0) {
      href = 'https://github.com/massud2020/Balanced-Screener/releases';
    }
    el.innerHTML = '<div><b>نسخه جدید ' + (remote.apkVersionName || remote.build) + '</b><br>' +
      '<span style="opacity:.9;font-size:12px">' + (remote.note || '') + '</span></div>' +
      '<div style="display:flex;gap:8px">' +
      '<a href="' + href + '" target="_blank" rel="noopener">دانلود</a>' +
      '<button type="button" id="remote-update-dismiss">بعداً</button></div>';
    document.body.appendChild(el);
    document.getElementById('remote-update-dismiss').onclick = function () {
      try { localStorage.setItem('skipUpdateBuild', String(remote.build)); } catch (e) {}
      el.remove();
    };
  }

  function useStrategy(j, source) {
    cfg.strategy = j;
    cfg.source = source;
    try { localStorage.setItem('strategyConfigCache', JSON.stringify(j)); } catch (e) {}
    patchPresets();
    patchEngineEvaluate();
    var mr = (j.defaults && j.defaults.minRatio != null) ? j.defaults.minRatio : '?';
    var sc = (j.defaults && j.defaults.minScorePercent != null) ? j.defaults.minScorePercent : '?';
    setChip(true, 'Config ' + source + ' · R' + mr + ' · score' + sc);
  }

  function init() {
    patchPresets();
    patchEngineEvaluate();

    // 1) local bundled files inside APK/www (most reliable)
    return fetchJson('strategy-config.json', false).then(function (j) {
      useStrategy(j, 'local');
      return j;
    }).catch(function () {
      // 2) cache
      try {
        var c = localStorage.getItem('strategyConfigCache');
        if (c) { useStrategy(JSON.parse(c), 'cache'); return; }
      } catch (e) {}
      // 3) GitHub raw
      return fetchJson('strategy-config.json', true).then(function (j) {
        useStrategy(j, 'github');
      }).catch(function (e) {
        cfg.lastError = String(e && e.message ? e.message : e);
        setChip(false, 'Config fail');
      });
    }).then(function () {
      // version: local then github
      return fetchJson('version.json', false).then(function (j) {
        cfg.version = j;
        showUpdateBanner(j);
      }).catch(function () {
        return fetchJson('version.json', true).then(function (j) {
          cfg.version = j;
          showUpdateBanner(j);
        }).catch(function () {});
      });
    }).then(function () {
      // optional soft refresh from GitHub without blocking UI
      fetchJson('strategy-config.json', true).then(function (j) {
        useStrategy(j, 'github');
      }).catch(function () {});
    });
  }

  root.RemoteUpdate = {
    APP_BUILD: APP_BUILD,
    APP_VERSION_NAME: APP_VERSION_NAME,
    getConfig: function () { return cfg; },
    applyStrategyToOpts: applyStrategyToOpts,
    refresh: init
  };

  function boot() { try { init(); } catch (e) { setChip(false, 'Config error'); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof self !== 'undefined' ? self : window);
