// Standalone legacy URLs resolve to the same central application.
if(window===parent)location.replace('./#'+(location.pathname.endsWith('research.html')?'research':'market'));
document.querySelectorAll('a').forEach(a=>a.target='_top');
const stamp=document.getElementById('build-stamp');if(stamp)stamp.remove();
// Give mobile result cards their column labels as rows are replaced by calculations.
function labelTables(){for(const table of document.querySelectorAll('table')){const labels=[...table.querySelectorAll('thead th')].map(x=>x.textContent.trim());for(const row of table.querySelectorAll('tbody tr'))[...row.children].forEach((cell,i)=>{if(cell.getAttribute('data-label')!==labels[i])cell.setAttribute('data-label',labels[i]||'')})}}
labelTables();new MutationObserver(labelTables).observe(document.querySelector('main'),{childList:true,subtree:true});
const warning=document.querySelector('.warning');if(warning&&parent!==window){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Методика и ограничения';warning.before(details);details.append(summary,warning)}
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
