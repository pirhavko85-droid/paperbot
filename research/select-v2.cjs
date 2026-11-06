'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {advance}=require('../paper-engine.cjs'),{createStrategy,sectors}=require('../strategy-v2.cjs'),{addDays}=require('../dividends-core.js');
const base={...require('../paper-config.json'),tickers:Object.keys(sectors),maxPositions:8,positionWeight:.08,cashReserve:.30,sectorLimit:.20,riskPerTrade:.005,maxDrawdown:.10};
function run(){
 const snapshot=JSON.parse(fs.readFileSync('data/latest.json')),dividends=JSON.parse(fs.readFileSync('data/dividends.json'));
 const to=addDays(snapshot.generatedAt.slice(0,10),-1),phases=[['development','2026-05-01','2026-06-30'],['retrospective-validation','2026-07-01',to]];
 const results=[];
 for(const [phase,from,till] of phases)for(const model of ['sma','trend','dip','hold','balanced'])for(const cost of [1,2]){
  const config={...base,model,commission:base.commission*cost,slippage:base.slippage*cost,...(model==='hold'?{maxPositions:18,maxDrawdown:1}:model==='balanced'?{maxPositions:18}: {})};
  const dates=[...new Set(config.tickers.flatMap(t=>(snapshot.series[t]||[]).map(c=>c.date)))].filter(d=>d>=from&&d<=till).sort();
  let state=null,failures=[];
  for(const date of dates){
   const now=new Date(addDays(date,1)+'T01:00:00Z'),series=Object.fromEntries(config.tickers.map(t=>[t,snapshot.series[t].filter(c=>c.date<=date)]));
   // Do not disguise missing instrument sessions by intersecting calendars.
   const snap={...snapshot,series},div={...dividends,generatedAt:now.toISOString()};
   state=advance(state,snap,div,config,now,'run',createStrategy(snap,div,config,now));
   if(state.health.status!=='ok'){failures.push({date,...state.health});break}
  }
  results.push({phase,model,cost,from,to:state.lastSession,complete:!failures.length,failures,portfolios:state.portfolios.map(p=>({start:p.start,sessions:p.equity.length,returnPct:((p.equity.at(-1)?.value||p.start)/p.start-1)*100,maxDrawdownPct:Math.min(0,...p.equity.map(e=>e.drawdown))*100,trades:p.ledger.filter(e=>['BUY','SELL'].includes(e.type)).length,fees:p.ledger.reduce((s,e)=>s+(e.fee||0),0),averageCashPct:p.equity.reduce((s,e)=>s+e.cash/e.value*100,0)/(p.equity.length||1),riskOff:!!p.riskOff}))});
 }
 const report={generatedAt:new Date().toISOString(),sources:{snapshotAt:snapshot.generatedAt,dividendsAt:dividends.generatedAt},hashes:Object.fromEntries(['data/latest.json','data/dividends.json','paper-engine.cjs','strategy-v2.cjs'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),config:base,results,limitations:['Current universe and lot sizes; survivorship bias.','Historical dividend knowledge; source completeness not independently audited.','No complete 2008/2022 crisis certification.','Validation dates have already been inspected; this is not unseen out-of-sample evidence.','Incomplete runs must not be ranked as full-period returns.','No claim that the most profitable backtest is the best future strategy.']};
 fs.writeFileSync('research/results/selection-v2.json',JSON.stringify(report,null,2));
 for(const r of results)console.log(r.phase,r.model,'cost',r.cost,r.complete?'COMPLETE':'BLOCKED '+r.failures[0].date,r.portfolios.map(p=>p.returnPct.toFixed(2)+'% / DD '+p.maxDrawdownPct.toFixed(2)+'%').join(' | '));
}
if(require.main===module)run();
module.exports={base};
