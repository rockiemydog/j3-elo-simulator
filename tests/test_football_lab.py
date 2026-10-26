import importlib.util,unittest,tempfile,json
from pathlib import Path
s=importlib.util.spec_from_file_location('fl',Path(__file__).resolve().parents[1]/'scripts/update-football-lab.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def page():
 rows=''.join('<tr><td>'+n+'</td><td>'+('50.7%' if n=='ボール保持率' else '1.3')+'</td><td>10 <span>位</span></td><td>'+('50.0%' if n=='ボール保持率' else '1.4')+'</td></tr>' for n in m.NAMES)
 return '<title>2026/27 シーズンサマリー</title><em class="uiDate">2026.10.23 update</em><table>'+rows+'</table>'
class Tests(unittest.TestCase):
 def test_complete(self):
  d=m.parse(page());self.assertEqual(len(d['metrics']),21);self.assertEqual(d['metrics'][-1]['value'],50.7)
 def test_missing_wrong_season_rank_and_unit_fail(self):
  for html in [page().replace('2026/27','2025'),page().replace('枠内シュート','別項目'),page().replace('10 <span>','21 <span>'),page().replace('50.7%','50.7')]:
   with self.assertRaises(ValueError):m.parse(html)
 def test_unchanged_source_does_not_rewrite_timestamp(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'f.json';self.assertTrue(m.update(page(),p));old=p.read_bytes();self.assertFalse(m.update(page(),p));self.assertEqual(old,p.read_bytes())
 def test_new_data_same_day_updates_and_older_source_is_rejected(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'f.json';m.update(page(),p);self.assertTrue(m.update(page().replace('1.3','1.5'),p));old=p.read_bytes()
   with self.assertRaises(ValueError):m.update(page().replace('2026.10.23','2026.10.22'),p)
   self.assertEqual(old,p.read_bytes())
if __name__=='__main__':unittest.main()
