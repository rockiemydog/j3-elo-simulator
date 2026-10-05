import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('notify', ROOT / 'scripts/notify-official-results.py')
notify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notify)


class NotificationTests(unittest.TestCase):
    def setUp(self):
        self.before = json.loads((ROOT / 'official-results.json').read_text())
        self.after = copy.deepcopy(self.before)

    def message(self, test=False):
        return notify.compose(self.before, self.after, 'sender@example.com', 'sender@example.com', test=test)

    def test_no_change_and_metadata_only_do_not_email(self):
        self.assertIsNone(self.message())
        self.after['updatedAt'] = 'changed'
        self.after['verified'] = not self.after['verified']
        self.assertIsNone(self.message())

    def test_new_result_and_points(self):
        self.after['matches'].append({'date': '2026-10-11', 'game': ['北九州', '奈良', 2, 1]})
        self.after['asOfDate'] = '2026-10-11'
        message = self.message()
        self.assertIn('確定91試合', message['Subject'])
        self.assertIn('北九州：10試合・勝点13（3勝4分3敗）', message.get_content())
        self.assertIn('（新規）', message.get_content())

    def test_score_correction_and_away_direction(self):
        row = next(r for r in self.after['matches'] if r['game'][:2] == ['相模原', '北九州'])
        row['game'][2:] = [3, 1]
        message = self.message()
        self.assertIn('勝点7', message['Subject'])
        self.assertIn('（訂正前 1–2）', message.get_content())

    def test_removed_fixture_is_rejected(self):
        self.after['matches'].pop()
        with self.assertRaises(ValueError):
            self.message()

    def test_explicit_test_sends_without_score_changes(self):
        message = self.message(test=True)
        self.assertTrue(message['Subject'].startswith('【テスト】'))
        self.assertIn('試合結果の変更はありません', message.get_content())
        self.assertEqual(message['To'], 'sender@example.com')

    def test_recipient_can_differ_from_gmail_sender(self):
        message = notify.compose(self.before, self.after, 'sender@gmail.com', 'recipient@me.com', test=True)
        self.assertEqual(message['From'], 'sender@gmail.com')
        self.assertEqual(message['To'], 'recipient@me.com')


if __name__ == '__main__':
    unittest.main()
