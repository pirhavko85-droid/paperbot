// Standalone legacy URLs resolve to the same central application.
if(window===parent)location.replace('./#'+(location.pathname.endsWith('research.html')?'research':'market'));
document.querySelectorAll('a').forEach(a=>a.target='_top');
const stamp=document.getElementById('build-stamp');if(stamp)stamp.remove();
window.calculationBusy=false;
for(const name of ['stressTest','analyze']){
 const original=window[name];if(!original)continue;
 window[name]=async function(){
 if(calculationBusy||parent.document.getElementById('refresh-main')?.disabled){return}
 calculationBusy=true;const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try{return await original()}catch(e){const el=document.getElementById(name==='stressTest'?'stress-status':'status');el.textContent='Ошибка расчёта: '+e.message}
 finally{calculationBusy=false;buttons.forEach(b=>b.disabled=false)}
 };
}
