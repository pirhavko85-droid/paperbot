const fs=require('node:fs');
async function main(){
 const till=new Date().toISOString().slice(0,10);
 const from=new Date(Date.now()-180*86400000).toISOString().slice(0,10);
 const closes={};
 let total;
 for(let start=0;start<(total??1);){
  const url=new URL('https://iss.moex.com/iss/history/engines/stock/markets/index/boards/RTSI/securities/MCFTR.json');
  url.search=new URLSearchParams({from,till,start,'iss.meta':'off','history.columns':'TRADEDATE,SECID,CLOSE'});
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('MCFTR HTTP '+response.status);
  const json=await response.json();
  const rows=json.history.data;
  total=json['history.cursor'].data[0][1];
  if(!rows.length||!Number.isInteger(total))throw Error('Incomplete MCFTR');
  for(const [date,ticker,close] of rows){
   if(ticker!=='MCFTR'||!(close>0)||!Number.isFinite(close)||date in closes)throw Error('Invalid MCFTR row');
   closes[date]=close;
  }
  start+=rows.length;
 }
 if(Object.keys(closes).length<64)throw Error('Short MCFTR series');
 fs.writeFileSync('data/mcftr.json.tmp',JSON.stringify({closes}));
 fs.renameSync('data/mcftr.json.tmp','data/mcftr.json');
}
main().catch(e=>{console.error(e);process.exitCode=1});
