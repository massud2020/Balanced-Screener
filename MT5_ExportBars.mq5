//+------------------------------------------------------------------+
//| MT5_ExportBars.mq5 - export M5 bars of one or more symbols to CSV |
//| Output: MQL5/Files/<SYMBOL>_M5.csv (tab separated, MT5 style)     |
//+------------------------------------------------------------------+
#property script_show_inputs
#property strict

input ENUM_TIMEFRAMES ExportTF = PERIOD_M5;   // timeframe (M5 recommended)
input int             MaxBars  = 150000;      // number of most recent bars
input string          Symbols  = "";          // e.g. EURUSD,XAUUSD,BTCUSD (empty = current chart symbol)

void OnStart()
{
   string list[];
   int n = 0;
   if(StringLen(Symbols) == 0)
   {
      ArrayResize(list, 1);
      list[0] = _Symbol;
      n = 1;
   }
   else
      n = StringSplit(Symbols, ',', list);

   for(int s = 0; s < n; s++)
   {
      string sym = list[s];
      StringTrimLeft(sym);
      StringTrimRight(sym);
      if(StringLen(sym) == 0) continue;
      if(!SymbolSelect(sym, true))
      {
         Print("Symbol not found: ", sym);
         continue;
      }

      MqlRates r[];
      ArraySetAsSeries(r, false);
      int got = CopyRates(sym, ExportTF, 0, MaxBars, r);
      if(got <= 0)
      {
         Print("No data for ", sym, " (error ", GetLastError(), "). Open the chart once and scroll back to load history.");
         continue;
      }

      int dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      string fn = sym + "_M5.csv";
      int h = FileOpen(fn, FILE_WRITE | FILE_CSV | FILE_ANSI, '\t');
      if(h == INVALID_HANDLE)
      {
         Print("Cannot open file ", fn, " (error ", GetLastError(), ")");
         continue;
      }

      FileWrite(h, "<DATE>", "<TIME>", "<OPEN>", "<HIGH>", "<LOW>", "<CLOSE>", "<TICKVOL>", "<VOL>", "<SPREAD>");
      for(int i = 0; i < got; i++)
      {
         FileWrite(h,
                   TimeToString(r[i].time, TIME_DATE),
                   TimeToString(r[i].time, TIME_SECONDS),
                   DoubleToString(r[i].open,  dg),
                   DoubleToString(r[i].high,  dg),
                   DoubleToString(r[i].low,   dg),
                   DoubleToString(r[i].close, dg),
                   (string)r[i].tick_volume,
                   (string)r[i].real_volume,
                   (string)r[i].spread);
      }
      FileClose(h);
      PrintFormat("Exported %s: %d bars -> MQL5/Files/%s", sym, got, fn);
   }
}
