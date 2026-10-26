"""Fetch the published 21-row Football LAB table; never infer post-match values."""
import datetime as dt,json,re,urllib.request,argparse
from html.parser import HTMLParser
from pathlib import Path
NAMES='ゴール,シュート,枠内シュート,PKによるシュート,パス,クロス,直接フリーキック,間接フリーキック,コーナーキック,スローイン,ドリブル,タックル,クリア,インターセプト,オフサイド,警告,退場,30mライン進入回数,ペナルティエリア進入回数,攻撃回数,ボール保持率'.split(',')
SOURCE='https://www.football-lab.jp/kiky'
class Table(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None
 def handle_starttag(self,tag,attrs):
  if tag=='tr':self.row=[]
  if tag in ('td','th'):self.cell=''
 def handle_data(self,data):
  if self.cell is not None:self.cell+=data
 def handle_endtag(self,tag):
  if tag in ('td','th') and self.cell is not None:
   if self.row is not None:self.row.append(re.sub(r'\s+','',self.cell))
   self.cell=None
  if tag=='tr' and self.row is not None:self.rows.append(self.row);self.row=None

def parse(html):
 if not re.search(r'2026/27.*?シーズンサマリー',html,re.S):raise ValueError('Wrong season')
 date=re.search(r'class="uiDate"[^>]*>(\d{4}\.\d{2}\.\d{2}) update',html)
 if not date:raise ValueError('Missing source date')
 day=dt.datetime.strptime(date[1],'%Y.%m.%d').date()
 if day>dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date():raise ValueError('Future source date')
 table=Table();table.feed(html);metrics=[]
 for name in NAMES:
  rows=[r for r in table.rows if len(r)==4 and r[0]==name]
  if len(rows)!=1:raise ValueError('Missing/duplicate stat: '+name)
  _,value,rank,average=rows[0]
  if not re.fullmatch(r'\d+(?:\.\d+)?%?',value) or not re.fullmatch(r'\d+(?:\.\d+)?%?',average) or not re.fullmatch(r'\d+位',rank):raise ValueError('Malformed stat')
  percent=name=='ボール保持率'
  if value.endswith('%')!=percent or average.endswith('%')!=percent:raise ValueError('Wrong unit')
  v,a=float(value.rstrip('%')),float(average.rstrip('%'));r=int(rank[:-1])
  if not 1<=r<=20 or max(v,a)> (100 if percent else 2000):raise ValueError('Out of range')
  metrics.append(dict(name=name,value=v,average=a,rank=r,unit='%' if percent else '回／試合',display=value,averageDisplay=average))
 return dict(schemaVersion=1,season='2026/27',source=SOURCE,sourceUpdatedOn=day.isoformat(),metrics=metrics)

def update(html,path):
 data=parse(html);old=json.loads(path.read_text()) if path.exists() else None
 if old and data['sourceUpdatedOn']<old['sourceUpdatedOn']:raise ValueError('Older source; keep last good data')
 if old and all(old.get(k)==v for k,v in data.items()):return False
 data['retrievedAt']=dt.datetime.now(dt.timezone.utc).isoformat();tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');tmp.replace(path);return True
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--fixture');args=ap.parse_args()
 if args.fixture:html=Path(args.fixture).read_text()
 else:
  with urllib.request.urlopen(urllib.request.Request(SOURCE,headers={'User-Agent':'Giravanz-personal-stats/1.0'}),timeout=30) as r:raw=r.read(3000001)
  if len(raw)>3000000:raise ValueError('Unexpected response size')
  html=raw.decode('utf-8')
 print('Football LAB changed:',update(html,Path('football-lab-stats.json')))
