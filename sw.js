const C = "bscreener-v108"; // ✨ نسخه کش تغییر کرد تا آپدیت اجباری شود
const F = [
  "./",
  "index.html",
  "presets.js",
  "engine.js",
  "alerts.js",
  "alerts.html",
  "ghsync.js",
  "btengine.js",
  "trade-policy.js",
  "backtest.html",
  "symbols.js",
  "chart.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "audio/en/1.mp3",
  "audio/en/10.mp3",
  "audio/en/11.mp3",
  "audio/en/12.mp3",
  "audio/en/13.mp3",
  "audio/en/14.mp3",
  "audio/en/15.mp3",
  "audio/en/16.mp3",
  "audio/en/17.mp3",
  "audio/en/18.mp3",
  "audio/en/19.mp3",
  "audio/en/2.mp3",
  "audio/en/20.mp3",
  "audio/en/21.mp3",
  "audio/en/22.mp3",
  "audio/en/23.mp3",
  "audio/en/24.mp3",
  "audio/en/25.mp3",
  "audio/en/26.mp3",
  "audio/en/27.mp3",
  "audio/en/28.mp3",
  "audio/en/29.mp3",
  "audio/en/3.mp3",
  "audio/en/30.mp3",
  "audio/en/4.mp3",
  "audio/en/5.mp3",
  "audio/en/6.mp3",
  "audio/en/7.mp3",
  "audio/en/8.mp3",
  "audio/en/9.mp3",
  "audio/en/aapl.mp3",
  "audio/en/adausdt.mp3",
  "audio/en/amd.mp3",
  "audio/en/amzn.mp3",
  "audio/en/au200.mp3",
  "audio/en/audcad.mp3",
  "audio/en/audchf.mp3",
  "audio/en/audjpy.mp3",
  "audio/en/audnzd.mp3",
  "audio/en/audusd.mp3",
  "audio/en/avaxusdt.mp3",
  "audio/en/avgo.mp3",
  "audio/en/bnbusdt.mp3",
  "audio/en/brent.mp3",
  "audio/en/btcusdt.mp3",
  "audio/en/cadchf.mp3",
  "audio/en/cadjpy.mp3",
  "audio/en/chfjpy.mp3",
  "audio/en/coin.mp3",
  "audio/en/de30.mp3",
  "audio/en/dogeusdt.mp3",
  "audio/en/dotusdt.mp3",
  "audio/en/ethusdt.mp3",
  "audio/en/eu50.mp3",
  "audio/en/euraud.mp3",
  "audio/en/eurcad.mp3",
  "audio/en/eurchf.mp3",
  "audio/en/eurgbp.mp3",
  "audio/en/eurjpy.mp3",
  "audio/en/eurnzd.mp3",
  "audio/en/eurusd.mp3",
  "audio/en/first.mp3",
  "audio/en/fr40.mp3",
  "audio/en/gbpaud.mp3",
  "audio/en/gbpcad.mp3",
  "audio/en/gbpchf.mp3",
  "audio/en/gbpjpy.mp3",
  "audio/en/gbpnzd.mp3",
  "audio/en/gbpusd.mp3",
  "audio/en/googl.mp3",
  "audio/en/hk33.mp3",
  "audio/en/is.mp3",
  "audio/en/jp225.mp3",
  "audio/en/jpm.mp3",
  "audio/en/linkusdt.mp3",
  "audio/en/long.mp3",
  "audio/en/ltcusdt.mp3",
  "audio/en/meta.mp3",
  "audio/en/msft.mp3",
  "audio/en/nas100.mp3",
  "audio/en/natgas.mp3",
  "audio/en/new.mp3",
  "audio/en/nflx.mp3",
  "audio/en/nvda.mp3",
  "audio/en/nzdcad.mp3",
  "audio/en/nzdchf.mp3",
  "audio/en/nzdjpy.mp3",
  "audio/en/nzdusd.mp3",
  "audio/en/on.mp3",
  "audio/en/pltr.mp3",
  "audio/en/short.mp3",
  "audio/en/signal.mp3",
  "audio/en/signals.mp3",
  "audio/en/solusdt.mp3",
  "audio/en/spx500.mp3",
  "audio/en/suiusdt.mp3",
  "audio/en/tsla.mp3",
  "audio/en/uk100.mp3",
  "audio/en/us2000.mp3",
  "audio/en/us30.mp3",
  "audio/en/usdcad.mp3",
  "audio/en/usdchf.mp3",
  "audio/en/usdjpy.mp3",
  "audio/en/v.mp3",
  "audio/en/wtico.mp3",
  "audio/en/xagusd.mp3",
  "audio/en/xauusd.mp3",
  "audio/en/xcuusd.mp3",
  "audio/en/xrpusdt.mp3",
  "audio/fa/map.json",
  "audio/fa/test.mp3",
  "audio/fa/welcome.mp3"
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

/* =========================================================
   🛠 کدهای اضافه شده برای اعلان‌های پس‌زمینه (Notifications)
   ========================================================= */

// ۱. دریافت پیام از اپلیکیشن برای نمایش اعلان
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body } = event.data;
        
        self.registration.showNotification(title, {
            body: body,
            icon: 'https://raw.githubusercontent.com/massud2020/Balanced-Screener/main/ai-avatar.jpg',
            badge: 'https://raw.githubusercontent.com/massud2020/Balanced-Screener/main/ai-avatar.jpg',
            vibrate: [200, 100, 200],
            tag: 'signal-alert' // با این تگ، اعلان‌های جدید جایگزین قبلی می‌شوند تا صفحه پر نشود
        });
    }
});

// ۲. مدیریت کلیک روی اعلان (وقتی کاربر روی اعلان ضربه می‌زند)
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // بستن اعلان

    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            // اگر اپ باز باشد، به آن فوکوس می‌کنیم
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            // اگر اپ بسته باشد، یک پنجره جدید باز می‌کنیم
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
