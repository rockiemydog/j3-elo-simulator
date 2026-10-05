"""Email published score changes; credentials stay in GitHub Actions secrets."""
import argparse
import datetime as dt
import json
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from email.utils import format_datetime, make_msgid
from pathlib import Path


def changed_matches(before, after):
    old = {tuple(row['game'][:2]): row['game'] for row in before['matches']}
    new = {tuple(row['game'][:2]): row['game'] for row in after['matches']}
    if not old.keys() <= new.keys():
        raise ValueError('Published feed must preserve existing fixtures')
    return [(row, old.get(tuple(row['game'][:2]))) for row in after['matches']
            if old.get(tuple(row['game'][:2])) != row['game']]


def compose(before, after, sender, recipient, commit='', test=False):
    changes = changed_matches(before, after)
    if not changes and not test:
        return None
    lines = ['メール通知のテストです。' if test else '公式結果のGitHubへの保存が完了しました。', '']
    if changes:
        lines.append('追加・訂正した試合：')
        for row, old in changes:
            home, away, hg, ag = row['game']
            previous = f'（訂正前 {old[2]}–{old[3]}）' if old else '（新規）'
            lines.append(f"・{row['date']} {home} {hg}–{ag} {away} {previous}")
        lines.append('')
    else:
        lines.extend(['試合結果の変更はありません。', ''])
    played = wins = draws = losses = 0
    for row in after['matches']:
        home, away, hg, ag = row['game']
        if '北九州' not in (home, away):
            continue
        gf, ga = (hg, ag) if home == '北九州' else (ag, hg)
        played += 1
        wins += gf > ga
        draws += gf == ga
        losses += gf < ga
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))
    lines.extend([f"リーグ確定：{len(after['matches'])}試合", 
                  f'北九州：{played}試合・勝点{3 * wins + draws}（{wins}勝{draws}分{losses}敗）',
                  f"結果の対象日：{after['asOfDate']}まで",
                  f"通知作成日時：{now:%Y-%m-%d %H:%M:%S} 日本時間",
                  '', '順位シミュレーター・トラッカーは、次回の自動取得時に反映されます。',
                  '端末画面への反映完了を確認した通知ではありません。'])
    if commit:
        lines.extend(['', '保存した結果：',
                      f'https://github.com/rockiemydog/j3-elo-simulator/commit/{commit}'])
    lines.extend(['', 'シミュレーター：', 'https://rockiemydog.github.io/j3-elo-simulator/'])
    message = EmailMessage()
    message['Subject'] = ('【テスト】' if test else '') + f"J3公式結果更新：確定{len(after['matches'])}試合／北九州 勝点{3 * wins + draws}"
    message['From'] = sender
    message['To'] = recipient
    message['Date'] = format_datetime(now)
    message['Message-ID'] = make_msgid()
    message.set_content('\n'.join(lines))
    return message


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--before', required=True)
    parser.add_argument('--after', default='official-results.json')
    parser.add_argument('--test', action='store_true')
    args = parser.parse_args()
    username = os.environ.get('SMTP_USERNAME', '').strip()
    password = os.environ.get('SMTP_PASSWORD', '').replace(' ', '')
    if not username or not password:
        print('::warning::Email is not configured. Add J3_SMTP_USERNAME and J3_SMTP_PASSWORD in Actions secrets. Official results remain published.')
        return 0
    before = json.loads(Path(args.before).read_text())
    after = json.loads(Path(args.after).read_text())
    message = compose(before, after, username, username,
                      os.environ.get('NOTIFICATION_COMMIT', ''), args.test)
    if message is None:
        print('No score changes; no email sent.')
        return 0
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, context=ssl.create_default_context(), timeout=30) as smtp:
            smtp.login(username, password)
            refused = smtp.send_message(message)
            if refused:
                raise smtplib.SMTPRecipientsRefused(refused)
    except (smtplib.SMTPException, OSError):
        # Never log server replies or credentials. No retry: acceptance may be ambiguous.
        print('::warning::Email delivery failed. Official results remain published. Check credentials and use the test_email manual workflow input.')
        return 1
    print('Email accepted by SMTP server.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
