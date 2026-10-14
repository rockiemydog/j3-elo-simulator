"""Exercise publication races with temporary local Git repositories, no network."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('publish', ROOT/'scripts/publish-official-results.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublicationTests(unittest.TestCase):
    def git(self, cwd, *args):
        return subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.remote = self.base/'remote.git'
        self.writer = self.base/'writer'
        self.runner = self.base/'runner'
        self.git(self.base, 'init', '--bare', '--initial-branch=main', str(self.remote))
        self.git(self.base, 'clone', str(self.remote), str(self.writer))
        self.configure(self.writer)
        (self.writer/'official-results.json').write_text('old\n')
        (self.writer/'index.html').write_text('original\n')
        self.commit(self.writer, 'initial')
        self.git(self.writer, 'push', 'origin', 'main')
        self.git(self.base, 'clone', str(self.remote), str(self.runner))
        self.configure(self.runner)
        (self.runner/'official-results.json').write_text('collected\n')
        self.old_cwd = Path.cwd()
        os.chdir(self.runner)
        self.addCleanup(os.chdir, self.old_cwd)

    def configure(self, repo):
        self.git(repo, 'config', 'user.name', 'Test')
        self.git(repo, 'config', 'user.email', 'test@example.invalid')

    def commit(self, repo, message):
        self.git(repo, 'add', '.')
        self.git(repo, 'commit', '-m', message)

    def test_normal_publish(self):
        sha = publisher.publish()
        self.assertEqual(self.git(self.base, '--git-dir='+str(self.remote), 'rev-parse', 'main'), sha)
        self.assertEqual(self.git(self.base, '--git-dir='+str(self.remote), 'show', 'main:official-results.json'), 'collected')

    def test_concurrent_site_edit_is_preserved(self):
        (self.writer/'index.html').write_text('concurrent fix\n')
        self.commit(self.writer, 'site fix')
        self.git(self.writer, 'push', 'origin', 'main')
        sha = publisher.publish()
        self.assertEqual(self.git(self.base, '--git-dir='+str(self.remote), 'rev-parse', 'main'), sha)
        self.assertEqual(self.git(self.base, '--git-dir='+str(self.remote), 'show', 'main:index.html'), 'concurrent fix')
        self.assertEqual(self.git(self.base, '--git-dir='+str(self.remote), 'show', 'main:official-results.json'), 'collected')

    def test_conflicting_results_never_overwrite_remote(self):
        (self.writer/'official-results.json').write_text('newer score correction\n')
        self.commit(self.writer, 'score correction')
        self.git(self.writer, 'push', 'origin', 'main')
        expected = self.git(self.writer, 'rev-parse', 'HEAD')
        with self.assertRaisesRegex(RuntimeError, 'conflict'):
            publisher.publish()
        self.assertEqual(self.git(self.base, '--git-dir='+str(self.remote), 'rev-parse', 'main'), expected)
        self.assertEqual(self.git(self.base, '--git-dir='+str(self.remote), 'show', 'main:official-results.json'), 'newer score correction')
        self.assertFalse((self.runner/'.git/rebase-merge').exists())

    def test_unchanged_feed_does_not_create_commit(self):
        (self.runner/'official-results.json').write_text('old\n')
        expected = self.git(self.runner, 'rev-parse', 'HEAD')
        self.assertEqual(publisher.publish(), expected)
        self.assertEqual(self.git(self.runner, 'rev-parse', 'HEAD'), expected)

    def test_permission_rejection_stops_without_retry(self):
        real_git = publisher.git
        pushes = []
        def denied(*args, **kwargs):
            if args[0] == 'push':
                pushes.append(args)
                return subprocess.CompletedProcess(args, 1, '', 'remote: permission denied')
            if args[0] in ('fetch', 'rebase'):
                self.fail('Permission failure must not be retried')
            return real_git(*args, **kwargs)
        with patch.object(publisher, 'git', denied):
            with self.assertRaisesRegex(RuntimeError, 'rejected'):
                publisher.publish()
        self.assertEqual(len(pushes), 1)

    def test_mail_is_disabled_and_schedule_publication_is_enabled(self):
        workflow = (ROOT/'.github/workflows/official-results.yml').read_text()
        self.assertNotIn('SMTP_PASSWORD', workflow)
        self.assertNotIn('notify-official-results.py', workflow)
        self.assertIn('python scripts/update-official-schedule.py', workflow)
        self.assertIn("PUBLISH_SCHEDULE: 'true'", workflow)


if __name__ == '__main__':
    unittest.main()
