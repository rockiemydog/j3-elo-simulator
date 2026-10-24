"""Fetch the official J3 schedule; never infer a postponement from a date."""
import argparse, datetime as dt, json, os, re, urllib.parse, urllib.request
from pathlib import Path
from importlib import import_module
TEAMS = import_module('update-official-results').TEAMS
SEASON_START,SEASON_END=dt.date(2026,8,8),dt.date(2027,7,31)

def parse_schedule(html, all_clubs=False, allow_empty=False):
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
        if not all_clubs and '北九州' not in (h,a): continue
        if h not in TEAMS or a not in TEAMS or h==a or not re.fullmatch(r'\d{10}',ident): raise ValueError('Invalid official fixture')
        day=dt.datetime.strptime(ident[:8],'%Y%m%d').date()
        if not SEASON_START<=day<=SEASON_END: continue
        status={'ticket':'scheduled','before-game':'scheduled','scheduled':'scheduled','game-over':'finished','postponed':'postponed','cancelled':'cancelled','canceled':'cancelled'}.get(x['state'],'unconfirmed')
        time=x.get('time')
        if not isinstance(time,str) or not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d',time): time=None
        rows.append(dict(id=ident,date=day.isoformat(),time=time,home=h,away=a,status=status))
    if not chunks: raise ValueError('Official schedule response is not a valid page')
    if not rows and not allow_empty: raise ValueError('No official Kitakyushu schedule; keep last good file')
    return reconcile_rescheduled(rows)

def reconcile_rescheduled(rows):
    groups={}
    for row in rows: groups.setdefault((row['home'],row['away']),[]).append(row)
    out=[]
    for cards in groups.values():
        if len(cards)==1: out.append(cards[0]);continue
        # Only explicit postponement/cancellation permits replacing the old
        # date. Two active/finished dates are ambiguous: keep last good data.
        active=[r for r in cards if r['status'] not in ('cancelled','postponed')]
        if len(active)!=1 or active[0]['status'] not in ('scheduled','finished'):
            raise ValueError('Duplicate official card')
        current=active[0]
        if any(r['id']==current['id'] or r['date']>=current['date'] for r in cards if r is not current):
            raise ValueError('Ambiguous rescheduled card')
        out.append(current)
    return sorted(out,key=lambda r:(r['date'],r['time'] or '23:59',r['id']))

