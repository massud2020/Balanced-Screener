// Controlled Trend-only validation using the reported H1 settings and corrected execution mechanics.
const fs = require('fs');
const Engine = require('./engine.js');
const TradePolicy = require('./trade-policy.js');
const { getPreset } = require('./presets.js');
const { loadCsv, inspectFile } = require('./data-utils.js');
const SYMBOLS = ['EURUSD', 'GBPUSD', 'GOLD', 'EURJPY'];
const INTERVAL = 3600;
const COST_PRICE = { EURUSD: 0.0001, GBPUSD: 0.0001, GOLD: 0.30, EURJPY: 0.01 };
function stats(trades) {
  let wins=0, grossWin=0, grossLoss=0, netR=0, peak=0, eq=0, maxDD=0;
  const ordered=[...trades].sort((a,b)=>a.closeTime-b.closeTime);
  for(const t of ordered){const r=t.R;netR+=r;eq+=r;if(r>0){wins++;grossWin+=r;}else if(r<0)grossLoss+=-r;peak=Math.max(peak,eq);maxDD=Math.max(maxDD,peak-eq);}
  return {trades:ordered.length,winRate:ordered.length?+(wins/ordered.length*100).toFixed(1):0,netR:+netR.toFixed(2),PF:grossLoss?+(grossWin/grossLoss).toFixed(2):(grossWin?'Infinity':0),maxDD:+maxDD.toFixed(2)};
}
function run(symbol,bars){
  const preset=getPreset(symbol), trades=[];let nextAllowed=0;
  const opts={...preset,mode:'pattern',signalIntervalSec:INTERVAL,sessionFilter:!!preset.session,h1:false,m15:false,adx:true,adxMin:25,trend:true,emax:true,nc:true,pa:false,minScorePercent:90,maxDistATR:0,minRatio:0.5,swingLook:50,slAtr:2.5};
  for(let i=199;i<bars.length-1;i++){
    const decision=bars[i].time+INTERVAL;if(decision<=nextAllowed)continue;
    const w=Math.max(0,i-799);const result=Engine.evaluate(symbol,bars.slice(w,i+1),[],[],opts,decision);if(!result.side)continue;
    const openTime=bars[i+1].time,entry=bars[i+1].open,risk=Math.abs(result.entry-result.sl);if(!(risk>0))continue;
    const dir=result.side==='LONG'?1:-1,sl=entry-dir*risk;
    const ctx=bars.slice(Math.max(0,i-100),i+501);
    const state=TradePolicy.resolveTrade({side:result.side,entry,sl,mode:'pattern',bars:ctx,startTime:openTime,maxHoldSec:7*24*3600,opts:{trailingAtrMult:0.5}});
    if(state.status!=='closed')break;
    const costR=(COST_PRICE[symbol]||0)/risk;
    trades.push({symbol,side:result.side,openTime,closeTime:state.closeTime,why:state.why,grossR:state.R,costR,R:+(state.R-costR).toFixed(4)});
    nextAllowed=state.closeTime+INTERVAL;
  }
  return trades;
}
function main(){
  const all={},quality={};let start=Infinity,end=-Infinity;
  for(const s of SYMBOLS){const b=loadCsv(`${s}_H1_LONG.csv`);all[s]=run(s,b);quality[s]=inspectFile(`${s}_H1_LONG.csv`,INTERVAL);start=Math.min(start,b[0].time);end=Math.max(end,b.at(-1).time);}
  const split=start+(end-start)*.7;const report={generatedAt:new Date().toISOString(),settings:{timeframe:'H1',adxMin:25,score:90,SL_ATR:2.5,trailingATR:0.5,PA:false,MTF:false,maxDistATR:0,minRatio:0.5,swingLook:50,overlap:false},splitTime:new Date(split*1000).toISOString(),costAssumptionsPriceUnits:COST_PRICE,bySymbol:Object.fromEntries(Object.entries(all).map(([s,t])=>[s,{full:stats(t),oos:stats(t.filter(x=>x.openTime>=split))}])),dataQuality:quality};
  report.aggregateFull=stats(Object.values(all).flat());report.aggregateOOS=stats(Object.values(all).flat().filter(t=>t.openTime>=split));fs.writeFileSync('trend-validation-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
if(require.main===module)main();
