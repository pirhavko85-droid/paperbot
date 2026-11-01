(function(root){
'use strict';
const clean=s=>String(s).replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
function date(s){const m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);if(!m)throw Error('Неизвестная дата: '+s);const d=m[3]+'-'+m[2]+'-'+m[1];if(new Date(d).toISOString().slice(0,10)!==d)throw Error('Некорректная дата');return d}
function parse(html,ticker,source,observedAt){
 const table=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(x=>x[0]).find(x=>/Выплаченные дивиденды/.test(clean(x)));
 if(!table)throw Error('Таблица выплаченных дивидендов не найдена');
 const events=new Map();
 for(const [row] of table.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)){
 if(/dividend_canceled|<del\b|line-through/i.test(row))continue;
 const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>clean(x[1]));
 if(cells[0]!==ticker)continue;if(cells.length<7)throw Error('Изменился формат таблицы');
 const recordDate=date(cells[2]);let lastBuyDate=null;try{lastBuyDate=date(cells[1]);if(lastBuyDate>=recordDate)lastBuyDate=null}catch(e){}
 const amount=Number(cells[4].replace(/₽|руб\.?/g,'').replace(/\s/g,'').replace(',','.'));
 if(!Number.isFinite(amount)||amount<=0||!/₽|руб/.test(cells[4]))throw Error('Невалидная выплата '+ticker);
 const id=ticker+'|'+recordDate+'|'+cells[3];const event={id,ticker,lastBuyDate,recordDate,period:cells[3],amount,currency:'RUB',paymentDate:null,status:'reported_paid',source,observedAt};
 if(events.has(id)&&events.get(id).amount!==amount)throw Error('Конфликт выплат '+id);events.set(id,event);
 }
 return [...events.values()].sort((a,b)=>a.recordDate.localeCompare(b.recordDate));
}
const addDays=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function trailing(events,asof){const from=addDays(asof,-365);return events.filter(e=>e.recordDate>from&&e.recordDate<=asof).reduce((s,e)=>s+e.amount,0)}
const api={parse,addDays,trailing};if(typeof module!=='undefined')module.exports=api;else root.PaperBotDividends=api;
})(globalThis);
