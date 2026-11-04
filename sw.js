const C = "bscreener-v69"; // نسخه کش تغییر کرد تا فایل‌های جدید جایگزین شوند
const F = [
  "./",
  "index.html",
  "engine.js",
  "alerts.js",
  "alerts.html",
  "ghsync.js",
  "btengine.js",
  "backtest.html",
  "symbols.js",
  "chart.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(C).then(c => {
      return Promise.all(
        F.map(u => fetch(new Request(u, { cache: "reload" })).then(r => {
          if (r.ok) return c.put(u, r);
        }).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== C).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  
  // فقط درخواست‌های GET و هم‌مبدا را کش کن
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  
  e.respondWith(
    fetch(e.request, { cache: "no-store" }).then(r => {
      if (r.ok) {
        const cp = r.clone();
        caches.open(C).then(c => c.put(e.request, cp));
      }
      return r;
    }).catch(() => {
      // اگر اینترنت قطع بود، از کش بخوان
      return caches.match(e.request, { ignoreSearch: true });
    })
  );
});