def month_windows(lo,hi):
    start=lo
    while start<=hi:
        next_month=(start.replace(day=28)+dt.timedelta(days=4)).replace(day=1)
        yield start,min(hi,next_month-dt.timedelta(days=1))
        start=next_month

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--fixture');ap.add_argument('--output',default='official-schedule.json');ap.add_argument('--league-output');args=ap.parse_args()
    # Include past dates so an unresolved cancelled card cannot disappear just
    # because the calendar month changes. Include the full season so month-end
    # forecasts are not artificially limited to the next 100 days.
    lo,hi=SEASON_START,SEASON_END
    if args.fixture: pages=[Path(args.fixture).read_text()]
    else:
        # The official search page limits long result lists. Request one month
        # at a time so the late part of a month/season is never silently lost.
        pages=[]
        for start,end in month_windows(lo,hi):
            query=urllib.parse.urlencode(dict(startdate=start.isoformat(),enddate=end.isoformat(),period='custom'))
            request=urllib.request.Request('https://www.jleague.jp/j3/match/search-list/?'+query,headers={'User-Agent':'J3-results-sync/1.0 (public match schedule)','Accept':'text/html'})
            with urllib.request.urlopen(request,timeout=45) as response: raw=response.read(12_000_001)
            if len(raw)>12_000_000: raise ValueError('Schedule too large')
            pages.append(raw.decode('utf-8'))
    all_rows=[row for html in pages for row in parse_schedule(html,all_clubs=True,allow_empty=True)]
    if not all_rows: raise ValueError('No official league schedule')
    all_rows=reconcile_rescheduled(all_rows)
    if len(all_rows)>380: raise ValueError('Excessive league cards')
    all_rows.sort(key=lambda r:(r['date'],r['time'] or '23:59',r['id']))
    rows=[row for row in all_rows if '北九州' in (row['home'],row['away'])]
    if not rows: raise ValueError('No official Kitakyushu schedule')
    league_changed=False
    if args.league_output:
        league_rows=all_rows
        if {r[k] for r in league_rows for k in ('home','away')}!=set(TEAMS): raise ValueError('League schedule does not cover all 20 clubs')
        results_path=Path('official-results.json')
        if results_path.exists():
            known=json.loads(results_path.read_text()).get('matches',[])
            cards={(r['home'],r['away']) for r in league_rows}
            if any(tuple(r['game'][:2]) not in cards for r in known): raise ValueError('League schedule is missing confirmed cards')
        league_path=Path(args.league_output)
        league_previous=json.loads(league_path.read_text()) if league_path.exists() else None
        if league_previous: league_rows=preserve_unresolved(league_rows,league_previous.get('matches',[]))
        league=dict(verified=True,scope='all-clubs',season='2026/27',source='https://www.jleague.jp/j3/match/',checkedAt=dt.datetime.now(dt.timezone.utc).isoformat(),coverageFrom=lo.isoformat(),coverageThrough=hi.isoformat(),matches=league_rows)
        try:
            age=(dt.datetime.fromisoformat(league['checkedAt'])-dt.datetime.fromisoformat(league_previous['checkedAt'])).total_seconds()
            league_changed=any(league_previous.get(k)!=league[k] for k in ('scope','season','coverageFrom','coverageThrough','matches')) or age>=3600 or age<0
        except (KeyError,TypeError,ValueError): league_changed=True
        if league_changed:
            tmp=league_path.with_suffix('.tmp');tmp.write_text(json.dumps(league,ensure_ascii=False,indent=2)+'\n');tmp.replace(league_path)
    path=Path(args.output)
    previous=json.loads(path.read_text()) if path.exists() else None
    if previous:
        rows=preserve_unresolved(rows,previous.get('matches',[]))
    data=dict(verified=True,season='2026/27',source='https://www.jleague.jp/j3/match/',checkedAt=dt.datetime.now(dt.timezone.utc).isoformat(),matches=rows)
    changed=not previous or any(previous.get(k)!=data[k] for k in ('verified','season','source','matches'))
    # Publish actual fixture changes immediately. Checkpoint successful polls
    # hourly so timestamp-only updates cannot create a deployment every poll.
    try:
        age=(dt.datetime.fromisoformat(data['checkedAt'])-dt.datetime.fromisoformat(previous['checkedAt'])).total_seconds()
        changed=changed or age>=3600 or age<0
    except (KeyError,TypeError,ValueError):changed=True
    if changed:
        tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');tmp.replace(path)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a') as out: out.write(f'changed={str(changed or league_changed).lower()}\n')
    print(f'Official schedule: {len(rows)} Kitakyushu fixtures; changed={changed}')
def preserve_unresolved(rows,previous):
    # The official card switches from the advertised time to the actual
    # kickoff once play starts (e.g. 14:00 -> 14:03). Keep the last observed
    # scheduled time for scoring, separately from the source's actual time.
    # A new scheduled time, date/ID, or explicit cancellation breaks continuity.
    old_by_id={r['id']:r for r in previous}
    for row in rows:
        old=old_by_id.get(row['id'])
        if row['status'] not in ('finished','unconfirmed') or not old: continue
        if any(row[k]!=old[k] for k in ('date','home','away')) or old['status'] in ('postponed','cancelled'): continue
        scheduled=old.get('scheduledTime') or (old.get('time') if old['status']=='scheduled' else None)
        if scheduled: row['scheduledTime']=scheduled
    # Match on official home/away, not the date-based ID which can change when
    # rescheduled. A vanished uncompleted card is unknown, never completed.
    present={(r['home'],r['away']) for r in rows}
    for row in previous:
        if row['status']!='finished' and (row['home'],row['away']) not in present:
            held=dict(row)
            if held['status'] not in ('cancelled','postponed'): held['status']='unconfirmed'
            rows.append(held)
    return sorted(rows,key=lambda r:(r['date'],r['time'] or '23:59',r['id']))
if __name__=='__main__': main()
