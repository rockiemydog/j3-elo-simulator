import datetime as dt,importlib.util,json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
spec=importlib.util.spec_from_file_location('schedule',Path(__file__).resolve().parents[1]/'scripts/update-official-schedule.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Tests(unittest.TestCase):
 def html(self,rows):return '<script>self.__next_f.push('+json.dumps([1,'0:'+json.dumps(rows,ensure_ascii=False)+'\n'])+')</script>'
 def row(self,state='ticket'):return dict(id='2026101728',state=state,detailHref='/match/j3/2026/101728',homeTeam=dict(name='北九州'),awayTeam=dict(name='FC大阪'),time='14:00')
 def test_statuses_and_time(self):
  for state,expected in [('ticket','scheduled'),('game-over','finished'),('postponed','postponed'),('cancelled','cancelled'),('unknown','unconfirmed')]:self.assertEqual(module.parse_schedule(self.html([self.row(state)]))[0]['status'],expected)
  row=self.row();row['time']='未定';self.assertIsNone(module.parse_schedule(self.html([row]))[0]['time'])
 def test_all_club_scope_preserves_other_cards_and_north_scope(self):
  row=self.row();row['id']='2026101729';row['homeTeam']['name']='愛媛';row['awayTeam']['name']='鹿児島'
  page=self.html([self.row(),row]);self.assertEqual(len(module.parse_schedule(page)),1);self.assertEqual(len(module.parse_schedule(page,all_clubs=True)),2)
 def test_empty_offseason_is_allowed_but_malformed_page_is_not(self):
  self.assertEqual(module.parse_schedule(self.html([]),all_clubs=True,allow_empty=True),[])
  with self.assertRaises(ValueError):module.parse_schedule('<html>Error</html>',all_clubs=True,allow_empty=True)
 def test_monthly_requests_cover_every_day_without_long_search_truncation(self):
  spans=list(module.month_windows(dt.date(2026,8,8),dt.date(2027,1,24)))
  self.assertEqual(len(spans),6);self.assertEqual(spans[0],(dt.date(2026,8,8),dt.date(2026,8,31)));self.assertEqual(spans[-1],(dt.date(2027,1,1),dt.date(2027,1,24)))
  for (_,end),(start,_) in zip(spans,spans[1:]):self.assertEqual(end+dt.timedelta(days=1),start)
 def test_cup_and_unknown_club(self):
  row=self.row();row['detailHref']='/match/leaguecup/2026/101728'
  with self.assertRaises(ValueError):module.parse_schedule(self.html([row]))
  row=self.row();row['awayTeam']['name']='unknown'
  with self.assertRaises(ValueError):module.parse_schedule(self.html([row]))
 def test_duplicate_cards_and_empty_source(self):
  row=self.row();other=self.row();other['id']='2026101828'
  for rows in [[],[row,other]]:
   with self.assertRaises(ValueError):module.parse_schedule(self.html(rows))
 def test_missing_cancelled_card_is_preserved_until_official_completion(self):
  old=dict(id='2026101728',date='2026-10-17',time='14:00',home='北九州',away='FC大阪',status='cancelled')
  self.assertEqual(module.preserve_unresolved([],[old]),[old])
  rescheduled=dict(old,date='2026-11-01',id='2026110128',status='scheduled')
  self.assertEqual(module.preserve_unresolved([rescheduled],[old]),[rescheduled])
  finished=dict(old,status='finished')
  self.assertEqual(module.preserve_unresolved([finished],[old]),[finished])
 def run_import(self,age_seconds=0,old_status='scheduled'):
  with tempfile.TemporaryDirectory() as folder:
   base=Path(folder);fixture=base/'source.html';output=base/'schedule.json';result=base/'step-output'
   fixture.write_text(self.html([self.row()]))
   row=module.parse_schedule(fixture.read_text())[0];row['status']=old_status
   previous=dict(verified=True,season='2026/27',source='https://www.jleague.jp/j3/match/',checkedAt=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(seconds=age_seconds)).isoformat(),matches=[row])
   before=json.dumps(previous,ensure_ascii=False,indent=2)+'\n';output.write_text(before)
   with patch.object(sys,'argv',['sync','--fixture',str(fixture),'--output',str(output)]),patch.dict(os.environ,{'GITHUB_OUTPUT':str(result)}):module.main()
   return before,output.read_text(),result.read_text()
 def test_unchanged_schedule_does_not_republish_on_every_poll(self):
  before,after,result=self.run_import();self.assertEqual(before,after);self.assertEqual(result,'changed=false\n')
 def test_status_change_is_published_immediately(self):
  before,after,result=self.run_import(old_status='cancelled');self.assertNotEqual(before,after);self.assertEqual(json.loads(after)['matches'][0]['status'],'scheduled');self.assertEqual(result,'changed=true\n')
 def test_freshness_is_checkpointed_even_without_fixture_changes(self):
  before,after,result=self.run_import(age_seconds=7200);self.assertNotEqual(before,after);self.assertEqual(result,'changed=true\n')
if __name__=='__main__':unittest.main()
