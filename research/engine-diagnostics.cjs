'use strict';
// Synthetic counterexamples, not market forecasts or modifications to live state.
const {advance}=require('../paper-engine.cjs');
const {addDays}=require('../dividends-core.js');
function diagnose(){
 const day=n=>addDays('2026-01-01',n),date=day(62),next=day(63),now=new Date(day(64)+'T01:00:00Z');
 const config={...require('../paper-config.json'),tickers:['AAA'],starts:[10000]};
 const snapshot={series:{AAA:Array.from({length:64},(_,i)=>({date:day(i),close:i===63?80:100}))},responses:{board:{securities:{columns:['SECID','SECTYPE','LOTSIZE'],data:[['AAA','1',1]]}}}};
 const previous={schema:1,mode:'paper-only',status:'active',lastSession:date,portfolios:[{start:10000,cash:0,positions:{AAA:100},pending:[],entitlements:{},ledger:[],equity:[{date,value:10000}],holdings:{[date]:{AAA:100}},peak:10000,paused:false}]};
 const dividends={generatedAt:now.toISOString(),coverage:{AAA:{status:'available'}},events:[{id:'dividend-gap',ticker:'AAA',lastBuyDate:date,recordDate:next,amount:20,source:'synthetic'}]};
 const result=advance(previous,snapshot,dividends,config,now);
 const p=result.portfolios[0];
 return {dividendRiskOrdering:{description:'Price drops 100 to 80, entitlement 20 per share. Economic NAV stays 10000.',expectedNav:10000,actualNav:p.equity.at(-1).value,unexpectedPause:p.paused,events:p.ledger.map(e=>({type:e.type,reason:e.reason}))}};
}
if(require.main===module)console.log(JSON.stringify(diagnose(),null,2));
module.exports={diagnose};
