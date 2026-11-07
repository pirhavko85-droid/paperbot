'use strict';
const {addDays}=require('./dividends-core.js');
const money=n=>Math.round(n*100)/100;
const average=a=>a.reduce((s,x)=>s+x.close,0)/a.length;
const signal=series=>series.length>=60&&average(series.slice(-20))>average(series.slice(-60));
function advance(previous,snapshot,dividends,config,now=new Date(),command='run',researchPolicy=null){
 if(config.mode!=='paper-only')throw Error('Разрешена только виртуальная торговля');
 const state=previous?structuredClone(previous):{schema:1,mode:'paper-only',futureBroker:config.futureBroker,startedAt:now.toISOString(),lastSession:null,status:'active',portfolios:config.starts.map(start=>({start,cash:start,positions:{},pending:[],entitlements:{},ledger:[],equity:[],holdings:{},peak:start,paused:false}))};
 state.updatedAt=now.toISOString();state.settings=structuredClone(config);
 const blocked=reason=>{state.health={status:'blocked',reason};return state};
 if(state.schema!==1||!Array.isArray(state.portfolios)||state.portfolios.length!==config.starts.length)return blocked('Неизвестная схема состояния портфелей');
 for(const p of state.portfolios){if(!Number.isFinite(p.cash)||p.cash<0||!p.positions||Object.entries(p.positions).some(([t,q])=>!config.tickers.includes(t)||!Number.isSafeInteger(q)||q<0))return blocked('Некорректный денежный остаток или позиция; требуется проверка состояния')}
 // A changed universe cancels obsolete orders; it never renames shares or rewrites trades.
 for(const p of state.portfolios){
  const removed=p.pending.filter(order=>!config.tickers.includes(order.ticker));
  p.pending=p.pending.filter(order=>config.tickers.includes(order.ticker));
  for(const order of removed)p.ledger.push({id:p.ledger.length+1,type:'ORDER_CANCELLED',ticker:order.ticker,side:order.side,signalDate:order.signalDate,date:new Date(+now+3*3600000).toISOString().slice(0,10),recordedAt:now.toISOString(),reason:'Бумага исключена из торгового списка; старая заявка отменена'});
 }
 if(command==='pause'||!config.enabled){state.status='paused';state.health={status:'paused',reason:'Виртуальная торговля приостановлена оператором'};return state}
 if(command==='resume'){state.status='active';state.portfolios.forEach(p=>{p.paused=false;p.riskOff=false;p.pending=[];p.riskAnchor=p.equity.at(-1)?.value||p.start});state.lastSession=null;state.resumedAt=now.toISOString()}
 if(state.status==='paused')return blocked('Операторская пауза. Для продолжения нужна команда resume в GitHub Actions.');
 const moscowDate=new Date(+now+3*3600000).toISOString().slice(0,10),series={};
 if(!dividends?.generatedAt||+now-Date.parse(dividends.generatedAt)>7*86400000)return blocked('История дивидендов отсутствует или старше 7 дней');
 for(const t of config.tickers){series[t]=(snapshot.series[t]||[]).filter(x=>x.date<moscowDate);if(series[t].length<61)return blocked('Недостаточно истории '+t);if(series[t].some((x,i)=>!Number.isFinite(x.close)||x.close<=0||(i&&x.date<=series[t][i-1].date)))return blocked('Некорректные цены или порядок истории '+t);if(dividends.coverage[t]?.status!=='available')return blocked('Нет подтверждённого охвата источника дивидендов: '+t)}
 const dates=config.tickers.map(t=>series[t].at(-1).date),date=dates[0];
 if(dates.some(d=>d!==date))return blocked('История инструментов не синхронизирована: '+dates.join(', '));
 if(Date.parse(moscowDate)-Date.parse(date)>7*86400000)return blocked('Биржевые данные старше 7 дней');
 if(state.lastSession===date){state.health={status:'ok',reason:'Сессия '+date+' уже обработана; повторных сделок нет'};return state}
 if(state.lastSession&&state.lastSession>date)return blocked('Источник вернул более старую сессию');
 const block=Object.values(snapshot.responses).find(j=>j.securities?.columns.includes('SECTYPE'))?.securities;if(!block)return blocked('Нет спецификаций лотов');
 const specs=Object.fromEntries(block.data.map(row=>{const x=Object.fromEntries(block.columns.map((c,i)=>[c,row[i]]));return [x.SECID,x]}));
 for(const t of config.tickers){if(!Number.isSafeInteger(specs[t]?.LOTSIZE)||specs[t].LOTSIZE<1)return blocked('Некорректный лот '+t);const c=series[t];if(Math.abs(c.at(-1).close/c.at(-2).close-1)>config.maxDailyPriceJump)return blocked('Аномальное изменение цены / возможное корпоративное действие: '+t)}
 if(state.lastSession&&series[config.tickers[0]].filter(x=>x.date>state.lastSession).length>1){state.status='paused';return blocked('Пропущено несколько сессий. Сделки задним числом запрещены; требуется проверка и resume.')}
 const prices=Object.fromEntries(config.tickers.map(t=>[t,series[t].at(-1).close]));
 for(const p of state.portfolios){
 const log=event=>p.ledger.push({...event,date,id:p.ledger.length+1});
 const receivable=()=>Object.values(p.entitlements).filter(e=>!e.paid).reduce((s,e)=>s+e.gross,0);
 const equity=()=>money(p.cash+Object.entries(p.positions).reduce((s,[t,q])=>s+q*prices[t],0)+receivable());
 // Recognize rights before risk checks: an ex-dividend price gap is not a loss
 // when it is offset by an entitlement. Eligibility uses earlier holdings only.
 // Receivables are not cash and cannot fund an order before modeled payment.
 for(const e of dividends.events){if(!e.lastBuyDate||!config.tickers.includes(e.ticker)||e.lastBuyDate>=date||p.entitlements[e.id])continue;const exDate=series[e.ticker].find(x=>x.date>e.lastBuyDate)?.date;if(!exDate||exDate>date)continue;
 const eligible=p.holdings[e.lastBuyDate]?.[e.ticker]||0;if(!eligible)continue;
 const gross=money(eligible*e.amount),estimatedPaymentDate=addDays(e.recordDate,config.dividendPaymentLagDays);
 p.entitlements[e.id]={eventId:e.id,ticker:e.ticker,qty:eligible,amount:e.amount,gross,recordDate:e.recordDate,estimatedPaymentDate,paid:false,source:e.source};
 log({type:'DIVIDEND_ENTITLEMENT',ticker:e.ticker,qty:eligible,gross,recordDate:e.recordDate,estimatedPaymentDate,reason:'Модель права по позиции на закрытии последнего дня покупки'});
 }
 if(researchPolicy?.managedRisk&&equity()/(p.riskAnchor||p.peak)-1<=-config.maxDrawdown&&!p.riskOff){p.riskOff=true;if(researchPolicy.canReenter)p.exitSignalDate=date;p.pending=p.pending.filter(o=>o.side==='sell');log({type:'RISK_EXIT',reason:'Риск-лимит: покупки запрещены; выходы исполняются на следующей сессии'})}
 if(!researchPolicy?.managedRisk&&!p.paused&&equity()/p.peak-1<=-config.maxDrawdown){p.paused=true;p.pending=[];log({type:'RISK_PAUSE',reason:'Просадка достигла лимита до исполнения заявок; заявки отменены'})}
 // Execute only previously recorded signals, with no backfill and no price from the signal session.
 if(state.lastSession&&!p.paused){
 const orders=[...p.pending].sort((a,b)=>(a.side==='sell'?0:1)-(b.side==='sell'?0:1)||(b.score??0)-(a.score??0)||a.ticker.localeCompare(b.ticker));
 for(const order of orders){const t=order.ticker,lot=specs[t].LOTSIZE;let qty=0;const price=Math.round(prices[t]*(order.side==='buy'?1+config.slippage:1-config.slippage)*1e6)/1e6;
 if(order.side==='buy'&&(p.positions[t]||0)>0&&!(researchPolicy&&order.reserve)){log({type:'SKIP',ticker:t,code:'ALREADY_HELD',reason:'Позиция уже открыта; докупка не предусмотрена',signalDate:order.signalDate});continue}
 if(order.side==='buy'&&!(p.positions[t]>0)&&Object.values(p.positions).filter(q=>q>0).length>=config.maxPositions){log({type:'SKIP',ticker:t,code:'POSITION_LIMIT',reason:'Заняты все '+config.maxPositions+' мест; новая покупка возможна после продажи позиции',signalDate:order.signalDate});continue}
 if(order.side==='sell')qty=p.positions[t]||0;
 else if((researchPolicy&&order.reserve)||(!(p.positions[t]>0)&&Object.values(p.positions).filter(q=>q>0).length<config.maxPositions)){const budget=researchPolicy?researchPolicy.budget({p,order,prices,price,equity:equity(),series,date,config}):Math.min(equity()*config.positionWeight,p.cash);if(!Number.isFinite(budget)||budget<0)throw Error('Некорректный исследовательский бюджет');qty=Math.floor(budget/(price*(1+config.commission)*lot))*lot}
 if(qty<=0){log({type:'SKIP',ticker:t,code:order.side==='buy'?'LOT_BUDGET':'NO_POSITION',reason:order.side==='buy'?'Бюджета покупки с учётом комиссии недостаточно на один биржевой лот':'Нет открытой позиции для продажи',signalDate:order.signalDate});continue}
 const notional=money(qty*price),fee=money(notional*config.commission);
 if(order.side==='buy'&&notional+fee>p.cash){log({type:'SKIP',ticker:t,reason:'Недостаточно средств с учётом комиссии'});continue}
 p.cash=money(p.cash+(order.side==='buy'?-notional-fee:notional-fee));p.positions[t]=(p.positions[t]||0)+(order.side==='buy'?qty:-qty);
 log({type:order.side==='buy'?'BUY':'SELL',ticker:t,qty,price,fee,signalDate:order.signalDate,reason:order.reason});
 if(researchPolicy)researchPolicy.executed({p,order,notional,fee,date});
 }
 }
 p.pending=[];p.holdings[date]=structuredClone(p.positions);
 // Source has last eligible buy date, not actual payment dates. Entitlements survive later sales.
 for(const e of Object.values(p.entitlements)){if(!e.paid&&e.estimatedPaymentDate<=date){const tax=money(e.gross*config.taxRate);p.cash=money(p.cash+e.gross-tax);e.paid=true;log({type:'DIVIDEND_MODEL_CREDIT',ticker:e.ticker,gross:e.gross,tax,net:money(e.gross-tax),reason:'Расчётное зачисление; фактическая дата выплаты неизвестна'})}}
 const value=equity();p.peak=Math.max(p.peak,value);if(p.riskAnchor)p.riskAnchor=Math.max(p.riskAnchor,value);const dd=value/p.peak-1;
 if(dd<=-config.maxDrawdown&&!p.paused&&!researchPolicy?.managedRisk){p.paused=true;log({type:'RISK_PAUSE',reason:'Достигнут предел просадки; новые заявки остановлены, позиции сохранены',drawdown:dd})}
 if(p.riskOff&&p.exitSignalDate&&!p.paused&&!Object.values(p.positions).some(q=>q>0)&&researchPolicy?.canReenter?.(date,p.exitSignalDate)){
  p.riskOff=false;p.riskAnchor=value;
  log({type:'REENTRY_SIGNAL',reason:'Пять закрытий MCFTR выше SMA60 после защитного выхода'});
 }
 if(!p.paused){for(const t of config.tickers){const held=(p.positions[t]||0)>0,bullish=researchPolicy?.signal?researchPolicy.signal({ticker:t,held,p,series,date}):signal(series[t]);if(bullish===held)continue;const side=bullish?'buy':'sell';const order={ticker:t,side,signalDate:date,reason:researchPolicy?.reason?researchPolicy.reason(side):bullish?'SMA20 выше SMA60':'SMA20 не выше SMA60',...(researchPolicy?.score?{score:researchPolicy.score(t)}:{}),...(researchPolicy?.metadata?researchPolicy.metadata(t):{})};p.pending.push(order);log({type:'SIGNAL',...order})}}
 if(researchPolicy&&!p.paused){for(const order of researchPolicy.orders({p,prices,series,date,config,equity:value})){p.pending.push(order);log({type:'SIGNAL',...order})}}
 p.equity.push({date,value,cash:p.cash,receivable:money(receivable()),drawdown:dd});
 }
 state.lastSession=date;state.health={status:'ok',reason:'Обработана завершённая сессия '+date};return state;
}
module.exports={advance,signal};
