'use strict';
const sectors={SBERP:'finance',MOEX:'finance',T:'finance',DOMRF:'finance',LKOH:'energy',TATN:'energy',ROSN:'energy',GAZP:'energy',NVTK:'energy',BANEP:'energy',TRNFP:'energy',MTSS:'telecom',MDMG:'health',X5:'retail',YDEX:'technology',AFLT:'transport',IRAO:'utilities',CHMF:'metals'};
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function features(c,events=[]){
 if(c.length<201)return null;
 const payments=new Map();
 for(const e of events){if(!e.lastBuyDate||!(e.amount>0))continue;const i=c.findIndex(x=>x.date>e.lastBuyDate);if(i>0)payments.set(i,(payments.get(i)||0)+e.amount)}
 const values=[c[0].close];
 for(let i=1;i<c.length;i++)values.push(values.at(-1)*(c[i].close+(payments.get(i)||0))/c[i-1].close);
 const last=values.at(-1),returns=values.slice(-21).slice(1).map((x,i)=>Math.log(x/values.slice(-21)[i])),m=mean(returns);
 const vol=Math.sqrt(mean(returns.map(x=>(x-m)**2)));
 return {last,previous:values.at(-2),sma20:mean(values.slice(-20)),sma60:mean(values.slice(-60)),sma200:mean(values.slice(-200)),momentum:last/values.at(-61)-1,vol,score:(last/values.at(-61)-1)/Math.max(vol,.005),stop:Math.min(.12,Math.max(.04,3*vol))};
}
function createStrategy(snapshot,dividends,config,now=new Date()){
 const cutoff=new Date(+now+3*3600000).toISOString().slice(0,10);
 const stats=Object.fromEntries(config.tickers.map(t=>[t,features((snapshot.series[t]||[]).filter(c=>c.date<cutoff),dividends.events.filter(e=>e.ticker===t))]));
 const mode=config.model||'trend';
 return {
  managedRisk:true,
  signal({ticker,held,p}){
   if(p.riskOff)return false;
   const f=stats[ticker];if(!f)return held;
   if(mode==='hold'||mode==='balanced')return !p.riskOff;
   if(held){const entry=p.entryRisk?.[ticker];return !(p.riskOff||f.last<f.sma60||(entry&&f.last/entry.index-1<=-entry.stop))}
   if(p.riskOff)return false;
   const trend=f.last>f.sma200&&f.sma20>f.sma60&&f.momentum>0;
   return mode==='sma'?f.sma20>f.sma60:mode==='dip'?trend&&f.last<f.sma20&&f.last>f.previous:trend;
  },
  score:t=>['hold','balanced'].includes(mode)?0:stats[t]?.score??0,
  metadata:t=>({stopDistance:stats[t]?.stop??.12}),
  reason:side=>['hold','balanced'].includes(mode)?side==='buy'?'V2: равный бюджет отраслей; доля компании с учётом лота':'V2: выход по риску портфеля':side==='buy'?(mode==='dip'?'V2: восстановление после отката в тренде':mode==='sma'?'V2: SMA20 выше SMA60; размер ограничен риском':'V2: подтверждённый тренд; приоритет по силе относительно волатильности'):'V2: выход по тренду, защитному уровню или риску портфеля',
  budget({p,order,prices,equity}){
   const f=stats[order.ticker];if(!f)return 0;
   const sector=sectors[order.ticker];
   const exposure=Object.entries(p.positions).reduce((s,[t,q])=>s+(sectors[t]===sector?q*prices[t]:0),0);
   const weight=['hold','balanced'].includes(mode)?Math.min(config.positionWeight,(1-config.cashReserve)/new Set(config.tickers.map(t=>sectors[t])).size/config.tickers.filter(t=>sectors[t]===sector).length):Math.min(config.positionWeight,config.riskPerTrade/(order.stopDistance||.12));
   // Budget includes execution costs; conservative buffers keep caps below limits.
   const nav=equity*(1-config.commission-config.slippage);
   return Math.max(0,Math.min(weight*nav,p.cash-config.cashReserve*equity,config.sectorLimit*nav-exposure));
  },
  executed({p,order}){
   p.entryRisk??={};
   if(order.side==='buy'){const f=stats[order.ticker];p.entryRisk[order.ticker]={index:f.last,stop:order.stopDistance||.12}}
   else delete p.entryRisk[order.ticker];
  },
  orders:()=>[],
  stats
 };
}
module.exports={createStrategy,features,sectors};
