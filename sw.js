const C = "bscreener-v102"; // ✨ نسخه کش تغییر کرد تا آپدیت اجباری شود
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
