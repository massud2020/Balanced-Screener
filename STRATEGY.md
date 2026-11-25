# منطق یکپارچه استراتژی — v5 (اپ = سرور)

هدف: یک منبع حقیقت برای Trend و Range در `engine.js` + `trade-policy.js` + `scan.js` + `strategy-config.json`.

---

## ۱) انتخاب حالت

| شرط | حالت |
|-----|------|
| ADX نسبتاً قوی + الگوی ۳+۱ | **Trend (pattern)** |
| ADX پایین (≤ rangeAdxMax پیش‌فرض ۱۸) + باند مناسب | **Range** |

---

## ۲) Trend (pattern) — ورود

### گیت‌های سخت (بدون آن‌ها سیگنال نیست)
1. چینش EMA21/50/200
2. الگوی ۳+۱ با `minRatio ≥ 0.5`
3. سمت درست نسبت به EMA200
4. **همسویی H1** (الزامی)
5. **ساختار بازار** (الزامی)
6. امتیاز ≥ **۸۵٪**

### فیلترهای مهم (امتیاز / نرم)
- RSI پولبک **۴۲–۵۸**
- محدوده پولبک فقط **EMA21** تا **۱.۸ ATR**
- M15 هم‌جهت (امتیازی مگر در تنظیمات سخت شود)
- فاصله از EMA200 (ضدکشیدگی)

---

## ۳) Trend — خروج (بدون TP ثابت)

| مرحله | رفتار |
|-------|--------|
| قبل از +۱R | فقط SL اولیه |
| بعد از +۱R | SL → BE، سپس تریل **۱.۲ ATR** |
| هر زمان | خروج با **واگرایی RSI** در صورت فعال شدن |
| TIME | سقف زمانی / محدودیت باخت |

**هیچ حد سود ثابت ۱.۸R برای Trend وجود ندارد.**

---

## ۴) Range — ورود

### گیت‌ها
- ADX ≤ **۱۸** (پیش‌فرض)
- عدم مخالفت H1
- عرض باند / لمس باند
- امتیاز ≥ **۸۸٪**

### خروج
- TP ثابت از `rangeTpMult` (کف نرم `rangeMinRR` پیش‌فرض ۱.۲)
- SL / سقف ریسک `rangeMaxRiskATR`

---

## ۵) پارامترهای پیش‌فرض (`strategy-config.json`)

```json
minRatio: 0.5
minScorePercent: 85
rangeMinScorePercent: 88
rangeAdxMax: 18
pullbackMaxAtr: 1.8
rsiL/rsiS: 42/58
trailingAtrMult: 1.2
trailAfterR: 1.0
```

اپ دارای `remote-update.js` این مقادیر را روی `Presets`/`Engine.evaluate` ادغام می‌کند.

---

## ۶) هم‌ترازی اپ و سرور

| لایه | فایل |
|------|------|
| ورود/فیلتر | `engine.js` |
| خروج | `trade-policy.js` |
| اسکنر Actions | `scan.js` (دیگر trialing 0.5 را اجبار نمی‌کند) |
| تنظیمات زنده | `strategy-config.json` |
| بیلد APK | `build-www.js` باید engine/trade-policy/remote-update را کپی کند |

بعد از push این بسته:
1. اسکن بعدی Actions = منطق سرور جدید
2. Build Android APK = اپ هم‌راستا

---

## ۷) چیزهایی که عمداً یکی نیستند

- UI فارسی/نام اپ ممکن است هنوز «Balanced Screener» باشد
- history قدیمی با قوانین قدیم ساخته شده؛ معیار WR جدید نیست
