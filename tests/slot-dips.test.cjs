const test=require('node:test'),assert=require('node:assert/strict');
const {summarize,stats}=require('../scripts/slot-dips.cjs');
test('a deposit changes capital without creating return or drawdown',()=>{
 const r=summarize({invested:300000,flows:{'2026-09-01':100000},portfolios:[{equity:[{date:'2026-08-31',value:200000},{date:'2026-09-01',value:300000}],ledger:[]}]});
 assert.equal(r.returnPct,0);assert.equal(r.drawdownPct,0);assert.equal(r.pnl,0);
});
test('steady falls do not qualify as a confirmed recovery',()=>{
 const c=Array.from({length:252},(_,i)=>({date:String(i).padStart(3,'0'),close:300-i/2}));
 assert.equal(stats(c,[]).buy,false);
});
