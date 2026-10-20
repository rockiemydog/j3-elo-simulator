"""Collect only public numeric Kitakyushu J3 stats; reject incomplete responses."""
import concurrent.futures
import datetime as dt
import json
import math
import os
import re
import urllib.request
from pathlib import Path

SOURCE = 'https://www.jleague.jp/club/kitakyushu/'
CLUBS = dict(zip(['gifu','ehime','kagoshima','sagamihara','tottori','fosaka','nagano','shiga','kumamoto','tochigi','ryukyu','sanuki','yamaguchi','nara','kochi','kitakyushu','matsumoto','kanazawa','gunma','fukushima'], ['岐阜','愛媛','鹿児島','相模原','鳥取','FC大阪','長野','滋賀','熊本','栃木SC','琉球','讃岐','山口','奈良','高知','北九州','松本','金沢','群馬','福島']))
METRICS = {
    'scorePg': ('1試合平均得点', '点／試合', 20),
    'passCountPg': ('1試合平均パス数', '本／試合', 2000),
    'ballRate': ('平均ボール保持率', '％', 100),
    'airBattleWinCountPg': ('1試合平均空中戦勝利', '回／試合', 200),
    'interceptCount': ('インターセプト総数', '回', 5000),
    'cleanSheet': ('無失点試合総数', '試合', 38),
}
DERIVED = {
    'shotsPg': ('1試合平均シュート数', '本／試合', 100),
    'shotConversion': ('シュート決定率', '％', 100),
    'concededPg': ('1試合平均失点', '点／試合', 30),
    'shotsAgainstPg': ('1試合平均被シュート数', '本／試合', 100),
    'ckPg': ('1試合平均CK数', '本／試合', 50),
    'cleanSheetRate': ('無失点試合率', '％', 100),
}
LOWER_BETTER = {'concededPg', 'shotsAgainstPg'}

def flight_objects(html):
    chunks = []
    for match in re.finditer(r'self\.__next_f\.push\((.*?)\)</script>', html, re.S):
        try:
            value = json.loads(match[1])
            if len(value) > 1 and isinstance(value[1], str):
                chunks.append(value[1])
        except (ValueError, TypeError):
            pass
    def walk(value):
        if isinstance(value, dict):
            yield value
            for child in value.values():
                yield from walk(child)
        elif isinstance(value, list):
            for child in value:
                yield from walk(child)
    for line in ''.join(chunks).splitlines():
        try:
            value = json.loads(line.split(':', 1)[1])
        except (ValueError, IndexError):
            continue
        yield from walk(value)


