// build-www.js — آماده‌سازی فایل‌های وب برای Capacitor
const fs = require("fs");
const path = require("path");

const SRC = __dirname;
const DST = path.join(__dirname, "www");

const FILES = [
  "index.html",
  "alerts.html",
  "backtest.html",
  "manifest.json",
  "engine.js",
  "alerts.js",
  "btengine.js",
  "btworker.js",
  "chart.js",
  "symbols.js",
  "ghsync.js",
  "icon-192.png",
  "icon-512.png",
  "alerts.json",
  "ntfy-config.json"
];

console.log("📦 آماده‌سازی پوشه www/ ...");

// پاک کردن پوشه قدیمی
if (fs.existsSync(DST)) {
  fs.rmSync(DST, { recursive: true, force: true });
}
fs.mkdirSync(DST, { recursive: true });

// کپی کردن فایل‌ها
let copied = 0;
let missing = [];
for (const f of FILES) {
  const src = path.join(SRC, f);
  const dst = path.join(DST, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    copied++;
    console.log(`  ✅ ${f}`);
  } else {
    missing.push(f);
    console.log(`  ⚠️  ${f} (وجود ندارد)`);
  }
}

console.log(`\n✨ ${copied} فایل کپی شد.`);
if (missing.length) {
  console.log(`⚠️  ${missing.length} فایل پیدا نشد.`);
}
