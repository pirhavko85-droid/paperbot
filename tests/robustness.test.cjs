'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {metrics,simulate}=require('../research/robustness.cjs');
const {aggregate}=require('../research/render-robustness.cjs');
test('summary excludes incomplete paths, continuous diagnostics and other cost levels',()=>{
 const item=(v,extra={})=>({window:'2026-05-01',model:'balanced',cost:1,complete:true,portfolios:[{start:50000,returnPct:v,maxDrawdownPct:-2,averageCashPct:40}],...extra});
 const x=aggregate({results:[item(-1),item(3),item(999,{complete:false}),item(500,{window:'continuous-2026'}),item(100,{cost:2})]},50000)[0];
 assert.equal(x.median,1);assert.equal(x.worst,-1);assert.equal(x.best,3);assert.equal(x.complete,2);assert.equal(x.total,3);assert.equal(x.positive,1);
});
test('research metrics include initial capital in worst daily loss and retain underwater time',()=>{
 const p={start:100,cash:90,positions:{SBERP:1},ledger:[{type:'BUY',qty:1,price:10,fee:.01},{type:'DIVIDEND_ENTITLEMENT',gross:2},{type:'SKIP',code:'LOT_BUDGET'}],equity:[{date:'2026-01-01',value:90,cash:80,drawdown:-.1},{date:'2026-01-02',value:95,cash:80,drawdown:-.05},{date:'2026-01-03',value:100,cash:90,drawdown:0}]};
 const m=metrics(p);assert.equal(m.returnPct,0);assert.equal(m.maxDrawdownPct,-10);assert.ok(Math.abs(m.worstDayPct+10)<1e-10);assert.equal(m.longestUnderwaterSessions,2);assert.equal(m.turnover,.1);assert.equal(m.dividendRights,2);assert.equal(m.skips.LOT_BUDGET,1);
});
test('empty research windows and blocked data never count as a complete backtest',()=>{
 assert.equal(simulate({},{},{},[]).complete,false);
 const config={...require('../paper-config.json'),tickers:['SBERP'],starts:[100]};
 const result=simulate({series:{SBERP:[]},responses:{}},{events:[],coverage:{}},config,['2026-01-01']);
 assert.equal(result.complete,false);assert.equal(result.to,null);assert.match(result.failure.reason,/истории/);
});
