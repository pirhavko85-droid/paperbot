'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {advance}=require('../paper-engine.cjs');
const {addDays}=require('../dividends-core.js');
const {createPolicy,universe}=require('./reserve-policy.cjs');
const root=path.resolve(__dirname,'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
function replay(snapshot,dividends,config,{from,to,policy=null}={}){
 const indices=Object.fromEntries(config.tickers.map(t=>[t,new Map((snapshot.series[t]||[]).map((x,i)=>[x.date,i]))]));
 for(const t of config.tickers)if(!indices[t].size)throw Error('Нет истории '+t);
 const dates=snapshot.series[config.tickers[0]].map(x=>x.date).filter(d=>d>=from&&d<=to&&config.tickers.every(t=>(indices[t].get(d)??-1)>=60));
 if(!dates.length)throw Error('Нет общего периода с 61 сессией прогрева');
 let state=null;const daily=[],failures=[];
 for(const date of dates){
  const series=Object.fromEntries(config.tickers.map(t=>[t,snapshot.series[t].slice(Math.max(0,indices[t].get(date)-60),indices[t].get(date)+1)]));
  const now=new Date(addDays(date,1)+'T01:00:00Z');
  // Replay clock only. Original source timestamp/hash are preserved in report.
  // Paid dividends are hindsight data and are never used to select securities.
  const replayDividends={...dividends,generatedAt:now.toISOString()};
  state=advance(state,{series,responses:snapshot.responses},replayDividends,config,now,'run',policy);
  if(state.health.status!=='ok'){failures.push({date,...state.health});break}
  daily.push({date,portfolios:state.portfolios.map(p=>({start:p.start,...p.equity.at(-1),positions:Object.values(p.positions).filter(q=>q>0).length,paused:p.paused}))});
 }
 return {from:daily[0]?.date,to:daily.at(-1)?.date,sessions:daily.length,failures,state,daily,summary:state?.portfolios.map(p=>summarize(p,daily))||[]};
}
function summarize(p,daily){
 const rows=daily.map(d=>d.portfolios.find(x=>x.start===p.start)),last=rows.at(-1);
 let peak=p.start,underwater=null,longest=0;
 for(const r of rows){if(r.value>=peak){peak=r.value;underwater=null}else{underwater??=r.date;longest=Math.max(longest,Math.round((Date.parse(r.date)-Date.parse(underwater))/86400000)+1)}}
 return {start:p.start,final:last?.value??p.start,returnPct:((last?.value??p.start)/p.start-1)*100,maxDrawdownPct:Math.min(0,...rows.map(r=>r.drawdown))*100,buyCount:p.ledger.filter(e=>e.type==='BUY').length,sellCount:p.ledger.filter(e=>e.type==='SELL').length,reserveBuys:p.ledger.filter(e=>e.type==='BUY'&&e.reason.startsWith('Резерв:')).length,dividendsCredited:p.ledger.filter(e=>e.type==='DIVIDEND_MODEL_CREDIT').reduce((s,e)=>s+e.net,0),fees:p.ledger.filter(e=>e.type==='BUY'||e.type==='SELL').reduce((s,e)=>s+e.fee,0),maxPositions:Math.max(0,...rows.map(r=>r.positions)),averagePositions:rows.reduce((s,r)=>s+r.positions,0)/(rows.length||1),averageCashPct:rows.reduce((s,r)=>s+r.cash/r.value*100,0)/(rows.length||1),minCashPct:rows.length?Math.min(...rows.map(r=>r.cash/r.value*100)):100,longestUnderwaterCalendarDays:longest,unrecoveredAtEnd:underwater!==null,riskPauseDate:p.ledger.find(e=>e.type==='RISK_PAUSE')?.date||null};
}
function run(){
 const snapshot=read('data/latest.json'),dividends=read('data/dividends.json'),base=read('paper-config.json');
 const cutoff=snapshot.generatedAt.slice(0,10),to=addDays(cutoff,-1);
 const expandedStart=universe.map(t=>snapshot.series[t]?.[60]?.date).sort().at(-1);
 const phases=[{name:'Общий период: первая половина',from:expandedStart,to:'2026-06-30',expanded:true},{name:'Общий период: отложенная проверка',from:'2026-07-01',to,expanded:true},{name:'Пандемия 2020',from:'2020-01-01',to:'2020-12-31'},{name:'Кризисы 2022',from:'2022-01-01',to:'2022-12-31'},{name:'Сентябрь 2022',from:'2022-09-01',to:'2022-12-30'},{name:'2024–2025',from:'2024-01-01',to:'2025-12-31'}];
 const results=[];
 for(const phase of phases){
  const variants=[{name:'A · Текущие: 8 бумаг / до 5 позиций',config:base},{name:'B · Резерв: 8 бумаг / до 10 позиций',config:{...base,maxPositions:10,positionWeight:.07},policy:createPolicy()}];
  if(phase.expanded){variants.push({name:'C · Расширенный список / старые правила',config:{...base,tickers:universe}},{name:'D · Расширенный список / резерв',config:{...base,tickers:universe,maxPositions:10,positionWeight:.07},policy:createPolicy()})}
  for(const v of variants){const r=replay(snapshot,dividends,v.config,{...phase,policy:v.policy});results.push({phase:phase.name,variant:v.name,config:v.config,...r});console.log(phase.name,v.name,r.from,r.to,r.failures.length?'BLOCKED':'OK')}
 }
 const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
 const report={generatedAt:new Date().toISOString(),sources:{snapshotAt:snapshot.generatedAt,dividendsAt:dividends.generatedAt,snapshotSha256:hash('data/latest.json'),dividendsSha256:hash('data/dividends.json'),engineSha256:hash('paper-engine.cjs'),policySha256:hash('research/reserve-policy.cjs')},expandedStart,cutoff:to,results};
 fs.mkdirSync(path.join(__dirname,'results'),{recursive:true});
 fs.writeFileSync(path.join(__dirname,'results/comparison.json'),JSON.stringify(report,null,2));
 const f=n=>n.toFixed(2),lines=['# PaperBot: сравнение правил с резервом','',`Снимок цен: ${snapshot.generatedAt}. Дивиденды: ${dividends.generatedAt}. Текущая дата снимка исключена.`, '', 'Исследовательский прогон; действующие портфели и настройки не изменены. Во всех вариантах используется один движок, сигнал SMA20/60 и исполнение на закрытии следующей сессии. Комиссия 0,05%, проскальзывание 0,1%, налог 0%.', '', '## Правила эксперимента','', 'A — текущие 8 бумаг, до 5 позиций по 15%. B — те же 8 бумаг, до 10 позиций по 7%, резерв. C — 18 бумаг со старыми правилами. D — 18 бумаг с резервом. Везде SBERP, не SBER. Алфавитный приоритет сохранён; рейтинг не используется.', '', 'Резерв: обычная покупка сохраняет 30% денежных средств; докупка — 15%. Ограничения при покупке: компания 10%, отрасль 25%. При просадке портфеля от максимума 5/8/12% открывается суммарный бюджет докупок 5/10/15% капитала на последнем максимуме. Неиспользованный бюджет не тратится принудительно. Для докупки уже имеющейся бумаги нужны одновременно SMA20>SMA60, откат не менее 5% от максимального закрытия за 20 сессий и рост последнего закрытия. Исполнение на следующей сессии. После восстановления максимума начинается новый цикл. Лоты округляются вниз. Рост цен может вывести уже купленную позицию за лимит: принудительной ребалансировки нет.', '', '## Результаты',''];
 for(const phase of phases){
  lines.push('### '+phase.name,'');
  for(const r of results.filter(x=>x.phase===phase.name)){
   lines.push('**'+r.variant+'**','',`Период ${r.from} — ${r.to}, ${r.sessions} сессий.`,'',
    '| Старт, ₽ | Доходность | Макс. просадка | Покупки / продажи | Макс. позиций | Средняя доля денег | Докупки резерва | Дней ниже пика¹ |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|');
   for(const s of r.summary){
    lines.push(`| ${s.start} | ${f(s.returnPct)}% | ${f(s.maxDrawdownPct)}% | ${s.buyCount} / ${s.sellCount} | ${s.maxPositions} | ${f(s.averageCashPct)}% | ${s.reserveBuys} | ${s.longestUnderwaterCalendarDays} |`);
   }
   lines.push('');
   if(r.failures.length)lines.push(`Прогон остановлен ${r.failures[0].date}. ${r.failures[0].reason} Учтены только сессии до ${r.to} включительно.`,'');
   for(const s of r.summary.filter(s=>s.riskPauseDate))lines.push(`Портфель ${s.start} ₽ на паузе с ${s.riskPauseDate}. Переоценка продолжается.`,'');
  }
 }
 lines.push('¹ Максимальная наблюдавшаяся длительность просадки в календарных днях, включая незавершённую на конец периода.','');
 lines.push('## Ограничения интерпретации','','- Это ретроспективная проверка, не доказательство будущей доходности. Отложенная часть запускается с новым капиталом; параметры между частями не подбирались. Это не независимая будущая торговля.','- Текущий список компаний выбран сегодня: есть смещение отбора. Лоты взяты из нынешних спецификаций и могут отличаться от исторических. История корпоративных действий и полнота дивидендов не аудированы.','- Дивиденды включены в капитал как право после последнего дня покупки, в деньги — модельно через 30 дней после реестра. Выплаченные суммы известны ретроспективно, но не используются в сигналах или рейтинге.','- Строгие блокировки движка сохранены. Аномальный скачок цены прекращает прогон, а риск-пауза 15% останавливает заявки, но не ликвидирует позиции и не ограничивает дальнейшие потери. Авторезюмирования нет.','- Общий период расширенного списка начинается после 61-й свечи самой новой бумаги. До этого полный список сравнивать нельзя. Кризис 2008 не включён: у части нынешнего пилота нет истории этого периода.','- JSON рядом содержит ежедневную переоценку, все сделки, дивиденды, комиссии, причины блокировок, время восстановления и SHA-256 входных данных.','- Цена свободного резерва — меньшая экспозиция на растущем рынке. Лимиты отраслей и стоимость лотов могут не позволить набрать 10 позиций.','');
 fs.writeFileSync(path.join(__dirname,'results/comparison.md'),lines.join('\n'));
}
if(require.main===module)run();
module.exports={replay,summarize};
