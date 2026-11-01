(function(root){
'use strict';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number.isFinite(n)?n.toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽':'—';
const percent=n=>Number.isFinite(n)?(n>0?'+':'')+(n*100).toFixed(2).replace('.',',')+'%':'—';
function timestamp(iso,full=false){if(!iso||!Number.isFinite(Date.parse(iso)))return 'Нет данных';return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',...(full?{year:'numeric'}:{}),hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date(iso))+' МСК'}
function session(date){return /^\d{4}-\d{2}-\d{2}$/.test(date||'')?date.split('-').reverse().join('.'):'—'}
function rows(block){if(!block?.columns||!Array.isArray(block.data))return [];return block.data.map(r=>Object.fromEntries(block.columns.map((c,i)=>[c,r[i]])))}
function board(snapshot){return Object.values(snapshot?.responses||{}).find(j=>j.securities?.columns.includes('SECTYPE'))?.securities}
function price(snapshot,ticker,asof,live){if(Number.isFinite(live?.[ticker])&&live[ticker]>0)return live[ticker];const today=new Date(Date.now()+3*3600000).toISOString().slice(0,10);const last=(snapshot?.series?.[ticker]||[]).filter(c=>c.date<today&&(!asof||c.date<=asof)).at(-1);return Number.isFinite(last?.close)?last.close:null}
const names={SBER:'Сбербанк',SBERP:'Сбербанк-п',LKOH:'Лукойл',TATN:'Татнефть',ROSN:'Роснефть',GAZP:'Газпром',NVTK:'Новатэк',MOEX:'Мосбиржа',MTSS:'МТС',PLZL:'Полюс',GMKN:'Норникель'};
function validatePaper(s){if(s?.schema!==1||s.mode!=='paper-only'||!Array.isArray(s.portfolios)||s.portfolios.length!==3)throw Error('Неверный формат виртуальных портфелей');if(![50000,100000,500000].every(start=>s.portfolios.some(p=>p.start===start)))throw Error('Неверный набор портфелей');for(const p of s.portfolios)if(!Number.isFinite(p.cash)||p.cash<0||!p.positions||!Array.isArray(p.pending)||!Array.isArray(p.ledger)||!Array.isArray(p.equity))throw Error('Повреждены данные портфеля');return s}
function ledger(p,filter='all'){const events=p?.ledger||[];return events.filter(e=>filter==='all'||(filter==='signals'?e.type==='SIGNAL':filter==='trades'?['BUY','SELL'].includes(e.type):String(e.type||'').startsWith('DIVIDEND'))).slice().reverse()}
function selected(paper,start){return paper?.portfolios.find(p=>p.start===start)||null}
const api={escape,money,percent,timestamp,session,rows,board,price,names,validatePaper,ledger,selected};if(typeof module!=='undefined')module.exports=api;else root.PaperBotMobile=api;
})(globalThis);
