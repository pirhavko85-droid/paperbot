async function loadCandles(ticker,from,to){
 const till=to||new Date().toISOString().slice(0,10),begin=from||new Date(Date.now()-5*365*86400000).toISOString().slice(0,10);
 const root=ticker==='IMOEX'?'https://iss.moex.com/iss/engines/stock/markets/index/boards/SNDX/securities/IMOEX/candles.json':'https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/'+encodeURIComponent(ticker)+'/candles.json';
 // A published full-history series can also serve any crisis window.
 const saved=await PaperBotData.series(ticker);
 if(saved)return saved.filter(x=>x.date>=begin&&x.date<=till);
 const rows=[];for(let start=0;start<20000;start+=500){const j=await PaperBotData.json(root+'?iss.meta=off&from='+begin+'&till='+till+'&interval=24&start='+start),b=j.candles;if(!b?.columns||!Array.isArray(b.data))throw Error('Нет таблицы свечей');for(const r of b.data){const x=Object.fromEntries(b.columns.map((k,i)=>[k,r[i]]));if(Number.isFinite(x.close)&&x.close>0&&x.begin)rows.push({date:x.begin.slice(0,10),close:x.close})}if(b.data.length<500)return [...new Map(rows.map(x=>[x.date,x])).values()].sort((a,b)=>a.date.localeCompare(b.date))}throw Error('Превышен лимит страниц истории');
}
