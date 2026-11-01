let refreshBusy=false;
function moduleFrame(name){
 let frame=document.getElementById('frame-'+name);
 if(!frame){frame=document.createElement('iframe');frame.id='frame-'+name;frame.title=name==='research'?'Исследование':'Все акции и кризисы';frame.style.cssText='width:100%;height:78vh;border:1px solid #3c527a;border-radius:12px;display:none';frame.ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Модуль не загрузился')),20000);frame.onload=()=>{clearTimeout(timer);resolve(frame.contentWindow)}});frame.src=name+'.html?embedded=1&v=0714-final';document.getElementById('unified-view').append(frame)}
 return frame;
}
function switchTab(tab){
 document.getElementById('legacy-portfolio').style.display=tab==='portfolio'?'':'none';
 document.getElementById('unified-view').style.display=tab==='portfolio'?'none':'';
 document.getElementById('unified-title').textContent=({research:'Исследование',market:'Все акции и кризисы',dividends:'Дивиденды'})[tab]||'';
 document.getElementById('unified-note').textContent=tab==='dividends'?'Источник подтверждённых выплат ещё не подключён. Доходность не рассчитывается.':'';
 if(['research','market'].includes(tab))moduleFrame(tab);
 for(const name of ['research','market']){const f=document.getElementById('frame-'+name);if(f)f.style.display=tab===name?'block':'none'}
 location.hash=tab;
}
async function refreshCenter(mode='live'){
 if(refreshBusy)return;if(['research','market'].some(n=>document.getElementById('frame-'+n)?.contentWindow.calculationBusy)){document.getElementById('refresh-status').textContent='Дождитесь завершения расчёта.';return}refreshBusy=true;const button=document.getElementById('refresh-main'),status=document.getElementById('refresh-status'),details=document.getElementById('refresh-details'),progress=document.getElementById('refresh-progress');
 button.disabled=true;button.style.background='#e8a12a';button.textContent='Идёт обновление…';const started=Date.now();let ok=0;details.textContent='';progress.max=3;progress.value=0;
 try{
 if(mode==='snapshot'){try{const snap=await PaperBotData.snapshot();details.textContent='Снимок MOEX: '+new Date(snap.generatedAt).toLocaleString('ru-RU')+'. Ошибок сбора: '+snap.errors.length+'. ';}catch(e){details.textContent=e.message+'. Доступна ручная загрузка. ';return}}
 else PaperBotData.clear();
 for(const [name,task] of [['Котировки',async()=>{await loadQuotes();if(!quoteValid)throw Error('Цены не подтверждены');if(mode==='snapshot'){quoteValid=false;show('Сохранённый снимок: цены справочные. Для виртуальной сделки нажмите «Обновить всё».')}}],['Список акций',async()=>{const w=await moduleFrame('market').ready;await w.loadUniverse();if(!w.document.getElementById('universeStatus').textContent.includes('Получено'))throw Error('Список не загружен')}],['История',async()=>{const w=await moduleFrame('research').ready;const result=await w.run();if(result.failed)throw Error('Ошибок по акциям: '+result.failed)}]]){
 status.textContent=name+'…';const t=Date.now();try{await task();ok++;details.textContent+='✓ '+name+' '}catch(e){details.textContent+='✗ '+name+': '+e.message+' '}details.textContent+='('+((Date.now()-t)/1000).toFixed(1)+' с). ';progress.value++;
 }
 }finally{status.textContent='Успешно '+ok+'/3 источников · '+((Date.now()-started)/1000).toFixed(1)+' с · '+new Date().toLocaleString('ru-RU')+'. Дивиденды: источник не подключён.';button.disabled=false;button.style.background='';button.textContent='Обновить всё';refreshBusy=false}
}
function stockProgress(done,total,ticker){document.getElementById('refresh-count').textContent='История акций и индекса: '+done+' / '+total+' · '+ticker}
document.querySelectorAll('[data-version]').forEach(el=>el.textContent=PaperBotConfig.version);
render();switchTab(['research','market','dividends'].includes(location.hash.slice(1))?location.hash.slice(1):'portfolio');refreshCenter('snapshot');
