#!/usr/bin/env python3
"""Collect GitHub traffic; publish only an encrypted, self-contained report."""
import base64
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

BRANCH = 'traffic-history'
ITERATIONS = 600_000
AAD = b'j3-traffic-v1'
ROOT = Path(__file__).resolve().parents[1]


def encrypt(data, password):
    if len(password) < 16:
        raise ValueError('TRAFFIC_REPORT_PASSWORD must contain at least 16 characters')
    salt, nonce = os.urandom(16), os.urandom(12)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, ITERATIONS, 32)
    ciphertext = AESGCM(key).encrypt(nonce, json.dumps(data, ensure_ascii=False).encode(), AAD)
    return dict(version=1, iterations=ITERATIONS, **{
        k: base64.b64encode(v).decode() for k, v in
        [('salt', salt), ('nonce', nonce), ('ciphertext', ciphertext)]})


def decrypt(envelope, password):
    if envelope['version'] != 1 or envelope['iterations'] != ITERATIONS:
        raise ValueError('Unsupported archive format')
    salt, nonce, ciphertext = (base64.b64decode(envelope[k], validate=True)
                               for k in ['salt', 'nonce', 'ciphertext'])
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, ITERATIONS, 32)
    return json.loads(AESGCM(key).decrypt(nonce, ciphertext, AAD))


def integer(value):
    if type(value) is not int or value < 0:
        raise ValueError('Invalid traffic count')
    return value


def validate_metric(item):
    count, uniques = integer(item['count']), integer(item['uniques'])
    if uniques > count:
        raise ValueError('Unique count exceeds total')
    return dict(count=count, uniques=uniques)


def merge(previous, payloads, now, repository):
    """Replace overlapping daily records, including downward corrections; never sum windows."""
    data = copy.deepcopy(previous) if previous else dict(version=1, repository=repository, days={}, snapshots={})
    if data['repository'] != repository or data['version'] != 1:
        raise ValueError('Archive belongs to a different repository or version')
    today = now[:10]
    snapshot = dict(collected_at=now)
    for metric in ['views', 'clones']:
        feed = payloads[metric]
        snapshot[metric] = validate_metric(feed)
        seen = set()
        for item in feed[metric]:
            stamp = datetime.strptime(item['timestamp'], '%Y-%m-%dT%H:%M:%SZ')
            day = stamp.date().isoformat()
            if day > today or day in seen or stamp.hour or stamp.minute or stamp.second:
                raise ValueError('Invalid, duplicate, or future daily timestamp')
            seen.add(day)
            data['days'].setdefault(day, {})[metric] = validate_metric(item)
    for key, field in [('referrers', 'referrer'), ('paths', 'path')]:
        if not isinstance(payloads[key], list):
            raise ValueError('Invalid traffic list')
        snapshot[key] = []
        for item in payloads[key]:
            if not isinstance(item[field], str):
                raise ValueError('Invalid traffic label')
            snapshot[key].append({field: item[field], **validate_metric(item)})
    data['snapshots'][today] = snapshot
    data['updated_at'] = now
    return data


class GitHub:
    def __init__(self, repository, token):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
            raise ValueError('Invalid repository')
        self.root = 'https://api.github.com/repos/' + repository
        self.token = token

    def request(self, path, method='GET', body=None, missing_ok=False):
        req = Request(self.root + path, method=method,
                      data=None if body is None else json.dumps(body).encode(), headers={
                          'Authorization': 'Bearer ' + self.token,
                          'Accept': 'application/vnd.github+json',
                          'X-GitHub-Api-Version': '2022-11-28',
                          'Content-Type': 'application/json',
                          'User-Agent': 'j3-private-traffic-report'})
        try:
            with urlopen(req, timeout=45) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code == 404 and missing_ok:
                return None
            # Never print API bodies, tokens, traffic values, or decrypted history to Actions logs.
            raise RuntimeError(f'GitHub request failed: HTTP {error.code} ({path.split("?")[0]})') from None


def load_archive(api):
    head = api.request('/git/ref/heads/' + BRANCH, missing_ok=True)
    if head is None:
        return None, None
    file = api.request('/contents/archive.json?ref=' + BRANCH)
    envelope = json.loads(base64.b64decode(file['content']))
    return head['object']['sha'], envelope


def publish(api, parent, envelope, report):
    # New tree deliberately contains only ciphertext and its password unlock UI.
    tree = api.request('/git/trees', 'POST', {'tree': [
        dict(path='archive.json', mode='100644', type='blob', content=json.dumps(envelope)),
        dict(path='report.html', mode='100644', type='blob', content=report)]})
    commit = api.request('/git/commits', 'POST', {
        'message': 'Save encrypted repository traffic report', 'tree': tree['sha'],
        'parents': [parent] if parent else []})
    # Non-forced update: concurrent writers fail instead of overwriting history.
    if parent:
        api.request('/git/refs/heads/' + BRANCH, 'PATCH', {'sha': commit['sha'], 'force': False})
    else:
        api.request('/git/refs', 'POST', {'ref': 'refs/heads/' + BRANCH, 'sha': commit['sha']})


def render(envelope):
    template = (ROOT / 'traffic/report-template.html').read_text()
    return template.replace('__ENCRYPTED_PAYLOAD__', json.dumps(envelope))


def main():
    repository = os.environ['GITHUB_REPOSITORY']
    reader = GitHub(repository, os.environ['TRAFFIC_READ_TOKEN'])
    writer = GitHub(repository, os.environ['GITHUB_TOKEN'])
    password = os.environ['TRAFFIC_REPORT_PASSWORD']
    parent, envelope = load_archive(writer)
    # Wrong password or damaged existing data stops the entire run; no blank reset.
    previous = decrypt(envelope, password) if envelope else None
    payloads = {key: reader.request('/traffic/' + path) for key, path in {
        'views': 'views?per=day', 'clones': 'clones?per=day',
        'referrers': 'popular/referrers', 'paths': 'popular/paths'}.items()}
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    data = merge(previous, payloads, now, repository)
    encrypted = encrypt(data, password)
    report = render(encrypted)
    publish(writer, parent, encrypted, report)
    output = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'j3-traffic-report'
    output.mkdir(exist_ok=True)
    (output / 'report.html').write_text(report)
    print('Encrypted traffic report saved. No raw traffic data was published.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Deliberately omit exception values which might include data or secrets.
        print(f'Traffic collection stopped ({type(error).__name__}). Existing history was not reset.', file=sys.stderr)
        sys.exit(1)
