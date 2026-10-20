import copy, datetime as dt, importlib.util, json, pathlib, tempfile, unittest
spec=importlib.util.spec_from_file_location('stats', pathlib.Path(__file__).resolve().parents[1]/'scripts/update-team-stats.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
NOW=dt.datetime(2026,10,20,tzinfo=dt.timezone.utc)
def props(slug='kitakyushu'):
    return dict(clubId=slug,leagueName='j3',clubStatsInLeaguePulldown=[dict(key='2026-68',label='2026/27')],clubStatsInLeague={'2026-68':{k:dict(rawValue=1,value=99) for k in m.METRICS}},gameLogInClubByYear={'2026-2':[dict(gameId=2026101728,gameDate='26/10/17',leagueName='明治安田Ｊ３',scoreResult=dict(score=3,lost=1),opponentTeamShortName='FC大阪',shoot=15,CK=3)]})
def html(p):
    return '<script>self.__next_f.push('+json.dumps([1,'1:'+json.dumps(p,ensure_ascii=False)+'\n'])+')</script>'
def league_fixture(slug):
    names=list(m.CLUBS);i=names.index(slug);j=i^1
    p=props(slug);g=p['gameLogInClubByYear']['2026-2'][0]
    g.update(gameId=int('20261017'+str(10+i//2)),opponentTeamShortName=m.CLUBS[names[j]],shoot=10+i,CK=3)
    g['scoreResult']=dict(score=3 if i%2==0 else 1,lost=1 if i%2==0 else 3)
    return p
def detail_props(key):
    stat=m.DETAILS[key][3]
    return dict(initialParams=dict(category='j3',year='2026-27',stats=stat,club='all'),
                rankingList=[dict(category='j3',stats=dict(value=stat),data=[dict(name=name,score=1) for name in m.FULL_NAMES])],
                pathname=f'/j3/stats/club/2026-27/{stat}/search-list',data=dict(yearLabel='2026/27',statsType='club'),
                className='p-basic-page-header__updated-date',children='更新日: 2026/10/19 17:00')
def detail_fixture(key):return html(detail_props(key))
class StatsTests(unittest.TestCase):
    def test_raw_values_not_radar_scale(self):
        data=m.parse_stats(html(props()),NOW);self.assertTrue(all(r['value']==1 for r in data['metrics']));self.assertIsNone(data['statsUpdatedAt'])
    def test_cup_and_special_seasons_never_mixed(self):
        p=props();p['gameLogInClubByYear']['2026-2'].append(dict(leagueName='ルヴァンカップ',gameId=2026092908));data=m.parse_stats(html(p),NOW);self.assertEqual(len(data['matches']),1)
    def test_missing_invalid_and_negative_values_rejected(self):
        for bad in [None,-1,float('nan'),True,1001]:
            p=props();p['clubStatsInLeague']['2026-68']['scorePg']['rawValue']=bad
            with self.assertRaises(ValueError):m.parse_stats(html(p),NOW)
    def test_wrong_season_and_club_rejected(self):
        for key,value in [('clubId','nara'),('leagueName','j2'),('clubStatsInLeaguePulldown',[])]:
            p=props();p[key]=value
            with self.assertRaises(ValueError):m.parse_stats(html(p),NOW)
    def test_duplicate_and_future_matches_rejected(self):
        p=props();p['gameLogInClubByYear']['2026-2']*=2
        with self.assertRaises(ValueError):m.parse_stats(html(p),NOW)
        p=props();p['gameLogInClubByYear']['2026-2'][0].update(gameId=2027101728,gameDate='27/10/17')
        with self.assertRaises(ValueError):m.parse_stats(html(p),NOW)
    def test_twenty_clubs_and_competition_ranks_with_ties(self):
        def fetch(slug):
            p=league_fixture(slug);value=2 if slug in ['gifu','ehime'] else 1
            for metric in p['clubStatsInLeague']['2026-68'].values():metric['rawValue']=value
            return html(p)
        d=m.collect(fetch,detail_fixture);self.assertEqual(len(d['league']['scorePg']),20);self.assertEqual(d['metrics'][0]['rank'],3);self.assertTrue(d['metrics'][0]['tied']);self.assertEqual([r['rank'] for r in d['league']['scorePg'][:3]],[1,1,3])
    def test_one_failed_club_aborts_collection(self):
        with self.assertRaises(ValueError):m.collect(lambda slug: '<html>missing</html>' if slug=='nara' else html(props(slug)))
    def test_missing_match_cannot_overwrite_previous_file(self):
        d=m.parse_stats(html(props()),NOW)
        with tempfile.TemporaryDirectory() as tmp:
            path=pathlib.Path(tmp)/'stats.json';m.save_stats(d,path);original=path.read_text();bad=copy.deepcopy(d);bad['matches']=[]
            with self.assertRaises(ValueError):m.save_stats(bad,path)
            self.assertEqual(path.read_text(),original)
    def test_malformed_page_rejected(self):
        with self.assertRaises(ValueError):m.parse_stats('<html>no stats</html>',NOW)
    def test_derived_formulas_and_lower_is_better(self):
        d=m.collect(lambda slug:html(league_fixture(slug)),detail_fixture);self.assertEqual(len(d['metrics']),16)
        values={r['key']:r['value'] for r in d['metrics']}
        self.assertEqual(values['shotsPg'],25);self.assertEqual(values['shotConversion'],4)
        self.assertEqual(values['concededPg'],3);self.assertEqual(values['shotsAgainstPg'],24)
        self.assertEqual(values['ckPg'],3);self.assertEqual(values['cleanSheetRate'],0)
        self.assertEqual(values['shotsAgainstTotal'],24)
        self.assertEqual(d['league']['concededPg'][0]['value'],1)
        self.assertEqual(d['league']['concededPg'][-1]['rank'],11)
    def test_missing_counterpart_and_conflicting_scores_abort(self):
        for mutation in ['missing','score']:
            def fetch(slug):
                p=league_fixture(slug)
                if slug=='gifu':
                    if mutation=='missing':p['gameLogInClubByYear']['2026-2'][0]['gameId']=2026101799
                    else:p['gameLogInClubByYear']['2026-2'][0]['scoreResult']['score']=7
                return html(p)
            with self.assertRaises(ValueError):m.collect(fetch)
    def test_zero_shot_denominator_is_not_zero_percent(self):
        def fetch(slug):
            p=league_fixture(slug)
            if slug=='gifu':p['gameLogInClubByYear']['2026-2'][0]['shoot']=0
            return html(p)
        with self.assertRaises(ValueError):m.collect(fetch)
    def test_other_club_regression_preserves_saved_data(self):
        d=m.collect(lambda slug:html(league_fixture(slug)),detail_fixture)
        with tempfile.TemporaryDirectory() as tmp:
            path=pathlib.Path(tmp)/'stats.json';m.save_stats(d,path);original=path.read_text();bad=copy.deepcopy(d);bad['matchLogs']['岐阜']=[]
            with self.assertRaises(ValueError):m.save_stats(bad,path)
            self.assertEqual(path.read_text(),original)
    def test_detail_source_normalizes_names_and_keeps_zero_values(self):
        for key in m.DETAILS:
            p=detail_props(key);p['rankingList'][0]['data'][0].update(name='ＦＣ岐阜',score=0)
            d=m.parse_detail(html(p),key,NOW);self.assertEqual(d['values'][0],dict(club='岐阜',value=0));self.assertEqual(len(d['values']),20)
    def test_detail_wrong_season_metric_or_partial_clubs_rejected(self):
        for change in ['season','metric','partial','duplicate','negative','future','player']:
            p=detail_props('expectedGoals')
            if change=='season':p['initialParams']['year']='2026'
            if change=='metric':p['rankingList'][0]['stats']['value']='expected_goals_against'
            if change=='partial':p['rankingList'][0]['data'].pop()
            if change=='duplicate':p['rankingList'][0]['data'][0]['name']=m.FULL_NAMES[1]
            if change=='negative':p['rankingList'][0]['data'][0]['score']=-1
            if change=='future':p['children']='更新日: 2099/10/20 17:00'
            if change=='player':p['data']['statsType']='player'
            with self.assertRaises(ValueError,msg=change):m.parse_detail(html(p),'expectedGoals',NOW)
    def test_missing_detail_or_conflicting_xg_totals_abort(self):
        def conflicting(key):
            p=detail_props(key)
            if key=='expectedGoals':p['rankingList'][0]['data'][0]['score']=99
            return html(p)
        for fetch in [lambda key:'<html>missing</html>',conflicting]:
            with self.assertRaises(ValueError):m.collect(lambda slug:html(league_fixture(slug)),fetch)
    def test_detail_timestamp_regression_cannot_overwrite(self):
        d=m.collect(lambda slug:html(league_fixture(slug)),detail_fixture)
        with tempfile.TemporaryDirectory() as tmp:
            path=pathlib.Path(tmp)/'stats.json';m.save_stats(d,path);original=path.read_text();bad=copy.deepcopy(d);bad['detailSources']['expectedGoals']['updatedAt']='2026-08-08T00:00:00+09:00'
            with self.assertRaises(ValueError):m.save_stats(bad,path)
            self.assertEqual(path.read_text(),original)
if __name__=='__main__':unittest.main()
