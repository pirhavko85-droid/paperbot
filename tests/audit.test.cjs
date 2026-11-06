const test=require('node:test'),assert=require('node:assert/strict');
const {attribute}=require('../research/audit.cjs');
test('audit reconciles partial sale, costs, dividend cash and unpaid rights',()=>{
 const p={start:1000,cash:777,positions:{AAA:2},entitlements:{one:{ticker:'AAA',gross:6,paid:false}},ledger:[{type:'BUY',ticker:'AAA',qty:3,price:101,fee:2,date:'2026-01-01'},{type:'SELL',ticker:'AAA',qty:1,price:79,fee:1,date:'2026-01-02'},{type:'DIVIDEND_MODEL_CREDIT',ticker:'AAA',net:4}],equity:[{value:943}]};
 const snapshot={series:{AAA:[{date:'2026-01-01',close:100},{date:'2026-01-02',close:80}]}};
 const r=attribute(p,snapshot,'2026-01-02');
 assert.equal(r.pnl,-57);assert.equal(r.slippage,4);assert.equal(r.rows[0].marketMoveBeforeCosts,-60);
 assert.deepEqual(r.checks,{cashDifference:0,equityDifference:0,attributionDifference:0,positionsMatch:true});
});
test('audit rejects missing price instead of reporting zero loss',()=>{
 assert.throws(()=>attribute({start:100,cash:0,positions:{AAA:1},entitlements:{},ledger:[],equity:[{value:100}]},{series:{}},'2026-01-02'),/Missing valuation/);
});
test('ex-dividend gap offset by receivable does not trigger a false risk pause',()=>{
 const r=require('../research/engine-diagnostics.cjs').diagnose().dividendRiskOrdering;
 assert.equal(r.actualNav,r.expectedNav);
 assert.equal(r.unexpectedPause,false);
 assert.equal(r.events.filter(e=>e.type==='DIVIDEND_ENTITLEMENT').length,1);
});
