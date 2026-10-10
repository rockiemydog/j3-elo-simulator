"""Import only finished 2026/27 J3 fixtures from the J.League official site."""
import argparse, calendar, datetime as dt, json, os, re, sys, time, urllib.parse, urllib.request
from pathlib import Path
TEAMS={'岐阜','愛媛','鹿児島','相模原','鳥取','FC大阪','長野','滋賀','熊本','栃木SC','琉球','讃岐','山口','奈良','高知','北九州','松本','金沢','群馬','福島'}
START=dt.date(2026,8,8)

def parse_html(html):
    chunks=[]
    for m in re.finditer(r'self\.__next_f\.push\((.*?)\)</script>',html,re.S):
        try:
            a=json.loads(m.group(1))
            if len(a)>1 and isinstance(a[1],str):chunks.append(a[1])
        except (ValueError,TypeError):continue
    objects={}
    def walk(x):
        if isinstance(x,dict):
            if all(k in x for k in ('id','state','homeTeam','awayTeam','detailHref')):objects[x['id']]=x
            for v in x.values():walk(v)
        elif isinstance(x,list):
            for v in x:walk(v)
    for line in ''.join(chunks).splitlines():
        try:walk(json.loads(line.split(':',1)[1]))
        except (ValueError,IndexError):continue
    rows=[]
    for x in objects.values():
        if not re.fullmatch(r'/match/j3/(2026|2027)/\d{6}/?',x['detailHref']) or x['state']!='game-over':continue
        ident=str(x['id'])
        if not re.fullmatch(r'\d{10}',ident):raise ValueError('Unexpected official fixture ID')
        date=dt.datetime.strptime(ident[:8],'%Y%m%d').date()
        if date<START:continue
        h,a=x['homeTeam'],x['awayTeam'];hg,ag=h.get('score'),a.get('score')
        if h.get('name')not in TEAMS or a.get('name')not in TEAMS or h['name']==a['name']:raise ValueError('Unknown or identical club')
        if type(hg)is not int or type(ag)is not int or not(0<=hg<=30 and 0<=ag<=30):raise ValueError('Invalid finished score')
        rows.append({'id':ident,'date':date.isoformat(),'game':[h['name'],a['name'],hg,ag]})
    return rows

def validate(rows,previous):
    if not 90<=len(rows)<=380:raise ValueError(f'Unexpected completed count: {len(rows)}')
    keys=set();ids=set();counts={t:0 for t in TEAMS}
    for r in rows:
        ident=r.get('id');date=r.get('date');g=r.get('game')
        if not isinstance(ident,str) or not re.fullmatch(r'\d{10}',ident) or ident in ids:raise ValueError('Invalid or duplicate fixture ID')
        try:day=dt.date.fromisoformat(date)
        except (ValueError,TypeError):raise ValueError('Invalid fixture date')
        if date!=day.isoformat() or not START<=day<=dt.date(2027,7,31) or ident[:8]!=day.strftime('%Y%m%d'):raise ValueError('Fixture date outside season or mismatched ID')
        if not isinstance(g,list) or len(g)!=4 or g[0]not in TEAMS or g[1]not in TEAMS or g[0]==g[1]:raise ValueError('Invalid clubs')
        if any(type(score)is not int or not 0<=score<=30 for score in g[2:]):raise ValueError('Invalid finished score')
        ids.add(ident)
        g=r['game'];key=tuple(g[:2])
        if key in keys:raise ValueError('Repeated home/away fixture')
        keys.add(key);counts[g[0]]+=1;counts[g[1]]+=1
    if max(counts.values())>38:raise ValueError('More than 38 games for a club')
    if previous:
        oldkeys={tuple(r['game'][:2])for r in previous['matches']}
        if not oldkeys<=keys:raise ValueError('Official source is incomplete; keep last good data')

def months(end):
    y,m=START.year,START.month
    while dt.date(y,m,1)<=end:
        lo=max(START,dt.date(y,m,1));hi=min(end,dt.date(y,m,calendar.monthrange(y,m)[1]))
        yield lo,hi
        y,m=(y+1,1)if m==12 else(y,m+1)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--fixture');ap.add_argument('--output',default='official-results.json');args=ap.parse_args()
    path=Path(args.output);previous=json.loads(path.read_text())if path.exists()else None
    if args.fixture:rows=parse_html(Path(args.fixture).read_text())
    else:
        today=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
        if not START<=today<=dt.date(2027,7,31):raise ValueError('Outside configured season; automatic import stopped')
        rows=[]
        for lo,hi in months(today):
            url='https://www.jleague.jp/j3/match/search-list/?'+urllib.parse.urlencode({'startdate':lo.isoformat(),'enddate':hi.isoformat(),'period':'custom'})
            request=urllib.request.Request(url,headers={'User-Agent':'J3-results-sync/1.0 (public match scores)','Accept':'text/html'})
            with urllib.request.urlopen(request,timeout=45)as response:html=response.read(12_000_001)
            if len(html)>12_000_000:raise ValueError('Unexpected page size')
            rows.extend(parse_html(html.decode('utf-8')))
            time.sleep(1)
    rows.sort(key=lambda r:(r['date'],r['id']));validate(rows,previous)
    changed=not previous or previous['matches']!=rows or not previous.get('verified',False)
    if changed:
        data={'verified':True,'schemaVersion':1,'season':'2026/27','source':'https://www.jleague.jp/j3/match/','asOfDate':max(r['date']for r in rows),'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'matches':rows}
        tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');tmp.replace(path)
    print(f'Official J3: {len(rows)} finished matches; changed={changed}')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a')as out:out.write(f'changed={str(changed).lower()}\n')
if __name__=='__main__':main()
