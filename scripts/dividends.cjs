const fs=require('node:fs');
const {parse}=require('../dividends-core.js');
const {isRussianShare}=require('../config.js');
async function main(){
 const snapshot=JSON.parse(fs.readFileSync('data/latest.json','utf8'));const block=Object.values(snapshot.responses).find(j=>j.securities?.columns.includes('SECTYPE')).securities;
 const tickers=block.data.map(r=>Object.fromEntries(block.columns.map((c,i)=>[c,r[i]]))).filter(isRussianShare).map(x=>x.SECID).sort();
 const result={schema:1,generatedAt:new Date().toISOString(),source:'Smart-Lab: таблица «Выплаченные дивиденды»',paymentDatePolicy:'Фактических дат зачисления нет. В модели: реестр + 30 календарных дней.',coverage:{},events:[],errors:[],checks:[]};
 // Bounded batches avoid flooding the public source. Failed data is never interpreted as zero.
 for(let offset=0;offset<tickers.length;offset+=4){await Promise.all(tickers.slice(offset,offset+4).map(async ticker=>{
 let source='https://smart-lab.ru/q/'+encodeURIComponent(ticker)+'/dividend/';
 try{let html;for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(source,{signal:AbortSignal.timeout(20000)});if(!r.ok){if(r.status===404&&ticker.endsWith('P')){source='https://smart-lab.ru/q/'+ticker.slice(0,-1)+'/dividend/';continue}throw Error('HTTP '+r.status)}html=await r.text();break}catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,500))}}if(!html)throw Error('Нет ответа');if(!/Выплаченные дивиденды/.test(html)&&ticker.endsWith('P')){source='https://smart-lab.ru/q/'+ticker.slice(0,-1)+'/dividend/';const r=await fetch(source,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);html=await r.text()}if(html.length>2000000)throw Error('Слишком большой ответ');const events=parse(html,ticker,source,result.generatedAt);result.events.push(...events);result.coverage[ticker]={status:events.length?'available':'no_records',count:events.length,source};}
 catch(e){result.coverage[ticker]={status:'error',count:0,source,error:e.message};result.errors.push({ticker,error:e.message});}
 }));console.log('Dividends: '+Math.min(offset+4,tickers.length)+'/'+tickers.length);await new Promise(r=>setTimeout(r,200))}
 const checks=[{ticker:'SBER',recordDate:'2025-07-18',amount:34.84,source:'https://www.e-disclosure.ru/portal/event.aspx?EventId=7TGhw7-A9qkK5ErPvhXMizQ-B-B'},{ticker:'MOEX',year:'2025',amount:26.11,source:'https://www.moex.com/a2656'}];
 for(const check of checks){const found=result.events.filter(e=>e.ticker===check.ticker&&(check.recordDate?e.recordDate===check.recordDate:e.recordDate.startsWith(check.year)));const sum=found.reduce((a,e)=>a+e.amount,0);result.checks.push({...check,passed:Math.abs(sum-check.amount)<.001});if(Math.abs(sum-check.amount)>=.001)throw Error('Не пройдена сверка с эмитентом: '+check.ticker)}
 if(!result.events.length)throw Error('История дивидендов пуста');
 result.events.sort((a,b)=>a.ticker.localeCompare(b.ticker)||a.recordDate.localeCompare(b.recordDate));
 fs.writeFileSync('data/dividends.json.tmp',JSON.stringify(result));fs.renameSync('data/dividends.json.tmp','data/dividends.json');console.log('Dividend events: '+result.events.length+'; errors: '+result.errors.length);
}
main().catch(e=>{console.error(e);process.exitCode=1});
