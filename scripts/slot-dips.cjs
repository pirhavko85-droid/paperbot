'use strict';
const fs=require('node:fs');
const {advance}=require('../paper-engine.cjs');
const {addDays}=require('../dividends-core.js');
const base=require('../paper-config.json');
const sectors={...require('../strategy-v2.cjs').sectors,SNGSP:'energy',GMKN:'metals',PLZL:'metals',NLMK:'metals',MAGN:'metals',MGNT:'retail'};
const tickers=Object.keys(sectors);
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function stats(c,events){
 if(c.length<252)return null;
 const candles=c.slice(-252),rights=new Map();
 for(const event of events){
  if(!event.lastBuyDate||event.lastBuyDate<candles[0].date||!(event.amount>0)||event.currency!=='RUB')continue;
  const i=candles.findIndex(x=>x.date>event.lastBuyDate);
  if(i>0)rights.set(i,(rights.get(i)||0)+event.amount);
 }
 const v=[100];
 for(let i=1;i<candles.length;i++)v.push(v.at(-1)*(candles[i].close+(rights.get(i)||0))/candles[i-1].close);
 const last=v.at(-1),rank=v.filter(x=>x<=last).length/v.length,discount=1-last/mean(v.slice(-60));
 return {buy:rank<=.30&&discount>=.03&&last>v.at(-6)&&last>=.75*mean(v.slice(-200)),exit:discount<=0,score:1-rank+discount};
}
function step(previous,snapshot,div,slot,now,contributions=[],command='run'){
 const cutoff=new Date(+now+10800000).toISOString().slice(0,10);
 const series=Object.fromEntries(tickers.map(t=>[t,(snapshot.series[t]||[]).filter(c=>c.date<cutoff)]));
 const date=series[tickers[0]].at(-1)?.date;
 const old=previous?structuredClone(previous):null;
 const p=old?.portfolios[0];const flows={...(old?.flows||{})};
 let invested=200000+Object.values(flows).reduce((a,b)=>a+b,0);
 if(p&&date>old.lastSession&&command==='run'&&old.status!=='paused')for(const [key,amount] of contributions){
  if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Invalid contribution');
  if(key<=date&&!Object.hasOwn(flows,key)){flows[key]=amount;p.cash+=amount;p.peak+=amount;invested+=amount;}
 }
 const cfg={...base,tickers,starts:[200000],maxPositions:Math.floor(invested/slot),maxDrawdown:1};
 const signals=Object.fromEntries(tickers.map(t=>[t,stats(series[t],div.events.filter(e=>e.ticker===t))]));
 const policy={managedRisk:true,score:t=>signals[t]?.score??0,reason:side=>side==='buy'?'Нижние 30% диапазона наблюдений, скидка к SMA60 и восстановление':'Возврат к SMA60 или 126 сессий удержания',
 signal:({ticker,held,p})=>{const f=signals[ticker];if(!held)return !!f?.buy;
 return !f?.exit&&series[ticker].filter(c=>c.date>p.entryDates?.[ticker]).length<126;},
 budget:({p,order,equity})=>Object.entries(p.positions).some(([t,q])=>q>0&&sectors[t]===sectors[order.ticker])?0:Math.max(0,Math.min(slot*.70,p.cash-.30*equity)),
 executed:({p,order,date})=>{p.entryDates??={};if(order.side==='buy')p.entryDates[order.ticker]=date;else delete p.entryDates[order.ticker];},orders:()=>[]};
 const next=advance(old,{...snapshot,series},div,cfg,now,command,policy);
 if(next.health.status==='blocked'&&p&&invested!==(previous.invested??200000))return {...previous,health:next.health};
 next.flows=flows;next.invested=invested;return next;
}
function summarize(state){
 const p=state.portfolios[0],months={};let prior=200000,priorDate='',nav=1,peak=1,dd=0;
 for(const e of p.equity){
  const flow=Object.entries(state.flows).filter(([d])=>d>priorDate&&d<=e.date).reduce((s,[,v])=>s+v,0);
  const factor=e.value/(prior+flow),month=e.date.slice(0,7);
  months[month]=(months[month]??1)*factor;nav*=factor;peak=Math.max(peak,nav);dd=Math.min(dd,nav/peak-1);
  prior=e.value;priorDate=e.date;
 }
 return {date:state.lastSession,status:state.health,capital:state.invested,value:prior,pnl:prior-state.invested,returnPct:100*(nav-1),drawdownPct:100*dd,months:Object.fromEntries(Object.entries(months).map(([k,v])=>[k,(v-1)*100])),cash:p.cash,positions:p.positions,trades:p.ledger.filter(e=>['BUY','SELL'].includes(e.type)).length};
}
function main(){
 const s=require('../data/latest.json'),d=require('../data/dividends.json'),flow=require('../dip-contributions.json');
 const historical=process.argv.includes('--history'),file='data/dip-books.json';
 const books=!historical&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};const results={};
 for(const slot of [50000,100000]){
  let state=books[slot];
  if(historical){
   const dates=[...new Set(tickers.flatMap(t=>s.series[t].map(x=>x.date)))].filter(x=>x>='2026-05-01'&&x<='2026-10-31').sort();
   for(const date of dates){const now=new Date(addDays(date,1)+'T01:00:00Z');state=step(state,s,{...d,generatedAt:now.toISOString()},slot,now,[['2026-09-01',100000]]);if(state.health.status!=='ok')break;}
  }else state=step(state,s,d,slot,new Date(),flow,process.env.PAPER_COMMAND||'run');
  books[slot]=state;results[slot]=summarize(state);
 }
 const dest=historical?'research/results/slot-dips.json':file;
 fs.writeFileSync(dest+'.tmp',JSON.stringify(historical?results:books));fs.renameSync(dest+'.tmp',dest);
 console.log(JSON.stringify(results,null,2));
}
if(require.main===module)main();
module.exports={stats,step,summarize};
