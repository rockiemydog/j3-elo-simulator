"""Fetch the official J3 schedule; never infer a postponement from a date."""
import argparse, datetime as dt, json, os, re, urllib.parse, urllib.request
from pathlib import Path
from importlib import import_module
TEAMS = import_module('update-official-results').TEAMS

def parse_schedule(html):
    chunks = []
    for m in re.finditer(r'self\.__next_f\.push\((.*?)\)</script>', html, re.S):
        try:
            value = json.loads(m[1])
            if len(value)>1 and isinstance(value[1], str): chunks.append(value[1])
        except (ValueError, TypeError): pass
    objects = {}
    def walk(x):
        if isinstance(x, dict):
            if all(k in x for k in ('id','state','homeTeam','awayTeam','detailHref')): objects[str(x['id'])] = x
            for v in x.values(): walk(v)
        elif isinstance(x, list):
            for v in x: walk(v)
    for line in ''.join(chunks).splitlines():
        try: walk(json.loads(line.split(':',1)[1]))
        except (ValueError, IndexError): pass
    rows = []
    for ident, x in objects.items():
        if not re.fullmatch(r'/match/j3/(2026|2027)/\d{6}/?',x['detailHref']): continue
        h,a=x['homeTeam'].get('name'),x['awayTeam'].get('name')
        if '北九州' not in (h,a): continue
        if h not in TEAMS or a not in TEAMS or h==a or not re.fullmatch(r'\d{10}',ident): raise ValueError('Invalid official fixture')
        day=dt.datetime.strptime(ident[:8],'%Y%m%d').date()
        if not dt.date(2026,8,8)<=day<=dt.date(2027,7,31): continue
        status={'ticket':'scheduled','before-game':'scheduled','scheduled':'scheduled','game-over':'finished','postponed':'postponed','cancelled':'cancelled','canceled':'cancelled'}.get(x['state'],'unconfirmed')
        time=x.get('time')
        if not isinstance(time,str) or not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d',time): time=None
        rows.append(dict(id=ident,date=day.isoformat(),time=time,home=h,away=a,status=status))
    if not rows: raise ValueError('No official Kitakyushu schedule; keep last good file')
    keys=[(r['home'],r['away']) for r in rows]
    if len(keys)!=len(set(keys)): raise ValueError('Duplicate official card')
    return sorted(rows,key=lambda r:(r['date'],r['time'] or '23:59',r['id']))

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--fixture');ap.add_argument('--output',default='official-schedule.json');args=ap.parse_args()
    today=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
    lo=max(dt.date(2026,8,8),today.replace(day=1));hi=min(dt.date(2027,7,31),today+dt.timedelta(days=100))
    if lo>hi: raise ValueError('Season has ended')
    if args.fixture: html=Path(args.fixture).read_text()
    else:
        query=urllib.parse.urlencode(dict(startdate=lo.isoformat(),enddate=hi.isoformat(),period='custom'))
        request=urllib.request.Request('https://www.jleague.jp/j3/match/search-list/?'+query,headers={'User-Agent':'J3-results-sync/1.0 (public match schedule)','Accept':'text/html'})
        with urllib.request.urlopen(request,timeout=45) as response: raw=response.read(12_000_001)
        if len(raw)>12_000_000: raise ValueError('Schedule too large')
        html=raw.decode('utf-8')
    rows=parse_schedule(html)
    data=dict(verified=True,season='2026/27',source='https://www.jleague.jp/j3/match/',checkedAt=dt.datetime.now(dt.timezone.utc).isoformat(),matches=rows)
    path=Path(args.output);tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');tmp.replace(path)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a') as out: out.write('changed=true\n')
    print(f'Official schedule: {len(rows)} Kitakyushu fixtures')
if __name__=='__main__': main()
