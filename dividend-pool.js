/* Dated profit labels from issuer-review.html, 2026-11-07. */
const dividendProfit = {
  "SBERP": "Прибыль растёт",
  "LKOH": "Прибыль растёт",
  "GAZP": "Прибыль растёт",
  "ROSN": "Прибыль растёт",
  "TATN": "Прибыль растёт",
  "NVTK": "Прибыль положительная",
  "SNGSP": "Убыток · РСБУ 2025",
  "GMKN": "Прибыль положительная",
  "PLZL": "Прибыль снизилась",
  "CHMF": "Прибыль растёт",
  "NLMK": "Прибыль снизилась",
  "MAGN": "Убыток",
  "YDEX": "Прибыль растёт",
  "T": "Прибыль растёт",
  "MOEX": "Прибыль растёт",
  "MTSS": "Прибыль растёт",
  "X5": "Прибыль растёт",
  "MGNT": "Убыток",
  "IRAO": "Прибыль положительная",
  "MDMG": "Прибыль растёт",
  "BANEP": "Прибыль снизилась",
  "TRNFP": "Прибыль растёт",
  "AFLT": "Прибыль положительная",
  "DOMRF": "Прибыль растёт"
};
function dividendScreen(snapshot,dividends){
 const cutoff=new Date(Date.parse(snapshot.generatedAt)+10800000).toISOString().slice(0,10);
 const result=[];
 for(const [ticker,profit] of Object.entries(dividendProfit)){
  const candles=(snapshot.series[ticker]||[]).filter(c=>c.date<cutoff&&c.close>0);
  const last=candles.at(-1);
  if(!last||dividends.coverage?.[ticker]?.status!=='available')continue;
  const since=new Date(last.date+'T00:00:00Z');since.setUTCFullYear(since.getUTCFullYear()-1);
  const before=since.toISOString().slice(0,10),base=candles.filter(c=>c.date<=before).at(-1);
  const events=(dividends.events||[]).filter(e=>e.ticker===ticker&&e.status==='reported_paid'&&e.currency==='RUB'&&e.amount>0&&e.lastBuyDate&&e.recordDate<=last.date);
  const amount=events.filter(e=>e.lastBuyDate>=before&&e.lastBuyDate<last.date).reduce((sum,e)=>sum+e.amount,0);
  const year=Number(last.date.slice(0,4));
  const years=new Set(events.map(e=>Number(e.recordDate.slice(0,4))).filter(y=>y>=year-3&&y<year));
  const discontinuity=candles.some((c,i)=>i&&c.date>before&&Math.abs(c.close/candles[i-1].close-1)>.35);
  const full=base&&Date.parse(before)-Date.parse(base.date)<=7*86400000&&!discontinuity;
  const priceReturn=full?last.close/base.close-1:null;
  const eligibleCash=full?events.filter(e=>e.lastBuyDate>=base.date&&e.lastBuyDate<last.date).reduce((sum,e)=>sum+e.amount,0):null;
  const total=full?priceReturn+eligibleCash/base.close:null;
  const positive=profit.startsWith('Прибыль')&&!['BANEP','SNGSP'].includes(ticker)&&year===2026;
  result.push({ticker,profit,date:last.date,years:years.size,amount,yield:amount/last.close,priceReturn,total,qualified:!!(full&&positive&&amount>0&&years.size===3)});
 }
 return result.sort((a,b)=>b.yield-a.yield||a.ticker.localeCompare(b.ticker));
}
if(typeof module!=='undefined')module.exports={dividendScreen};
