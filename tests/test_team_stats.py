import copy, datetime as dt, importlib.util, json, pathlib, tempfile, unittest
spec=importlib.util.spec_from_file_location('stats', pathlib.Path(__file__).resolve().parents[1]/'scripts/update-team-stats.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
NOW=dt.datetime(2026,10,20,tzinfo=dt.timezone.utc)
def props(slug='kitakyushu'):
    return dict(clubId=slug,leagueName='j3',clubStatsInLeaguePulldown=[dict(key='2026-68',label='2026/27')],clubStatsInLeague={'2026-68':{k:dict(rawValue=1,value=99) for k in m.METRICS}},gameLogInClubByYear={'2026-2':[dict(gameId=2026101728,gameDate='26/10/17',leagueName='明治安田Ｊ３',scoreResult=dict(score=3,lost=1),opponentTeamShortName='FC大阪',shoot=15,CK=3)]})
def html(p):
    return '<script>self.__next_f.push('+json.dumps([1,'1:'+json.dumps(p,ensure_ascii=False)+'\n'])+')</script>'
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
            p=props(slug);value=2 if slug in ['gifu','ehime'] else 1
            for metric in p['clubStatsInLeague']['2026-68'].values():metric['rawValue']=value
            return html(p)
        d=m.collect(fetch);self.assertEqual(len(d['league']['scorePg']),20);self.assertEqual(d['metrics'][0]['rank'],3);self.assertTrue(d['metrics'][0]['tied']);self.assertEqual([r['rank'] for r in d['league']['scorePg'][:3]],[1,1,3])
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
if __name__=='__main__':unittest.main()
