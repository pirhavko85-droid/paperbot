const fs=require('node:fs'),assert=require('node:assert/strict');
const {simulate,metrics}=require('./robustness.cjs'),base=require('../paper-config.json');
const snapshot=require('../data/latest.json'),div=require('../data/dividends.json');
snapshot.indexCloses=require('./results/mcftr-2026-11-06.json').closes;
const summarize=p=>({start:p.start,curve:p.equity,events:p.ledger.filter(e=>['RISK_EXIT','REENTRY_SIGNAL','BUY','SELL'].includes(e.type)),dd:metrics(p).maxDrawdownPct});
const rows=['2026-05-01','2026-09-01'].flatMap(from=>{
 const dates=[...new Set(base.tickers.flatMap(t=>snapshot.series[t].map(c=>c.date)))].filter(d=>d>=from&&d<='2026-11-06').sort();
 const [control,variant]=['balanced','reentry'].map(model=>simulate(snapshot,div,{...base,model},dates,summarize));
 assert.ok(control.complete&&variant.complete);
 return variant.portfolios.map((p,i)=>{
  const b=control.portfolios[i],end=p.curve.at(-1),exits=p.events.filter(e=>e.type==='RISK_EXIT');
  if(!exits.length)assert.deepEqual(p,b);
  const episodes=exits.map((e,j)=>{
   const until=exits[j+1]?.date??end.date;
   const buy=p.events.find(t=>t.type==='BUY'&&t.date>e.date&&t.date<=until);
   const sell=p.events.find(t=>t.type==='SELL'&&t.date>e.date);
   const mark=(book,date)=>book.curve.find(v=>v.date===date).value;
   return {exit:e.date,firstSale:sell?.date,signal:p.events.find(t=>t.type==='REENTRY_SIGNAL'&&t.date>e.date&&t.date<=until)?.date,buy:buy?.date,until,flatSessions:sell?p.curve.filter(v=>v.date>=sell.date&&(buy?v.date<buy.date:v.date<=until)).length:0,worstRelativeRub:buy?Math.round(100*Math.min(0,...p.curve.filter(v=>v.date>=buy.date&&v.date<=until).map(v=>v.value-mark(b,v.date)-mark(p,e.date)+mark(b,e.date))))/100:null,incrementRub:buy?+(mark(p,until)-mark(p,e.date)-mark(b,until)+mark(b,e.date)).toFixed(2):0};
  });
  return {from,start:p.start,controlRub:b.curve.at(-1).value,reentryRub:end.value,controlDD:b.dd,reentryDD:p.dd,episodes};
 });
});
fs.writeFileSync('research/results/reentry-2026-11-07.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.filter(r=>r.start===50000)));
