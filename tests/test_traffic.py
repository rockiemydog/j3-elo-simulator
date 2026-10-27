import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from cryptography.exceptions import InvalidTag

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('traffic', ROOT / 'scripts/collect-traffic.py')
t = importlib.util.module_from_spec(spec)
spec.loader.exec_module(t)
PASSWORD = 'test-only-random-password-9764'
NOW = '2026-10-27T00:37:00Z'
REPO = 'rockiemydog/j3-elo-simulator'


def payload():
    return {
        'views': {'count': 13, 'uniques': 4, 'views': [
            {'timestamp': '2026-10-26T00:00:00Z', 'count': 10, 'uniques': 3},
            {'timestamp': '2026-10-27T00:00:00Z', 'count': 3, 'uniques': 2}]},
        'clones': {'count': 2, 'uniques': 1, 'clones': [
            {'timestamp': '2026-10-26T00:00:00Z', 'count': 2, 'uniques': 1}]},
        'referrers': [{'referrer': '<img src=x onerror=alert(1)>', 'count': 3, 'uniques': 1}],
        'paths': [{'path': '/rockiemydog/j3-elo-simulator', 'count': 7, 'uniques': 2}]}


class TrafficTests(unittest.TestCase):
    def test_overlap_replaces_and_preserves_older_history(self):
        previous = t.merge(None, payload(), NOW, REPO)
        previous['days']['2026-09-01'] = {'views': {'count': 99, 'uniques': 9}}
        updated = payload()
        updated['views']['views'][0]['count'] = 5
        result = t.merge(previous, updated, NOW, REPO)
        self.assertEqual(result['days']['2026-10-26']['views']['count'], 5)
        self.assertEqual(result['days']['2026-09-01']['views']['count'], 99)
        self.assertEqual(previous['days']['2026-10-26']['views']['count'], 10)
        self.assertEqual(len(result['snapshots']), 1)
        self.assertEqual(result['snapshots']['2026-10-27']['views']['uniques'], 4)
        self.assertNotIn('clones', result['days']['2026-10-27'])

    def test_encryption_roundtrip_and_wrong_password_fail_closed(self):
        data = t.merge(None, payload(), NOW, REPO)
        envelope = t.encrypt(data, PASSWORD)
        self.assertEqual(t.decrypt(envelope, PASSWORD), data)
        with self.assertRaises(InvalidTag):
            t.decrypt(envelope, 'wrong-password-123456')
        broken = copy.deepcopy(envelope)
        broken['ciphertext'] = broken['ciphertext'][::-1]
        with self.assertRaises(Exception):
            t.decrypt(broken, PASSWORD)
        self.assertNotEqual(envelope, t.encrypt(data, PASSWORD))
        html = t.render(envelope)
        self.assertNotIn(PASSWORD, html)
        self.assertNotIn('<img src=x', html)
        self.assertNotIn(NOW, html)
        self.assertIn("default-src 'none'", html)
        self.assertNotIn('fetch(', html)
        self.assertNotIn('localStorage', html)

    def test_short_password_rejected(self):
        with self.assertRaises(ValueError):
            t.encrypt({}, 'short')

    def test_invalid_counts_timestamps_and_repository_rejected(self):
        for field, value in [('count', -1), ('count', True), ('uniques', 999)]:
            bad = payload()
            bad['views']['views'][0][field] = value
            with self.assertRaises(ValueError):
                t.merge(None, bad, NOW, REPO)
        for stamp in ['2026-10-28T00:00:00Z', '2026-10-26T01:00:00Z', 'not-a-date']:
            bad = payload()
            bad['views']['views'][0]['timestamp'] = stamp
            with self.assertRaises(ValueError):
                t.merge(None, bad, NOW, REPO)
        bad = payload()
        bad['views']['views'].append(bad['views']['views'][0])
        with self.assertRaises(ValueError):
            t.merge(None, bad, NOW, REPO)
        data = t.merge(None, payload(), NOW, REPO)
        with self.assertRaises(ValueError):
            t.merge(data, payload(), NOW, 'someone/else')

    def test_archive_failure_does_not_start_new_history(self):
        class API:
            def request(self, path, **kwargs):
                if '/git/ref/' in path:
                    return {'object': {'sha': 'existing'}}
                raise RuntimeError('HTTP 403')
        with self.assertRaises(RuntimeError):
            t.load_archive(API())

    def test_publisher_has_no_plaintext_and_never_force_updates(self):
        calls = []
        class API:
            def request(self, path, method, body):
                calls.append((path, method, body))
                return {'sha': 'test-sha'}
        envelope = t.encrypt(t.merge(None, payload(), NOW, REPO), PASSWORD)
        t.publish(API(), 'parent-sha', envelope, t.render(envelope))
        self.assertEqual(calls[-1][2]['force'], False)
        self.assertEqual(calls[1][2]['parents'], ['parent-sha'])
        self.assertNotIn('<img src=x', json.dumps(calls))
        self.assertNotIn(PASSWORD, json.dumps(calls))

    def test_browser_crypto_matches_python(self):
        data = t.merge(None, payload(), NOW, REPO)
        envelope = t.encrypt(data, PASSWORD)
        html = t.render(envelope)
        start = html.index('function bytes(')
        end = html.index('function row(')
        js = 'const {webcrypto}=require("node:crypto");const crypto=webcrypto;\n'
        js += 'const envelope=' + json.dumps(envelope) + ';\n' + html[start:end]
        js += '\nunlock(' + json.dumps(PASSWORD) + ').then(data=>console.log(JSON.stringify(data)));'
        with tempfile.TemporaryDirectory() as directory:
            script = Path(directory) / 'crypto.cjs'
            script.write_text(js)
            result = subprocess.run(['node', str(script)], check=True, capture_output=True, text=True)
        self.assertEqual(json.loads(result.stdout), data)


if __name__ == '__main__':
    unittest.main()
