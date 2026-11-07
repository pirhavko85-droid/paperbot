from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess
ts="SBERP LKOH TATN ROSN GAZP NVTK MOEX MTSS MDMG X5 T YDEX AFLT BANEP DOMRF IRAO CHMF TRNFP SNGSP GMKN PLZL NLMK MAGN MGNT".split()
def get(t):
 issuer={"SBERP":"SBER","BANEP":"BANE","SNGSP":"SNGS"}.get(t,t)
 sources=[('broker','https://brokerintl.ru/s/'+t),('fin','https://smart-lab.ru/q/'+issuer+'/f/q/MSFO/'),('year','https://smart-lab.ru/q/'+issuer+'/f/y/MSFO/')]
 if t in ('SNGSP','BANEP'):sources.append(('ras','https://smart-lab.ru/q/'+issuer+('/f/y/RSBU/' if t=='SNGSP' else '/f/q/RSBU/')))
 for name,url in sources:
  subprocess.run(['curl.exe','-fsSL','--retry','1','--max-time','20',url,'-o','tmp/'+name+'-'+t+'.html'],capture_output=True,check=True)
Path("tmp").mkdir(exist_ok=True)
with ThreadPoolExecutor(5) as pool:list(pool.map(get,ts))
