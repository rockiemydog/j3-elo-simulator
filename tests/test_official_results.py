import copy,importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('sync',ROOT/'scripts/update-official-results.py');sync=importlib.util.module_from_spec(spec);spec.loader.exec_module(sync)
class OfficialParserTests(unittest.TestCase):
 def html(self,objects):
  payload='1:'+json.dumps(objects,ensure_ascii=False)+'\n'
  return '<script>self.__next_f.push('+json.dumps([1,payload],ensure_ascii=False)+')</script>'
 def game(self,state='game-over',href='/match/j3/2026/100319'):
  return {'id':'2026100319','state':state,'detailHref':href,'homeTeam':{'name':'北九州','score':2},'awayTeam':{'name':'高知','score':0}}
 def test_finished_only(self):
  self.assertEqual(len(sync.parse_html(self.html([self.game()]))),1)
  for state in ['standby','in-progress','first-half','postponed']:
   self.assertEqual(sync.parse_html(self.html([self.game(state=state)])),[])
 def test_cup_excluded(self):self.assertEqual(sync.parse_html(self.html([self.game(href='/match/leaguecup/2026/100319')])),[])
 def test_unknown_club_and_invalid_score_rejected(self):
  for field,value in [('name','未知のクラブ'),('score',None),('score',-1),('score',1.5)]:
   g=self.game();g['homeTeam'][field]=value
   with self.assertRaises(ValueError):sync.parse_html(self.html([g]))
 def test_empty_source_does_not_erase_existing_feed(self):
  data=json.loads((ROOT/'official-results.json').read_text())
  with self.assertRaises(ValueError):sync.validate([],data)
 def test_duplicate_and_missing_existing_matches_rejected(self):
  data=json.loads((ROOT/'official-results.json').read_text());rows=data['matches']
  with self.assertRaises(ValueError):sync.validate(rows+[rows[0]],data)
  with self.assertRaises(ValueError):sync.validate(rows[:-1],data)
 def test_current_feed_is_valid(self):
  data=json.loads((ROOT/'official-results.json').read_text());sync.validate(data['matches'],data)
 def test_invalid_rows_rejected_before_publication(self):
  data=json.loads((ROOT/'official-results.json').read_text())
  for field,value in [('id','bad'),('date','2026-02-30'),('date','2028-01-01'),('date','2026-08-08'),('game',['北九州','高知',True,0]),('game',['未知','高知',0,0]),('game',['北九州','北九州',0,0])]:
   with self.subTest(field=field,value=value):
    rows=copy.deepcopy(data['matches']);rows[-1][field]=value
    with self.assertRaises(ValueError):sync.validate(rows,data)
 def test_duplicate_id_rejected_even_for_different_card(self):
  data=json.loads((ROOT/'official-results.json').read_text());rows=copy.deepcopy(data['matches']);rows[1]['id']=rows[0]['id'];rows[1]['date']=rows[0]['date']
  with self.assertRaises(ValueError):sync.validate(rows,data)
if __name__=='__main__':unittest.main()