def number(value, maximum, integer=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= maximum or (integer and int(value) != value):
        raise ValueError('Invalid numeric stat')
    return value


def parse_stats(html, now=None, slug="kitakyushu"):
    now = now or dt.datetime.now(dt.timezone.utc)
    props = next((v for v in flight_objects(html) if v.get('clubId') == slug and 'clubStatsInLeague' in v), None)
    if not props or props.get('leagueName') != 'j3':
        raise ValueError('Missing Kitakyushu J3 stats')
    options = props.get('clubStatsInLeaguePulldown', [])
    if not any(o.get('key') == '2026-68' and o.get('label') == '2026/27' for o in options):
        raise ValueError('Wrong season')
    current = props['clubStatsInLeague'].get('2026-68', {})
    previous = props['clubStatsInLeague'].get('2025-68', {})
    metrics = []
    for key, (label, unit, maximum) in METRICS.items():
        # rawValue is the displayed stat; value is an unexplained radar scale.
        value = number(current.get(key, {}).get('rawValue'), maximum, key in ('interceptCount', 'cleanSheet'))
        prior = previous.get(key, {}).get('rawValue') if key in ('scorePg', 'passCountPg', 'ballRate', 'airBattleWinCountPg') else None
        if prior is not None:
            prior = number(prior, maximum)
        metrics.append(dict(key=key, label=label, unit=unit, value=value, previous=prior))
    games = []
    seen = set()
    for row in props.get('gameLogInClubByYear', {}).get('2026-2', []):
        if row.get('leagueName') != '明治安田Ｊ３':
            continue  # Exclude Levain/Emperor's/Special Season.
        ident = str(row.get('gameId', ''))
        if not re.fullmatch(r'\d{10}', ident) or ident in seen:
            raise ValueError('Duplicate/invalid match ID')
        day = dt.datetime.strptime(row['gameDate'], '%y/%m/%d').date()
        if not dt.date(2026, 8, 8) <= day <= min(now.astimezone(dt.timezone(dt.timedelta(hours=9))).date(), dt.date(2027, 7, 31)) or day.strftime('%Y%m%d') != ident[:8]:
            raise ValueError('Wrong match date')
        seen.add(ident)
        score = row.get('scoreResult') or {}
        opponent = row.get('opponentTeamShortName')
        if opponent not in CLUBS.values() or opponent == CLUBS[slug]:
            raise ValueError('Invalid opponent')
        games.append(dict(id=ident, date=day.isoformat(), opponent=opponent,
                          gf=number(score.get('score'), 30, True), ga=number(score.get('lost'), 30, True),
                          shots=number(row.get('shoot'), 100, True), ck=number(row.get('CK'), 50, True)))
    if not games or len(games) > 38:
        raise ValueError('Missing complete match log')
    games.sort(key=lambda r: (r['date'], r['id']))
    return dict(schemaVersion=2, verified=True, club=CLUBS[slug], season='2026/27', source=SOURCE,
                checkedAt=now.isoformat(), statsUpdatedAt=None, metrics=metrics, matches=games)


def add_derived(clubs):
    """Pair both official match logs before computing any new rate or denominator."""
    pairs = {}
    for slug, club in clubs.items():
        for game in club['matches']:
            pairs.setdefault(game['id'], []).append((CLUBS[slug], game))
    for entries in pairs.values():
        if len(entries) != 2:
            raise ValueError('Incomplete two-club match log')
        (a, ga), (b, gb) = entries
        if ga['opponent'] != b or gb['opponent'] != a or ga['gf'] != gb['ga'] or ga['ga'] != gb['gf'] or ga['date'] != gb['date']:
            raise ValueError('Conflicting two-club match log')
    for slug, club in clubs.items():
        games = club['matches']
        totals = dict(played=len(games), goals=sum(g['gf'] for g in games), conceded=sum(g['ga'] for g in games),
                      shots=sum(g['shots'] for g in games), ck=sum(g['ck'] for g in games),
                      cleanSheets=sum(g['ga'] == 0 for g in games),
                      shotsAgainst=sum(next(g['shots'] for name, g in pairs[game['id']] if name != CLUBS[slug]) for game in games))
        if totals['shots'] == 0:
            raise ValueError('Undefined shot conversion denominator')
        n = totals['played']
        values = dict(shotsPg=totals['shots']/n, shotConversion=100*totals['goals']/totals['shots'],
                      concededPg=totals['conceded']/n, shotsAgainstPg=totals['shotsAgainst']/n,
                      ckPg=totals['ck']/n, cleanSheetRate=100*totals['cleanSheets']/n)
        club['sample'] = dict(**totals, through=max(g['date'] for g in games))
        for key, value in values.items():
            label, unit, maximum = DERIVED[key]
            club['metrics'].append(dict(key=key, label=label, unit=unit, value=number(value, maximum), previous=None))


def save_stats(data, path):
    path = Path(path)
    if path.exists():
        old = json.loads(path.read_text())
        # A source response missing already published matches is not authoritative.
        if not {g['id'] for g in old['matches']}.issubset({g['id'] for g in data['matches']}):
            raise ValueError('Regressing match log; keeping last good stats')
        for club, games in old.get('matchLogs', {}).items():
            if not {g['id'] for g in games}.issubset({g['id'] for g in data.get('matchLogs', {}).get(club, [])}):
                raise ValueError('Regressing league match log; keeping last good stats')
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def collect(fetcher=None):
    now = dt.datetime.now(dt.timezone.utc)
    def fetch(slug):
        if fetcher:
            return parse_stats(fetcher(slug), now, slug)
        request = urllib.request.Request(f'https://www.jleague.jp/club/{slug}/', headers={'User-Agent': 'J3-Team-Stats/1.0'})
        with urllib.request.urlopen(request, timeout=45) as response:
            body = response.read(4_000_001)
        if len(body) > 4_000_000:
            raise ValueError('Oversized source')
        return parse_stats(body.decode('utf-8'), now, slug)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        clubs = dict(zip(CLUBS, pool.map(fetch, CLUBS)))
    add_derived(clubs)
    data = clubs['kitakyushu']
    data['samples'] = {CLUBS[slug]: club['sample'] for slug, club in clubs.items()}
    data['matchLogs'] = {CLUBS[slug]: club['matches'] for slug, club in clubs.items()}
    data['league'] = {}
    for key in {**METRICS, **DERIVED}:
        values = [dict(club=CLUBS[slug], value=next(m['value'] for m in clubs[slug]['metrics'] if m['key'] == key)) for slug in CLUBS]
        for row in values:
            row['rank'] = 1 + sum((other['value'] < row['value']) if key in LOWER_BETTER else (other['value'] > row['value']) for other in values)
            row['tied'] = sum(other['value'] == row['value'] for other in values) > 1
        data['league'][key] = sorted(values, key=lambda row: (row['rank'], list(CLUBS.values()).index(row['club'])))
        own = next(row for row in values if row['club'] == '北九州')
        next(m for m in data['metrics'] if m['key'] == key).update(rank=own['rank'], tied=own['tied'])
    return data


def main():
    data = collect()
    save_stats(data, 'team-stats.json')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as handle:
            handle.write('changed=true\n')
    print(f"Validated {len(data['metrics'])} stats, 20 clubs and {len(data['matches'])} J3 matches")

if __name__ == '__main__':
    main()
