'use strict';
// Read-only audit: production state/config are never rewritten.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {replay}=require('./compare.cjs');
const {createPolicy,universe,sectors}=require('./reserve-policy.cjs');
const {diagnose}=require('./engine-diagnostics.cjs');
const round=n=>Math.round(n*100)/100;
function attribute(p,snapshot,date){
 const trades=p.ledger.filter(e=>['BUY','SELL'].includes(e.type));
 const tickers=[...new Set([...Object.keys(p.positions),...trades.map(e=>e.ticker),...Object.values(p.entitlements).map(e=>e.ticker)])];
 let cash=p.start;
 const rows=tickers.map(ticker=>{
  let qty=0,flow=0,fees=0,slippage=0;
  for(const e of trades.filter(e=>e.ticker===ticker)){
   const sign=e.type==='BUY'?1:-1,notional=round(e.qty*e.price);
   qty+=sign*e.qty;flow-=sign*notional;fees+=e.fee;
   const raw=snapshot.series[ticker]?.find(c=>c.date===e.date)?.close;
   if(!Number.isFinite(raw))throw Error('Missing execution close: '+ticker+' '+e.date);
   slippage+=sign*(e.price-raw)*e.qty;
  }
  const price=snapshot.series[ticker]?.find(c=>c.date===date)?.close;
  if(!Number.isFinite(price))throw Error('Missing valuation close: '+ticker+' '+date);
  const credited=p.ledger.filter(e=>e.ticker===ticker&&e.type==='DIVIDEND_MODEL_CREDIT').reduce((s,e)=>s+e.net,0);
  const receivable=Object.values(p.entitlements).filter(e=>e.ticker===ticker&&!e.paid).reduce((s,e)=>s+e.gross,0);
  const marketValue=round(qty*price),pricePnl=round(marketValue+flow);
  cash+=flow-fees+credited;
  return {ticker,sector:sectors[ticker]||'unknown',qty,recordedQty:p.positions[ticker]||0,price,marketValue,pricePnl,fees:round(fees),slippage:round(slippage),marketMoveBeforeCosts:round(pricePnl+slippage),dividendsCredited:round(credited),receivable:round(receivable),totalPnl:round(pricePnl-fees+credited+receivable)};
 });
 const last=p.equity.at(-1),value=round(p.cash+rows.reduce((s,r)=>s+r.marketValue+r.receivable,0));
 const result={start:p.start,date,cash:p.cash,value,pnl:round(value-p.start),returnPct:(value/p.start-1)*100,fees:round(rows.reduce((s,r)=>s+r.fees,0)),slippage:round(rows.reduce((s,r)=>s+r.slippage,0)),rows};
 result.checks={cashDifference:round(p.cash-cash),equityDifference:round(value-last.value),attributionDifference:round(result.pnl-rows.reduce((s,r)=>s+r.totalPnl,0)),positionsMatch:rows.every(r=>r.qty===r.recordedQty)};
 result.sectors=Object.entries(rows.reduce((s,r)=>{s[r.sector]=(s[r.sector]||0)+r.marketValue;return s},{})).map(([sector,amount])=>({sector,amount:round(amount),navPct:amount/value*100,investedPct:amount/(value-p.cash)*100}));
 return result;
}
function run(ref='origin/main'){
 const root=path.resolve(__dirname,'..'),sha=cp.execFileSync('git',['rev-parse',ref],{cwd:root,encoding:'utf8'}).trim();
 const hashes={};
 const read=f=>{const bytes=cp.execFileSync('git',['show',sha+':'+f],{cwd:root,maxBuffer:30*1024*1024});hashes[f]=crypto.createHash('sha256').update(bytes).digest('hex');return JSON.parse(bytes)};
 const state=read('data/paper-state.json'),snapshot=read('data/latest.json'),dividends=read('data/dividends.json'),config=read('paper-config.json');
 const report={generatedAt:new Date().toISOString(),commit:sha,sourceHashes:hashes,stateUpdatedAt:state.updatedAt,lastSession:state.lastSession,health:state.health,snapshotAt:snapshot.generatedAt,dividendsAt:dividends.generatedAt,portfolios:state.portfolios.map(p=>attribute(p,snapshot,state.lastSession)),diagnostics:diagnose(),comparisons:[]};
 const index=snapshot.series.IMOEX||[],start=state.portfolios[0].equity[0].date;
 const a=index.filter(c=>c.date<=start).at(-1),b=index.filter(c=>c.date<=state.lastSession).at(-1);
 report.priceIndex=a&&b?{ticker:'IMOEX',from:a.date,to:b.date,returnPct:(b.close/a.close-1)*100,note:'Price index only; dates may differ from portfolio sessions; not a total-return benchmark.'}:null;
 const phases=[{name:'2020',from:'2020-01-01',to:'2020-12-31'},{name:'2022',from:'2022-01-01',to:'2022-12-31'},{name:'2024-2025',from:'2024-01-01',to:'2025-12-31'},{name:'2026 H1',from:'2026-02-04',to:'2026-06-30'},{name:'2026 H2',from:'2026-07-01',to:state.lastSession}];
 for(const phase of phases){
  const variants=[{name:'Current 8 / 5 slots',config},{name:'Same 8 / reserve',config:{...config,maxPositions:10,positionWeight:.07},policy:createPolicy()}];
  if(phase.name.startsWith('2026'))variants.push({name:'Expanded 18 / reserve',config:{...config,tickers:universe,maxPositions:10,positionWeight:.07},policy:createPolicy()});
  for(const v of variants){const r=replay(snapshot,dividends,v.config,{...phase,policy:v.policy});report.comparisons.push({phase:phase.name,variant:v.name,requestedFrom:phase.from,requestedTo:phase.to,from:r.from,to:r.to,sessions:r.sessions,failures:r.failures,summary:r.summary});}
 }
 report.replayCodeHashes=Object.fromEntries(['paper-engine.cjs','research/compare.cjs','research/reserve-policy.cjs'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
 const dir=path.join(__dirname,'results');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'audit-2026-11-06.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 return report;
}
if(require.main===module)run(process.argv[2]);
module.exports={attribute,run};
