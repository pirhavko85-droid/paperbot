(function(root){
function simulate(c,events=[]){
 const addDays=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
 let cash=1,qty=0,trades=0,peak=1,dd=0,holdCash=0,dividendIncome=0;const eq=[],hold=[],rights=[],holdRights=[],eligible=new Map(),holdQty=1/c[0].close;
 const usable=events.filter(e=>e.lastBuyDate&&e.lastBuyDate>=c[0].date&&e.recordDate<=c.at(-1).date),byDate=new Map();for(const e of usable){if(!byDate.has(e.lastBuyDate))byDate.set(e.lastBuyDate,[]);byDate.get(e.lastBuyDate).push(e)}
 for(let i=0;i<c.length;i++){
 const {date,close:price}=c[i];
 for(const r of rights)if(!r.paid&&r.payDate<=date){cash+=r.amount;r.paid=true}
 for(const r of holdRights)if(!r.paid&&r.payDate<=date){holdCash+=r.amount;r.paid=true}
 if(i>=60){const avg=n=>c.slice(i-n,i).reduce((s,x)=>s+x.close,0)/n;const target=avg(20)>avg(60);if(target&&qty===0){qty=cash*(1-.0005)/price;cash=0;trades++}else if(!target&&qty>0){cash=qty*price*(1-.0005);qty=0;trades++}}
 for(const e of byDate.get(date)||[]){eligible.set(e.id,true);const payDate=addDays(e.recordDate,30),activeDate=c[i+1]?.date||'9999-12-31';if(qty>0){rights.push({amount:qty*e.amount,recordDate:e.recordDate,activeDate,payDate,paid:false});dividendIncome+=qty*e.amount}holdRights.push({amount:holdQty*e.amount,recordDate:e.recordDate,activeDate,payDate,paid:false})}
 const value=cash+qty*price+rights.filter(r=>!r.paid&&r.activeDate<=date).reduce((s,r)=>s+r.amount,0);
 eq.push(value);hold.push(holdQty*price+holdCash+holdRights.filter(r=>!r.paid&&r.activeDate<=date).reduce((s,r)=>s+r.amount,0));peak=Math.max(peak,value);dd=Math.min(dd,value/peak-1);
 }
 return {eq,hold,ret:eq.at(-1)-1,baseline:hold.at(-1)-1,dd,trades,dividendIncome,dividendEvents:eligible.size,missingDividendDates:usable.length-eligible.size+events.filter(e=>!e.lastBuyDate&&e.recordDate>=c[0].date&&e.recordDate<=c.at(-1).date).length};
}
const api={simulate};if(typeof module!=='undefined')module.exports=api;else root.PaperBotSimulation=api;
})(globalThis);
