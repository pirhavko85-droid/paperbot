from pathlib import Path
import re,json,html,statistics,datetime
D=Path('tmp')
def clean(s):return ' '.join(html.unescape(re.sub('<[^>]+>',' ',s)).split())
def num(s):
 try:return float(s.replace(' ','').replace(',','.').replace('−','-').replace('₽',''))
 except ValueError:return None
def cells(s):return re.findall(r'<td\b[^>]*>(.*?)</td>',s,re.S|re.I)
def read(k,t):
 p=D/(k+'-'+t+'.html');return p.read_text(encoding='utf8') if p.exists() else ''
def financial(t,k):
 s=read(k,t); h=re.search(r'<tr class="header_row">(.*?)</tr>',s,re.S)
 if not h:return []
 cols=[clean(c) for c in cells(h[1])]
 rows={f:cells(r) for f,r in re.findall(r'<tr field="([^"]+)">(.*?)</tr>',s,re.S)}
 out=[]
 for i,period in enumerate(cols):
  if not re.fullmatch(r'20\d\d(?:Q[1-4])?',period) or period>'2026Q3' or period=='2026':continue
  def cell(key):return (rows.get(key,[])+['']*len(cols))[i]
  profit=num(clean(cell('net_income')))
  if profit is None:continue
  dt=clean(cell('date'))
  if dt and re.fullmatch(r'\d\d\.\d\d\.\d{4}',dt) and datetime.datetime.strptime(dt,'%d.%m.%Y').date()>datetime.date(2026,11,7):continue
  href=re.search(r'href="(https?://[^"]+)',cell('report_url'))
  out.append(dict(period=period,profit=profit,date=dt,link=html.unescape(href[1]) if href else '',currency=clean(cell('currency')),revenue=num(clean(cell('revenue'))),fcf=num(clean(cell('fcf')))))
 return out
def forecasts(t):
 out={}
 for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>',read('broker',t),re.S):
  c=[clean(x) for x in cells(row)]
  if len(c)<4 or not re.fullmatch(r'\d{2}\.\d{2}\.\d{2}',c[0]):continue
  dt=datetime.datetime.strptime(c[0],'%d.%m.%y').date()
  if not datetime.date(2026,5,7)<=dt<=datetime.date(2026,11,7):continue
  name=c[1].split(' (')[0];target=num(c[3])
  if name not in out or out[name][0]<dt:out[name]=(dt,c[2],target)
 return out
