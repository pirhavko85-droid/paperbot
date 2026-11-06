'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {advance}=require('../paper-engine.cjs'),{createStrategy}=require('../strategy-v2.cjs');
const config=require('../paper-config.json');
function read(file,optional=false){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){if(optional&&e.code==='ENOENT')return null;throw e}}
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file)}
function main(){
 const old=read('data/paper-state.json',true),snapshot=read('data/latest.json'),dividends=read('data/dividends.json'),now=new Date(),command=process.env.PAPER_COMMAND||'run';
 const migrate=!!config.experimentId&&old?.experimentId!==config.experimentId;
 if(migrate&&command!=='run')throw Error('Первый запуск нового эксперимента требует run');
 const state=advance(migrate?null:old,snapshot,dividends,config,now,command,createStrategy(snapshot,dividends,config,now));
 if(migrate&&state.health.status!=='ok')throw Error('Новый эксперимент не создан: '+state.health.reason);
 state.experimentId=config.experimentId;
 state.archive='data/archive/experiment-1.json';
 const shadowFile='data/shadow-state.json',stored=read(shadowFile,true),shadows=migrate?{}:(stored?.experiments||{});
 const results={};
 for(const model of ['sma','trend','dip','hold']){
  const settings={...config,model,maxPositions:model==='hold'?18:8,maxDrawdown:model==='hold'?1:config.maxDrawdown};
  results[model]=advance(shadows[model]||null,snapshot,dividends,settings,now,command,createStrategy(snapshot,dividends,settings,now));
 }
 state.comparison=Object.entries(results).map(([model,s])=>({model,status:s.health.status,reason:s.health.reason,lastSession:s.lastSession,portfolios:s.portfolios.map(p=>({start:p.start,value:p.equity.at(-1)?.value??p.start,cash:p.cash,drawdown:p.equity.at(-1)?.drawdown??0,trades:p.ledger.filter(e=>['BUY','SELL'].includes(e.type)).length}))}));
 if(migrate&&old){
  const archive={archivedAt:now.toISOString(),reason:'Новый эксперимент по поручению владельца; прежние убытки и сделки сохранены',state:old,sources:{snapshotSha256:crypto.createHash('sha256').update(fs.readFileSync('data/latest.json')).digest('hex'),dividendsSha256:crypto.createHash('sha256').update(fs.readFileSync('data/dividends.json')).digest('hex')}};
  const archiveFile=state.archive;
  fs.mkdirSync(path.dirname(archiveFile),{recursive:true});
  if(fs.existsSync(archiveFile)){if(JSON.stringify(read(archiveFile).state)!==JSON.stringify(old))throw Error('Архив уже существует с другой историей; перезапись запрещена')}
  else fs.writeFileSync(archiveFile,JSON.stringify(archive),{flag:'wx'});
 }
 write(shadowFile,{experimentId:config.experimentId,updatedAt:now.toISOString(),experiments:results});
 write('data/paper-state.json',state);
 console.log(state.health.status+': '+state.health.reason);if(state.health.status==='blocked')process.exitCode=1;
}
if(require.main===module)main();
module.exports={main};
