const fs=require('node:fs');
const {tickers,version}=require('../config.js');
const origin='https://iss.moex.com/iss/';
async function request(url){let error;for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}catch(e){error=e;await new Promise(r=>setTimeout(r,1000*(attempt+1)))}}throw error}
const rows=b=>{if(!b?.columns||!Array.isArray(b.data))throw Error('Некорректная таблица MOEX');return b.data.map(r=>Object.fromEntries(b.columns.map((c,i)=>[c,r[i]])))};
async function main(){
const result={schema:1,version,generatedAt:new Date().toISOString(),responses:{},series:{},errors:[]};
const quotes=origin+'engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,LOTSIZE&marketdata.columns=SECID,LAST,MARKETPRICE,LCURRENTPRICE,UPDATETIME,TRADINGSTATUS';
const q=await request(quotes);if(!rows(q.marketdata).some(x=>x.SECID==='SBER'&&[x.LAST,x.MARKETPRICE,x.LCURRENTPRICE].some(v=>Number.isFinite(v)&&v>0)))throw Error('Нет котировок SBER');result.responses[quotes]=q;
const u=origin+'engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&start=0';const universe=await request(u);if(rows(universe.securities).length<10)throw Error('Список акций пуст');result.responses[u]=universe;
const till=new Date().toISOString().slice(0,10);
for(const ticker of tickers){try{const root=ticker==='IMOEX'?origin+'engines/stock/markets/index/boards/SNDX/securities/IMOEX/candles.json':origin+'engines/stock/markets/shares/boards/TQBR/securities/'+ticker+'/candles.json';let candles=[];for(let start=0;start<20000;start+=500){const j=await request(root+'?iss.meta=off&from=2008-01-01&till='+till+'&interval=24&start='+start);const page=rows(j.candles);candles.push(...page.filter(x=>Number.isFinite(x.close)&&x.close>0&&x.begin).map(x=>({date:x.begin.slice(0,10),close:x.close})));if(page.length<500)break;if(start===19500)throw Error('Неполная история')}
if(candles.length<65)throw Error('Недостаточно истории: '+candles.length);result.series[ticker]=[...new Map(candles.map(x=>[x.date,x])).values()].sort((a,b)=>a.date.localeCompare(b.date));console.log(ticker+': '+candles.length)}catch(e){result.errors.push({ticker,error:e.message});console.error(ticker+': '+e.message)}}
if(Object.keys(result.series).length<Math.ceil(tickers.length*.8)||!result.series.IMOEX)throw Error('Недостаточное покрытие — предыдущий снимок сохранён');
fs.mkdirSync('data',{recursive:true});fs.writeFileSync('data/latest.json.tmp',JSON.stringify(result));fs.renameSync('data/latest.json.tmp','data/latest.json');console.log('Snapshot saved; errors: '+result.errors.length);
}
main().catch(e=>{console.error(e);process.exitCode=1});
