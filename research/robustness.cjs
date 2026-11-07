'use strict';
// Research only. Never writes paper-state, configuration or pending orders.
const fs=require('node:fs'),crypto=require('node:crypto');
const {advance}=require('../paper-engine.cjs');
const {createStrategy,sectors}=require('../strategy-v2.cjs');
const {addDays}=require('../dividends-core.js');
const base=require('../paper-config.json');
function metrics(p){
 const eq=p.equity, trades=p.ledger.filter(e=>e.type==='BUY'||e.type==='SELL');
 let longest=0,current=0;
 for(const e of eq){current=e.drawdown<-.000001?current+1:0;longest=Math.max(longest,current)}
 const daily=eq.map((e,i)=>e.value/(i?eq[i-1].value:p.start)-1).sort((a,b)=>a-b);
 const n=Math.max(1,Math.ceil(daily.length*.05));
 return {start:p.start,sessions:eq.length,returnPct:100*((eq.at(-1)?.value??p.start)/p.start-1),maxDrawdownPct:100*Math.min(0,...eq.map(e=>e.drawdown)),worstDayPct:100*(daily[0]??0),tailMeanPct:100*daily.slice(0,n).reduce((a,b)=>a+b,0)/n,longestUnderwaterSessions:longest,averageCashPct:eq.length?eq.reduce((a,e)=>a+e.cash/e.value,0)/eq.length*100:null,trades:trades.length,turnover:trades.reduce((a,e)=>a+e.qty*e.price,0)/p.start,fees:trades.reduce((a,e)=>a+e.fee,0),dividendRights:p.ledger.filter(e=>e.type==='DIVIDEND_ENTITLEMENT').reduce((a,e)=>a+e.gross,0),riskOff:!!p.riskOff,positions:Object.entries(p.positions).filter(([,q])=>q>0).map(([ticker,qty])=>({ticker,qty})),skips:p.ledger.filter(e=>e.type==='SKIP').reduce((a,e)=>(a[e.code??'OTHER']=(a[e.code??'OTHER']||0)+1,a),{}),curve:eq};
}
function simulate(snapshot,dividends,config,dates,summarize=metrics){
 let state=null,failure=null;
 for(const date of dates){
  const now=new Date(addDays(date,1)+'T01:00:00Z');
  const series=Object.fromEntries(config.tickers.map(t=>[t,(snapshot.series[t]||[]).filter(c=>c.date<=date)]));
  const snap={...snapshot,series},div={...dividends,generatedAt:now.toISOString()};
  state=advance(state,snap,div,config,now,'run',createStrategy(snap,div,config,now));
  if(state.health.status!=='ok'){failure={date,...state.health};break}
 }
 return {from:dates[0],requestedTo:dates.at(-1),to:state?.lastSession,complete:!failure&&!!dates.length,failure,portfolios:state?state.portfolios.map(summarize):[]};
}
function run(){
 const snapshot=JSON.parse(fs.readFileSync('data/latest.json')),dividends=JSON.parse(fs.readFileSync('data/dividends.json'));
 const moscowDate=new Date(Date.parse(snapshot.generatedAt)+3*3600000).toISOString().slice(0,10);
 const dates=[...new Set(base.tickers.flatMap(t=>snapshot.series[t].map(c=>c.date)))].filter(d=>d<moscowDate).sort();
 const windows=Array.from({length:7},(_,i)=>{const from=`2026-${String(i+3).padStart(2,'0')}-01`;return {id:from,dates:dates.filter(d=>d>=from).slice(0,63)}});
 windows.push({id:'continuous-2026',dates:dates.filter(d=>d>='2026-02-07')});
 if(windows.slice(0,-1).some(w=>w.dates.length!==63))throw Error('Для сравнения нужны полные окна по 63 сессии');
 const results=[];
 for(const w of windows)for(const model of ['balanced','hold','sma','trend','dip'])for(const cost of [1,2]){
  const config={...base,model,maxPositions:['hold','balanced'].includes(model)?18:8,maxDrawdown:model==='hold'?1:.10,commission:base.commission*cost,slippage:base.slippage*cost};
  const r={window:w.id,model,cost,...simulate(snapshot,dividends,config,w.dates)};results.push(r);
  console.log(w.id,model,cost,r.complete?'OK':'BLOCKED',r.portfolios.map(p=>p.returnPct.toFixed(2)).join('/'));
 }
 const sensitivity=[];
 for(const cashReserve of [.2,.3,.4])for(const maxDrawdown of [.08,.10,.15]){
  const config={...base,cashReserve,maxDrawdown};
  sensitivity.push({cashReserve,maxDrawdown,...simulate(snapshot,dividends,config,dates.filter(d=>d>='2026-05-01'))});
 }
 const crisis=[];
 // Diagnostic legacy cohort, never pretend today's full universe existed then.
 for(const [from,to] of [['2020-01-01','2020-06-30'],['2022-01-01','2022-06-30'],['2022-08-01','2022-12-30'],['2024-01-01','2024-12-30']]){
  const tickers=base.tickers.filter(t=>snapshot.series[t].filter(c=>c.date<from).length>=201);
  crisis.push({tickers,...simulate(snapshot,dividends,{...base,tickers},dates.filter(d=>d>=from&&d<=to))});
 }
 const coverage=base.tickers.map(t=>{const c=snapshot.series[t];return {ticker:t,sector:sectors[t],first:c[0].date,last:c.at(-1).date,candles:c.length,eligibleFrom:c[200]?.date,largeJumps:c.slice(1).flatMap((x,i)=>Math.abs(x.close/c[i].close-1)>.35?[{date:x.date,returnPct:100*(x.close/c[i].close-1)}]:[])}});
 const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 const report={generatedAt:new Date().toISOString(),snapshotAt:snapshot.generatedAt,dividendsAt:dividends.generatedAt,hashes:Object.fromEntries(['data/latest.json','data/dividends.json','paper-engine.cjs','strategy-v2.cjs','research/robustness.cjs'].map(f=>[f,hash(f)])),coverage,results,sensitivity,crisis,limitations:['Overlapping 63-session windows are dependent, not independent trials.','Known historical data; no untouched holdout and no statistical proof of alpha.','Current survivors, lot sizes and dividend database; corporate actions not reconstructed.','Cash earns zero; taxes, spread, liquidity and market impact are not calibrated to a BCS tariff.','Crisis cohort differs from current universe; blocked paths are incomplete and must not be ranked.','No live strategy changes are made by this script.']};
 fs.writeFileSync('research/results/robustness-2026-11-07.json',JSON.stringify(report));
 console.log('Saved robustness report');
 return report;
}
if(require.main===module)run();
module.exports={metrics,simulate};
