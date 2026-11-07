const test=require('node:test'),assert=require('node:assert/strict');
const {dividendScreen}=require('../dividend-pool.js');
test('pool distinguishes yield on current price from dividends earned on initial capital',()=>{
 const snapshot={generatedAt:'2026-11-07T12:00:00Z',series:{SBERP:[{date:'2025-11-06',close:100},{date:'2026-11-06',close:90}]}};
 const events=['2023','2024','2025','2026'].map(y=>({ticker:'SBERP',amount:10,recordDate:y+'-07-10',lastBuyDate:y+'-07-08',currency:'RUB',status:'reported_paid'}));
 const dividends={coverage:{SBERP:{status:'available'}},events};
 const [r]=dividendScreen(snapshot,dividends);assert.ok(r.qualified);assert.equal(r.yield,10/90);assert.ok(Math.abs(r.total)<1e-12);
 events.pop();assert.equal(dividendScreen(snapshot,dividends)[0].qualified,false);
});
