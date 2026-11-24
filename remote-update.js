/**
 * remote-update.js — remote strategy-config + version check banner
 * Load AFTER presets.js and engine.js
 */
(function (root) {
  'use strict';

  // Build number baked into this APK / www bundle. Bump when shipping a new APK.
  var APP_BUILD = 97;
  var APP_VERSION_NAME = '6.1.1';

  var DEFAULT_RAW_BASE = 'https://raw.githubusercontent.com/massud2020/Balanced-Screener/main';
  var cfg = {
    rawBase: (root.localStorage && localStorage.getItem('rawBase')) || DEFAULT_RAW_BASE,
    strategy: null,
    version: null,
    lastError: null
  };

  function url(path) {
    return cfg.rawBase.replace(/\/$/, '') + '/' + path.replace(/^\//, '') + '?t=' + Date.now();
  }

  function fetchJson(path) {
    return fetch(url(path), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' HTTP ' + r.status);
      return r.json();
    });
  }

  /** Merge remote defaults + per-symbol over local preset object */
  function applyStrategyToOpts(symbol, opts) {
    opts = opts || {};
    var s = cfg.strategy;
    if (!s) return opts;
    var out = Object.assign({}, opts);
    if (s.defaults && typeof s.defaults === 'object') {
      Object.keys(s.defaults).forEach(function (k) {
        if (out[k] === undefined || out[k] === null) out[k] = s.defaults[k];
        // Always prefer remote for these keys so GitHub controls filters without APK rebuild
        if (['minRatio', 'minScorePercent', 'pullbackMaxAtr', 'pullbackHard', 'rsiL', 'rsiS', 'rangeRsiL', 'rangeRsiS'].indexOf(k) >= 0) {
          out[k] = s.defaults[k];
        }
      });
    }
    var sym = (symbol || '').toUpperCase();
    if (s.symbols && s.symbols[sym]) {
      Object.assign(out, s.symbols[sym]);
    }
    return out;
  }

  function patchPresets() {
    if (!root.Presets || typeof root.Presets.getPreset !== 'function') return;
    if (root.Presets.__remotePatched) return;
    var orig = root.Presets.getPreset.bind(root.Presets);
    root.Presets.getPreset = function (symbol) {
      var base = orig(symbol) || {};
      return applyStrategyToOpts(symbol, base);
    };
    root.Presets.__remotePatched = true;
  }

  function patchEngineEvaluate() {
    if (!root.Engine || typeof root.Engine.evaluate !== 'function') return;
    if (root.Engine.__remotePatched) return;
    var orig = root.Engine.evaluate.bind(root.Engine);
    root.Engine.evaluate = function (symbol, m5, m15, h1, opts, nowSec) {
      var merged = applyStrategyToOpts(symbol, opts || {});
      return orig(symbol, m5, m15, h1, merged, nowSec);
    };
    root.Engine.__remotePatched = true;
  }

  function ensureBannerCss() {
    if (document.getElementById('remote-update-style')) return;
    var st = document.createElement('style');
    st.id = 'remote-update-style';
    st.textContent = [
      '#remote-update-banner{position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;',
      'background:linear-gradient(135deg,#0f766e,#115e59);color:#ecfefb;padding:12px 14px;',
      'border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.35);font-family:sans-serif;',
      'display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}',
      '#remote-update-banner b{color:#fff}',
      '#remote-update-banner a,#remote-update-banner button{border:0;border-radius:10px;padding:8px 12px;',
      'font-weight:700;cursor:pointer;text-decoration:none}',
      '#remote-update-banner a{background:#ccffee;color:#064e3b}',
      '#remote-update-banner button{background:rgba(255,255,255,.15);color:#fff}',
      '#remote-config-dot{position:fixed;top:8px;right:8px;z-index:99998;width:8px;height:8px;',
      'border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.25)}',
      '#remote-config-dot.err{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.25)}'
    ].join('');
    document.head.appendChild(st);
  }

  function showUpdateBanner(remote) {
    if (document.getElementById('remote-update-banner')) return;
    ensureBannerCss();
    var el = document.createElement('div');
    el.id = 'remote-update-banner';
    var note = (remote && remote.note) ? remote.note : '';
    var ver = (remote && (remote.apkVersionName || remote.build)) || '';
    var href = (remote && remote.apkUrl) || (cfg.rawBase + '/../../releases');
    // fix releases link for github raw base
    if (href.indexOf('raw.githubusercontent.com') >= 0) {
      href = 'https://github.com/massud2020/Balanced-Screener/releases';
    }
    el.innerHTML = '<div><b>نسخه جدید ' + ver + '</b><br><span style="opacity:.9;font-size:12px">' +
      (note || 'برای دریافت موتور/UI جدید APK را به‌روز کنید') +
      '</span><br><span style="opacity:.75;font-size:11px">نسخه فعلی: ' + APP_VERSION_NAME +
      ' (build ' + APP_BUILD + ')</span></div>' +
      '<div style="display:flex;gap:8px">' +
      '<a id="remote-update-open" href="' + href + '" target="_blank" rel="noopener">دانلود</a>' +
      '<button type="button" id="remote-update-dismiss">بعداً</button></div>';
    document.body.appendChild(el);
    document.getElementById('remote-update-dismiss').onclick = function () {
      try { localStorage.setItem('skipUpdateBuild', String(remote.build || '')); } catch (e) {}
      el.remove();
    };
  }

  function showConfigDot(ok) {
    ensureBannerCss();
    var d = document.getElementById('remote-config-dot');
    if (!d) {
      d = document.createElement('div');
      d.id = 'remote-config-dot';
      d.title = 'Remote strategy config';
      document.body.appendChild(d);
    }
    d.className = ok ? '' : 'err';
  }

  function checkVersion(remote) {
    if (!remote || remote.build == null) return;
    var skip = '';
    try { skip = localStorage.getItem('skipUpdateBuild') || ''; } catch (e) {}
    if (String(skip) === String(remote.build)) return;
    if (Number(remote.build) > Number(APP_BUILD)) {
      showUpdateBanner(remote);
    }
  }

  function init() {
    patchPresets();
    patchEngineEvaluate();
    return Promise.all([
      fetchJson('strategy-config.json').then(function (j) {
        cfg.strategy = j;
        try { localStorage.setItem('strategyConfigCache', JSON.stringify(j)); } catch (e) {}
        patchPresets();
        patchEngineEvaluate();
        showConfigDot(true);
        return j;
      }).catch(function (e) {
        cfg.lastError = String(e);
        // fallback cache
        try {
          var c = localStorage.getItem('strategyConfigCache');
          if (c) { cfg.strategy = JSON.parse(c); patchPresets(); patchEngineEvaluate(); }
        } catch (err) {}
        showConfigDot(false);
      }),
      fetchJson('version.json').then(function (j) {
        cfg.version = j;
        checkVersion(j);
        return j;
      }).catch(function () { /* optional */ })
    ]);
  }

  // public API
  root.RemoteUpdate = {
    APP_BUILD: APP_BUILD,
    getConfig: function () { return cfg; },
    applyStrategyToOpts: applyStrategyToOpts,
    refresh: init
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }
})(typeof self !== 'undefined' ? self : window);
