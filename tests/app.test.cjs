const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('all application scripts parse and modules do not auto-fetch',()=>{
for(const file of ['index.html','research.html','market.html']){
const text=fs.readFileSync(file,'utf8');for(const [,source] of text.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(source,{filename:file});
assert.doesNotMatch(text,/EMBEDDED_|setInterval\(loadQuotes|\}run\(\);|\nloadUniverse\(\);/);
}for(const f of ['data.js','candles.js','center.js','config.js'])new vm.Script(fs.readFileSync(f,'utf8'));
});
test('shared data deduplicates requests, isolates consumers and clears cache',async()=>{
let calls=0;const ctx={structuredClone,AbortSignal,fetch:async()=>{calls++;return {ok:true,json:async()=>({value:3})}}};ctx.window=ctx;ctx.parent=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('data.js','utf8'),ctx);
const [a,b]=await Promise.all([ctx.PaperBotData.json('x'),ctx.PaperBotData.json('x')]);a.value=9;assert.equal(b.value,3);assert.equal(calls,1);ctx.PaperBotData.clear();await ctx.PaperBotData.json('x');assert.equal(calls,2);
});
test('candle loader paginates and deduplicates boundaries',async()=>{
let calls=0;const ctx={Date,Map,Number,encodeURIComponent,PaperBotData:{series:async()=>null,json:async()=>{calls++;return {candles:{columns:['begin','close'],data:calls===1?Array.from({length:500},(_,i)=>['2022-01-01 00:00:00',100]):[['2022-01-02 00:00:00',110]]}}}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('candles.js','utf8'),ctx);const a=await ctx.loadCandles('SBER','2022-01-01','2022-01-02');assert.equal(calls,2);assert.equal(a.length,2);
});
test('SMA uses only prices before execution day and applies commissions',()=>{
const h=fs.readFileSync('research.html','utf8'),source=h.slice(h.indexOf('function simulate('),h.indexOf('async function get('));const ctx={};vm.createContext(ctx);vm.runInContext(source,ctx);const a=Array.from({length:80},(_,i)=>({close:100+i}));const result=ctx.simulate(a);assert.equal(result.eq[59],1);assert.equal(result.trades,1);assert.equal(result.eq[60],.9995);assert.ok(result.ret>0);
});
test('crisis drawdown measures chronological peak-to-trough',()=>{
const h=fs.readFileSync('market.html','utf8'),source=h.slice(h.indexOf('function drawdown('),h.indexOf('async function analyzeAll('));const ctx={};vm.createContext(ctx);vm.runInContext(source,ctx);assert.equal(ctx.drawdown([{close:50},{close:100},{close:60},{close:120}]),-.4);
});