series=json.loads(Path('data/latest.json').read_text(encoding='utf8'))['series']
ts=[t for t in series if t not in ('SBER','IMOEX')]
esc=html.escape
def fmt(v):return '—' if v is None else f'{v:,.2f}'.replace(',',' ').replace('.',',')
cards=[];overview=[]
for t in ts:
 issuer={'SBERP':'SBER','BANEP':'BANE','SNGSP':'SNGS'}.get(t,t)
 qs=financial(t,'fin');ys=financial(t,'year')
 candles=[c for c in series[t] if c['date']<='2026-11-06'][-252:];price=candles[-1]['close'];dd=(price/max(c['close'] for c in candles)-1)*100
 forecasts_t=forecasts(t);targets=[x[2] for x in forecasts_t.values() if x[2] and x[2]>0];med=statistics.median(targets) if targets else None
 text='';status='Нет подтверждённой прибыли'
 if t=='SBERP' and qs and qs[-1]['period']=='2026Q3':
  qs[-1]['profit']=510.8;qs[-1]['link']='https://www.sberbank.com/ru/investor-relations/groupresults/msfo/msfo_2026_results_of_work_q3'
 for records in sorted([v for v in [ys,qs] if v],key=lambda v:v[-1]['period'][:4]+(v[-1]['period'][4:] or 'Q4')):
  if not records:continue
  r=records[-1];prior=next((x for x in records if x['period']==str(int(r['period'][:4])-1)+r['period'][4:]),None)
  status='Убыток' if r['profit']<0 else 'Прибыль положительная'
  if prior and r['profit']>0:status='Прибыль растёт' if r['profit']>prior['profit'] else 'Прибыль снизилась'
  def metric(key):return fmt(r[key])+(' против '+fmt(prior[key])+' годом ранее' if prior and prior[key] is not None else '')
  text+='<p><b>'+r['period']+'</b> · чистая прибыль '+metric('profit')+' млрд '+esc(r['currency'] or 'валюты отчёта')+'. '
  if r['revenue'] is not None:text+='Выручка '+metric('revenue')+'. '
  if r['fcf'] is not None:text+='Свободный денежный поток '+metric('fcf')+'. '
  if r['link']:text+='<a href="'+esc(r['link'],quote=True)+'">Отчёт эмитента</a>'
  text+='</p>'
 if t=='YDEX':
  status='Прибыль растёт'
  text=text.replace('чистая прибыль','прибыль в таблице агрегатора').replace('2026Q3</b> · прибыль в таблице агрегатора','2026Q3</b> · скорректированная прибыль')
  text+='<p>По отчёту компании прибыль по МСФО составила 42,5 против 34,6 млрд ₽ (+23%). Скорректированная прибыль выросла на 2%. <a href="https://ir.yandex.ru/financial-releases?report=q3&amp;year=2026">Релиз Яндекса</a></p>'
 if t in ('BANEP','SNGSP'):
  ras=financial(t,'ras')
  if ras:
   rr=ras[-1]
   if t=='SNGSP':status=('Убыток' if rr['profit']<0 else 'Прибыль положительная')+' · РСБУ '+rr['period']
   text+='<p>Отдельно по РСБУ за '+rr['period']+' прибыль '+fmt(rr['profit'])+' млрд ₽. <a href="https://smart-lab.ru/q/'+issuer+'/f/'+('y' if t=='SNGSP' else 'q')+'/RSBU/">Таблица РСБУ</a></p>'
  else:status='Требуется свежее раскрытие'
 if t=='SBERP':status='Прибыль растёт';text+='<p>Сбер сообщил 510,8 млрд ₽ прибыли и рост 13,9% год к году за III квартал. Для этой цифры использована публикация банка.</p>'
 if t=='MGNT':text+='<p>За первое полугодие убыток группы составил 9,5 млрд ₽. <a href="https://www.finam.ru/publications/item/chto-ne-tak-s-magnitom-20260831-1220/">Разбор Финама 31 августа</a> · <a href="https://www.magnit.com/ru/disclosure/financial-statements/">Раскрытие Магнита</a></p>'
 if t=='SBERP':text=text.replace('510,80 против 449,80 годом ранее','510,80')
 opinion=' · '.join(f'{esc(b)} ({v[0]:%d.%m}): {esc(v[1])}, {fmt(v[2])} ₽' for b,v in forecasts_t.items())
 targets_desc=f'Медиана {fmt(med)} ₽ ({fmt((med/price-1)*100)}% к закрытию), диапазон {fmt(min(targets))}–{fmt(max(targets))} ₽.' if med else 'Подтверждённых целей для этого класса акций в таблице нет.'
 if status.startswith('Убыток'):
  assessment='Проверить источник убытка и способность финансировать деятельность до рассмотрения покупки на снижении.'
 elif status=='Прибыль растёт' and dd<=-20:
  assessment='Цена существенно ниже пика при росте прибыли. Кандидат для углублённой проверки устойчивости маржи и денежного потока.'
 elif 'снизилась' in status:
  assessment='Снижение прибыли ослабляет тезис о временной просадке. Проверить динамику следующего отчётного периода.'
 elif dd>-10:
  assessment='Цена близка к годовому максимуму. Глубокая ценовая просадка по этому ориентиру отсутствует.'
 else:
  assessment='Для вывода о восстановлении нужны сопоставимая динамика прибыли и подтверждение денежным потоком.'
 text+='<p><b>Что проверить для стратегии.</b> '+assessment+'</p>'
 overview.append(f'<tr><td><a href="#{t}">{t}</a></td><td>{status}</td><td>{fmt(dd)}%</td><td>{len(targets)}</td></tr>')
 cards.append(f'<article id="{t}"><h2>{t} · {status}</h2>{text}<p>Закрытие {candles[-1]["date"]}: {fmt(price)} ₽. От максимума за {len(candles)} сессии {fmt(dd)}% по цене, без дивидендов.</p><p>{targets_desc}</p><p>{opinion}</p><a href="https://smart-lab.ru/q/{issuer}/f/q/MSFO/">Квартальная таблица</a> · <a href="https://smart-lab.ru/q/{issuer}/f/y/MSFO/">Годовая таблица</a> · <a href="https://brokerintl.ru/s/{t}">Оценки брокеров</a></article>')
 print(t,ys[-1]['period'] if ys else '-',qs[-1]['period'] if qs else '-',status,len(targets),fmt(dd))
Path('issuer-review.html').write_text('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PaperBot · Компании и брокеры</title><style>html{color-scheme:dark}body{background:#10151d;color:#e2e8ef;font:16px/1.5 system-ui;max-width:880px;margin:auto;padding:16px}a{color:#83d3fb}article{border-top:1px solid #415263;padding:10px 0}td,th{padding:5px;text-align:left}table{font-size:14px}</style><a href="index.html#more">← PaperBot</a><h1>Компании и оценки брокеров</h1><p>Срез на 7 ноября 2026 года. Статус отражает знак и динамику чистой прибыли последнего доступного периода относительно того же периода прошлого года. Разовый доход, переоценка или низкая база могут изменить вывод. Для полугодовой отчётности квартальные данные агрегатора могут быть расчётными. Периоды приведены явно.</p><p>Мнения брокеров приведены по открытой сводке BrokerIntl за последние полгода. Горизонты оценок могут различаться. Медиана и разница с котировкой показывают разброс ожиданий, а не месячную доходность. При отсутствии прогноза по префам оценка обыкновенных акций не подставляется. Источник цен — снимок MOEX проекта.</p><table><tr><th>Акция</th><th>Бизнес</th><th>От пика</th><th>Целей</th></tr>'+''.join(overview)+'</table>'+''.join(cards)+'</html>',encoding='utf8')
