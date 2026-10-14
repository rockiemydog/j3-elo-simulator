import importlib.util,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
spec=importlib.util.spec_from_file_location('schedule',Path(__file__).resolve().parents[1]/'scripts/update-official-schedule.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Tests(unittest.TestCase):
 def html(self,rows):return '<script>self.__next_f.push('+json.dumps([1,'0:'+json.dumps(rows,ensure_ascii=False)+'\n'])+')</script>'
 def row(self,state='ticket'):return dict(id='2026101728',state=state,detailHref='/match/j3/2026/101728',homeTeam=dict(name='北九州'),awayTeam=dict(name='FC大阪'),time='14:00')
 def test_statuses_and_time(self):
  for state,expected in [('ticket','scheduled'),('game-over','finished'),('postponed','postponed'),('cancelled','cancelled'),('unknown','unconfirmed')]:self.assertEqual(module.parse_schedule(self.html([self.row(state)]))[0]['status'],expected)
  row=self.row();row['time']='未定';self.assertIsNone(module.parse_schedule(self.html([row]))[0]['time'])
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
if __name__=='__main__':unittest.main()
