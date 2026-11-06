// scan.js — اسکریپت اسکن بازار و مدیریت پوزیشن‌های فعال با پشتیبانی از رژیم دوگانه و تریلینگ ATR

const fs = require('fs');
const engine = require('./engine');

// ۱. بارگذاری و اعتبارسنجی لیست نمادها
const symbolsModule = require('./symbols');

// استخراج آرایه نمادها از هر ساختاری که ماژول symbols.js برگردانده باشد
const symbols = Array.isArray(symbolsModule) 
  ? symbolsModule 
  : (symbolsModule && Array.isArray(symbolsModule.symbols)) 
    ? symbolsModule.symbols 
    : [];

if (symbols.length === 0) {
  console.error("[Fatal] No valid symbols array found in symbols.js. Please check its export format.");
}

function scanMarkets() {
  console.log(`[Scan Start] ${new Date().toISOString()} - شروع اسکن بازارها...`);
  
  let newSignals = [];

  // ۲. حالا symbols به طور تضمینی یک آرایه است و for...of بدون خطا اجرا می‌شود
  for (const symObj of symbols) {
    const symbol = symObj.symbol || symObj;
    
    // دریافت کندل‌های M5 و H1 (تابع فرضی دریافت دیتا از پروکرهای متصل)
    const candlesM5 = fetchCandles(symbol, "5m");
    const candlesH1 = fetchCandles(symbol, "1h");

    if (!candlesM5 || candlesM5.length < 50) continue;

    // تشخیص خودکار رژیم بازار با ADX
    const adxVals = engine.adx(candlesM5, 14);
    const currentAdx = adxVals[adxVals.length - 1] || 20;
    const dynamicMode = currentAdx >= 22 ? "pattern" : "range";

    // ارزیابی سیگنال با موتور چندمعیاره
    const evaluation = engine.evaluate(symbol, candlesM5, candlesH1, { mode: dynamicMode });

    if (evaluation.side) {
      newSignals.push({
        symbol,
        side: evaluation.side,
        mode: evaluation.mode,
        entry: evaluation.entry,
        sl: evaluation.sl,
        tp: evaluation.tp,
        tp2: evaluation.tp2,
        trailingAtrStep: evaluation.trailingAtrStep,
        tp1Hit: false,
        pass: evaluation.pass,
        checks: evaluation.checks,
        time: Date.now()
      });
    }
  }

  // فیلتر همبستگی سیگنال‌ها جهت جلوگیری از ریسک تکراری
  const filteredSignals = engine.filterCorrelated(newSignals);

  // ذخیره‌سازی یا به‌روزرسانی در فایل data.json
  saveActiveSignals(filteredSignals);
  console.log(`[Scan End] تعداد سیگنال‌های معتبر ثبت شده: ${filteredSignals.length}`);
}

// تابع پایش پوزیشن‌های باز و اعمال تریلینگ استاپ و Break-Even
function monitorActivePositions() {
  let activeSignals = loadActiveSignals();
  
  // 🛠 اصلاح اصلی: بررسی اینکه آیا دیتا واقعاً یک آرایه است یا خیر
  if (!Array.isArray(activeSignals)) {
    console.warn("[Warning] activeSignals is not an array. Resetting to empty array.");
    activeSignals = [];
  }

  activeSignals = activeSignals.map(signal => {
    // جلوگیری از خطا در صورتی که ساختار سیگنال ناقص باشد
    if (!signal || !signal.symbol) return signal;

    const currentPrice = getCurrentMarketPrice(signal.symbol);
    if (!currentPrice) return signal; // اگر قیمت دریافت نشد، از این سیگنال عبور کن

    const currentAtr = getCurrentAtr(signal.symbol) || (signal.entry * 0.002);

    if (signal.side === "LONG") {
      // برخورد با تارگت اول (TP1): انتقال SL به نقطه ورود (Break-even)
      if (currentPrice >= signal.tp && !signal.tp1Hit) {
        signal.tp1Hit = true;
        signal.sl = signal.entry;
        console.log(`[TP1 Hit] ${signal.symbol}: سیو سود پله اول انجام شد. SL به Break-even منتقل شد.`);
      }

      // در حالت روندی (Pattern)، وقتی TP1 رد شد، تریلینگ استاپ ATR فعال می‌شود
      if (signal.mode === "pattern" && signal.tp1Hit) {
        const suggestedSl = currentPrice - (currentAtr * 1.5);
        if (suggestedSl > signal.sl) {
          signal.sl = suggestedSl; // بالا آوردن حد ضرر پشت قیمت
        }
      }
    } else if (signal.side === "SHORT") {
      if (currentPrice <= signal.tp && !signal.tp1Hit) {
        signal.tp1Hit = true;
        signal.sl = signal.entry;
        console.log(`[TP1 Hit] ${signal.symbol}: سیو سود پله اول انجام شد. SL به Break-even منتقل شد.`);
      }

      if (signal.mode === "pattern" && signal.tp1Hit) {
        const suggestedSl = currentPrice + (currentAtr * 1.5);
        if (suggestedSl < signal.sl) {
          signal.sl = suggestedSl; // پایین آوردن حد ضرر پشت قیمت
        }
      }
    }

    return signal;
  });

  saveActiveSignals(activeSignals);
}

// توابع کمکی ارتباطی (بسته به ساختار پروژه شما پیاده می‌شوند)
function fetchCandles(symbol, timeframe) { /* اتصال به OANDA / OKX */ return []; }
function getCurrentMarketPrice(symbol) { return 0; }
function getCurrentAtr(symbol) { return 0; }

function saveActiveSignals(signals) { 
  // مطمئن می‌شویم که همیشه یک آرایه ذخیره می‌شود
  const dataToSave = Array.isArray(signals) ? signals : [];
  fs.writeFileSync('./data.json', JSON.stringify(dataToSave, null, 2)); 
}

function loadActiveSignals() {
  try {
    const rawData = fs.readFileSync('./data.json', 'utf8');
    const parsed = JSON.parse(rawData);
    
    // 🛠 اصلاح اصلی: پشتیبانی از هر دو ساختار (آرایه مستقیم یا آبجکت دارای کلید rows)
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed && Array.isArray(parsed.rows)) {
      return parsed.rows; // اگر از کد طولانی قبلی شما دیتا مانده باشد
    } else if (parsed && Array.isArray(parsed.active)) {
      return parsed.active;
    }
    
    return []; // اگر هیچکدام نبود، آرایه خالی برگردان
  } catch (e) { 
    return []; // در صورت نبود فایل یا خرابی JSON
  }
}

// زمان‌بندی اجرای اسکنر و مانیتورینگ
setInterval(scanMarkets, 5 * 60 * 1000);       // هر ۵ دقیقه اسکن جدید
setInterval(monitorActivePositions, 30 * 1000); // هر ۳۰ ثانیه پایش پوزیشن‌ها و تریلینگ استاپ
