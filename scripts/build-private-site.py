"""Package the tested simulator and the latest verified startup snapshot."""
import hashlib, json, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'

def main():
    # Validate the snapshot using the same independent collector validation.
    import importlib.util
    spec = importlib.util.spec_from_file_location('collector', ROOT / 'scripts/update-official-results.py')
    collector = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(collector)
    feed = json.loads((ROOT / 'official-results.json').read_text())
    if feed.get('verified') is not True or feed.get('schemaVersion') != 1 or feed.get('season') != '2026/27':
        raise ValueError('Invalid startup snapshot')
    collector.validate(feed['matches'], None)
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for name in ['index.html', 'progress-tracker/index.html', 'shared-results.js', 'official-api-config.js', 'giravanz-theme.css', 'official-results.json', 'official-schedule.json']:
        target = OUT / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    snapshot = 'window.J3OfficialSnapshot=' + json.dumps(feed, ensure_ascii=False, separators=(',', ':')) + ';\n'
    version = hashlib.sha256(snapshot.encode()).hexdigest()[:12]
    (OUT / 'official-feed-snapshot.js').write_text(snapshot)
    for name, prefix in [('index.html', ''), ('progress-tracker/index.html', '../')]:
        page = OUT / name
        html = page.read_text().replace('<head>', '<head>\n<meta name="robots" content="noindex,nofollow">', 1)
        start = html.index('<script src="' + prefix + 'shared-results.js')
        html = html[:start] + '<script src="' + prefix + 'official-feed-snapshot.js?v=' + version + '"></script>\n' + html[start:]
        page.write_text(html)
    (OUT / 'robots.txt').write_text('User-agent: *\nDisallow: /\n')
    print(f'Private assets prepared: {len(feed["matches"])} official matches, snapshot {version}')

if __name__ == '__main__':
    main()
