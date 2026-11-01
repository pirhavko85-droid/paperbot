const fs=require('node:fs');const {advance}=require('../paper-engine.cjs');const config=require('../paper-config.json');
function read(file,optional=false){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){if(optional&&e.code==='ENOENT')return null;throw e}}
const state=advance(read('data/paper-state.json',true),read('data/latest.json'),read('data/dividends.json'),config,new Date(),process.env.PAPER_COMMAND||'run');
fs.writeFileSync('data/paper-state.json.tmp',JSON.stringify(state));fs.renameSync('data/paper-state.json.tmp','data/paper-state.json');
console.log(state.health.status+': '+state.health.reason);if(state.health.status==='blocked')process.exitCode=1;
