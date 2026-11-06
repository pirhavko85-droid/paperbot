'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {createStrategy,features}=require('../strategy-v2.cjs'),{advance}=require('../paper-engine.cjs'),{addDays}=require('../dividends-core.js');
const base=require('../paper-config.json');
const day=n=>addDays('2026-01-01',n),now=n=>new Date(addDays(day(n),1)+'T01:00:00Z');
const config={...base,tickers:['SBERP','MOEX','LKOH','TATN'],starts:[50000],model:'trend'};
function fixture(n=210){return {series:Object.fromEntries(config.tickers.map((t,k)=>[t,Array.from({length:n+1},(_,i)=>({date:day(i),close:100+i*(1+k/10)}))])),responses:{board:{securities:{columns:['SECID','SECTYPE','LOTSIZE'],data:config.tickers.map(t=>[t,'1',1])}}}}}
const div=n=>({generatedAt:now(n).toISOString(),events:[],coverage:Object.fromEntries(config.tickers.map(t=>[t,{status:'available'}]))});
function step(s,n,c=config,snap=fixture(n)){return advance(s,snap,div(n),c,now(n),'run',createStrategy(snap,div(n),c,now(n)))}
test('V2 ignores future candles and future dividend eligibility',()=>{
 const a=fixture(210),b=fixture(220),d=div(210);b.series.SBERP.at(-1).close=999999;
 assert.deepEqual(createStrategy(a,d,config,now(210)).stats,createStrategy(b,{...d,events:[{ticker:'SBERP',lastBuyDate:day(219),amount:999}]},config,now(210)).stats);
});
test('dividend-aware signal index does not interpret a pure dividend gap as price destruction',()=>{
 const c=Array.from({length:202},(_,i)=>({date:day(i),close:i===201?90:100}));
 const f=features(c,[{lastBuyDate:day(200),amount:10}]);assert.equal(f.last,100);assert.equal(f.momentum,0);
});
test('V2 keeps reserve, company and sector caps and ranks signals, not ticker names',()=>{
 const a=step(null,210),scores=a.portfolios[0].pending.map(o=>o.score);assert.ok(scores.every(Number.isFinite));
 const b=step(a,211),p=b.portfolios[0],nav=p.equity.at(-1).value,prices=Object.fromEntries(Object.entries(fixture(211).series).map(([t,c])=>[t,c.at(-1).close]));
 assert.ok(p.cash/nav>=.30);for(const [t,q] of Object.entries(p.positions))assert.ok(q*prices[t]/nav<=.08001);
 for(const group of [['SBERP','MOEX'],['LKOH','TATN']])assert.ok(group.reduce((s,t)=>s+(p.positions[t]||0)*prices[t],0)/nav<=.20001);
 assert.equal(p.ledger.find(e=>e.type==='BUY').ticker,a.portfolios[0].pending.slice().sort((x,y)=>y.score-x.score||x.ticker.localeCompare(y.ticker))[0].ticker);
 assert.deepEqual(step(b,211).portfolios,b.portfolios);
});
test('risk exit forbids buys, creates sells and actually liquidates next session',()=>{
 let s=step(step(null,210),211);s.portfolios[0].peak=100000;
 s=step(s,212);let p=s.portfolios[0];assert.equal(p.riskOff,true);assert.equal(p.paused,false);assert.ok(p.pending.length>0&&p.pending.every(o=>o.side==='sell'));
 s=step(s,213);p=s.portfolios[0];assert.ok(Object.values(p.positions).every(q=>q===0));assert.equal(p.pending.length,0);assert.ok(p.ledger.some(e=>e.type==='SELL'));
});
test('one-time migration archives exact old book and cannot reset on retry',()=>{
 const testRoot=path.resolve('tmp');fs.mkdirSync(testRoot,{recursive:true});const dir=fs.mkdtempSync(path.join(testRoot,'paperbot-migrate-'));fs.mkdirSync(path.join(dir,'data'));
 try{
  const today=new Date(Date.now()+3*3600000).toISOString().slice(0,10),date=addDays(today,-1),series=Object.fromEntries(base.tickers.map(t=>[t,Array.from({length:205},(_,i)=>({date:addDays(date,i-204),close:100+i}))]));
  const snapshot={series,responses:{board:{securities:{columns:['SECID','SECTYPE','LOTSIZE'],data:base.tickers.map(t=>[t,'1',1])}}}},dividends={generatedAt:new Date().toISOString(),events:[],coverage:Object.fromEntries(base.tickers.map(t=>[t,{status:'available'}]))};
  const old=JSON.parse(fs.readFileSync('data/paper-state.json'));delete old.experimentId;
  for(const [f,data] of Object.entries({'paper-state.json':old,'latest.json':snapshot,'dividends.json':dividends}))fs.writeFileSync(path.join(dir,'data',f),JSON.stringify(data));
  const script=path.resolve('scripts/paper.cjs');cp.execFileSync(process.execPath,[script],{cwd:dir,env:{...process.env,PAPER_COMMAND:'run'}});
  const result=JSON.parse(fs.readFileSync(path.join(dir,'data/paper-state.json'))),archive=JSON.parse(fs.readFileSync(path.join(dir,'data/archive/experiment-1.json')));
  assert.deepEqual(archive.state,old);assert.equal(result.experimentId,base.experimentId);assert.ok(result.portfolios.every(p=>p.cash===p.start&&!p.ledger.some(e=>e.type==='BUY')));assert.equal(result.comparison.length,4);
  cp.execFileSync(process.execPath,[script],{cwd:dir,env:{...process.env,PAPER_COMMAND:'run'}});
  const repeat=JSON.parse(fs.readFileSync(path.join(dir,'data/paper-state.json')));assert.deepEqual(repeat.portfolios,result.portfolios);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'data/archive/experiment-1.json'))),archive);
 }finally{assert.equal(path.dirname(path.resolve(dir)),testRoot);fs.rmSync(dir,{recursive:true,force:true})}
});
