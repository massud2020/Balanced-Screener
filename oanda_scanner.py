import oandapyV20
import oandapyV20.endpoints.instruments as instruments
import time
import os
import datetime

# خواندن اطلاعات از Secrets گیت‌هاب
OANDA_API_TOKEN = os.environ.get("OANDA_API_TOKEN")
OANDA_ACCOUNT_ID = os.environ.get("OANDA_ACCOUNT_ID")

SYMBOLS = {
    "XAUUSD": "XAU_USD",
    "EURUSD": "EUR_USD",
    "GBPUSD": "GBP_USD",
    "USDJPY": "USD_JPY",
    "BTCUSD": "BTC_USD"
}
client = oandapyV20.API(access_token=OANDA_API_TOKEN, environment="practice")

def get_oanda_candles(instrument, granularity, count=250):
    params = {"granularity": granularity, "count": count, "price": "M"}
    try:
        req = instruments.InstrumentsCandles(instrument=instrument, params=params)
        response = client.request(req)
        data = []
        for c in response["candles"]:
            if c["complete"]:
                data.append({
                    "open": float(c["mid"]["o"]), "high": float(c["mid"]["h"]),
                    "low": float(c["mid"]["l"]), "close": float(c["mid"]["c"])
                })
        return data
    except Exception as e:
        print(f"Error {instrument}: {e}")
        return None

def calculate_ema(data_list, period):
    if len(data_list) < period: return 0
    multiplier = 2.0 / (period + 1)
    sma = sum(d['close'] for d in data_list[:period]) / period
    ema = sma
    for i in range(period, len(data_list)):
        ema = (data_list[i]['close'] - ema) * multiplier + ema
    return ema

def check_strategy(oanda_ticker):
    df_m5 = get_oanda_candles(oanda_ticker, "M5", 250)
    df_m15 = get_oanda_candles(oanda_ticker, "M15", 250)
    df_h1 = get_oanda_candles(oanda_ticker, "H1", 250)
    if not df_m5 or not df_m15 or not df_h1: return None
    
    ema21_m5 = calculate_ema(df_m5, 21); ema50_m5 = calculate_ema(df_m5, 50); ema200_m5 = calculate_ema(df_m5, 200)
    ema21_m15 = calculate_ema(df_m15, 21); ema50_m15 = calculate_ema(df_m15, 50)
    ema200_h1 = calculate_ema(df_h1, 200)
    
    close_m5 = df_m5[-1]['close']; close_h1 = df_h1[-1]['close']
    
    trend_m5_buy = (close_m5 > ema200_m5) and (ema21_m5 > ema50_m5)
    trend_m5_sell = (close_m5 < ema200_m5) and (ema21_m5 < ema50_m5)
    filter_m15_buy = (ema21_m15 > ema50_m15)
    filter_m15_sell = (ema21_m15 < ema50_m15)
    filter_h1_buy = (close_h1 > ema200_h1)
    filter_h1_sell = (close_h1 < ema200_h1)
    
    c = df_m5[-4:]
    green_count = sum(1 for x in c if x['close'] > x['open'])
    red_count = sum(1 for x in c if x['close'] < x['open'])
    green_size = sum((x['close'] - x['open']) for x in c if x['close'] > x['open'])
    red_size = sum((x['open'] - x['close']) for x in c if x['close'] < x['open'])
    
    pattern_buy = False; pattern_sell = False
    if green_count == 1 and red_count == 3 and c[-1]['close'] > c[-1]['open'] and red_size > 0:
        if (green_size / red_size) >= 0.5: pattern_buy = True
    if red_count == 1 and green_count == 3 and c[-1]['close'] < c[-1]['open'] and green_size > 0:
        if (red_size / green_size) >= 0.5: pattern_sell = True
        
    if trend_m5_buy and filter_m15_buy and filter_h1_buy and pattern_buy: return "BUY", float(close_m5)
    if trend_m5_sell and filter_m15_sell and filter_h1_sell and pattern_sell: return "SELL", float(close_m5)
    return None

print("شروع اسکن در گیت‌هاب...")
signal_found = False
for symbol, ticker in SYMBOLS.items():
    result = check_strategy(ticker)
    if result:
        side, entry = result
        timestamp = int(time.time())
        signal_str = f"{symbol},{side},{entry},0,0,{timestamp}"
        
        # ۱. ذخیره آخرین سیگنال برای متاتریدر
        with open("latest_signal.txt", "w") as f:
            f.write(signal_str)
            
        # ۲. ذخیره تاریخچه روزانه برای داشبورد
        today_str = datetime.datetime.now().strftime("%Y-%m-%d")
        time_str = datetime.datetime.now().strftime("%H:%M:%S")
        with open(f"Signals_{today_str}.txt", "a", encoding="utf-8") as f:
            f.write(f"[{time_str}] {symbol} | {side} | Entry: {entry}\n")
            
        print(f"سیگنال پیدا شد: {signal_str}")
        signal_found = True
        break

if not signal_found: 
    print("هیچ سیگنالی پیدا نشد.")
