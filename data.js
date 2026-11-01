/* One cache and one in-flight request per URL across all tabs. */
(function(){
if(parent!==window&&parent.PaperBotData){window.PaperBotData=parent.PaperBotData;return}
const cache=new Map(),pending=new Map();let snapshot=null,dividendCache=null;
async function json(url){
 if(snapshot?.responses[url])return structuredClone(snapshot.responses[url]);
 if(cache.has(url))return structuredClone(cache.get(url));
 if(!pending.has(url))pending.set(url,(async()=>{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();cache.set(url,j);return j})().finally(()=>pending.delete(url)));
 return structuredClone(await pending.get(url));
}
window.PaperBotData={json,async dividends(){if(!dividendCache)dividendCache=(async()=>{const r=await fetch('data/dividends.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('История дивидендов недоступна');const j=await r.json();if(j.schema!==1||!Array.isArray(j.events)||!j.coverage)throw Error('Некорректная история дивидендов');return j})().catch(e=>{dividendCache=null;throw e});return structuredClone(await dividendCache)},async series(ticker){return snapshot?.series?.[ticker]||null},clear(){cache.clear();snapshot=null;dividendCache=null},async snapshot(){const r=await fetch('data/latest.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Снимок ещё не опубликован');const s=await r.json();if(s.schema!==1||!s.responses)throw Error('Неверный формат снимка');snapshot=s;return s}};
})();
