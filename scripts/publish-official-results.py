"""Publish a validated feed without overwriting concurrent main-branch changes."""
import os
import subprocess


def git(*args, check=True):
    return subprocess.run(['git', *args], check=check, capture_output=True, text=True)


def publish():
    git('add', '--', 'official-results.json')
    if git('diff', '--cached', '--quiet', '--', 'official-results.json', check=False).returncode == 0:
        return git('rev-parse', 'HEAD').stdout.strip()
    git('commit', '-m', 'Update official J3 finished results', '--', 'official-results.json')
    for attempt in range(3):
        pushed = git('push', 'origin', 'HEAD:main', check=False)
        if pushed.returncode == 0:
            return git('rev-parse', 'HEAD').stdout.strip()
        if not any(reason in pushed.stderr for reason in ('(fetch first)', '(non-fast-forward)')):
            raise RuntimeError('Publication rejected or unavailable; no permission bypass or forced push attempted')
        if attempt == 2:
            break
        git('fetch', 'origin', 'main')
        # Rebase only the generated results commit. Never force-push, or resolve
        # conflicting scores automatically: a newer feed must remain protected.
        result = git('rebase', 'origin/main', check=False)
        if result.returncode:
            git('rebase', '--abort')
            raise RuntimeError('Concurrent score changes conflict; published results were not overwritten')
    raise RuntimeError('Publication failed after bounded retries; no notification sent')


if __name__ == '__main__':
    commit = publish()
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as handle:
            handle.write(f'commit={commit}\n')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as handle:
            handle.write(f'公式データのGitHub保存：完了（{commit}）。端末表示は未確認です。\n')
    print(f'Published official results at {commit}')
