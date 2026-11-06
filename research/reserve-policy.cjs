'use strict';
const {signal}=require('../paper-engine.cjs');
const sectors={SBERP:'finance',MOEX:'finance',T:'finance',DOMRF:'finance',LKOH:'energy',TATN:'energy',ROSN:'energy',GAZP:'energy',NVTK:'energy',BANEP:'energy',TRNFP:'energy',MTSS:'telecom',MDMG:'health',X5:'retail',YDEX:'technology',AFLT:'transport',IRAO:'utilities',CHMF:'metals'};
const universe=Object.keys(sectors);
// Experimental only: scripts/paper.cjs never supplies this policy to advance().
// Tranches are released at 5/8/12% portfolio drawdown. A stock also needs a
// 5% pullback from its trailing 20-session high, an up day, and SMA20 > SMA60.
function createPolicy(){return {
 budget({p,order,prices,equity,config}){
  const t=order.ticker,held=(p.positions[t]||0)*prices[t];
  const sectorValue=Object.entries(p.positions).reduce((s,[k,q])=>s+(sectors[k]===sectors[t]?q*prices[k]:0),0);
  const cashFloor=order.reserve?.15:.30;
  const r=p.researchReserve;
  const allowance=order.reserve&&r?Math.max(0,r.anchor*.05*order.stage-r.spent):equity*config.positionWeight;
  // Conservative allowance for fees/slippage when enforcing purchase weights.
  const conservativeNav=equity*(1-config.commission-config.slippage);
  return Math.max(0,Math.min(allowance,p.cash-cashFloor*equity,.10*conservativeNav-held,.25*conservativeNav-sectorValue));
 },
 executed({p,order,notional,fee}){
  if(order.side==='buy'&&order.reserve){p.researchReserve.spent+=notional+fee;p.researchReserve.fills++}
 },
 orders({p,series,date,equity}){
  const dd=equity/p.peak-1;
  if(dd>=-1e-10){p.researchReserve={anchor:equity,spent:0,fills:0};return []}
  if(!p.researchReserve)p.researchReserve={anchor:p.peak,spent:0,fills:0};
  const stage=dd<=-.12?3:dd<=-.08?2:dd<=-.05?1:0;
  if(!stage||p.researchReserve.spent>=p.researchReserve.anchor*.05*stage)return [];
  return Object.keys(p.positions).filter(t=>{
   const c=series[t],last=c.at(-1).close,high=Math.max(...c.slice(-20).map(x=>x.close));
   return p.positions[t]>0&&signal(c)&&last>c.at(-2).close&&last/high-1<=-.05;
  }).map(ticker=>({ticker,side:'buy',reserve:true,stage,signalDate:date,reason:'Резерв: откат ≥5%, рост за сессию, SMA20>SMA60; ступень '+stage}));
 }
}}
module.exports={createPolicy,sectors,universe};
