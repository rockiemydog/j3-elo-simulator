# j3-elo-simulator
J3順位シュミレーターELO版

## 公式結果のメール通知

公式結果に試合の追加・得点訂正があり、GitHubへの保存が成功すると、送信元のGmailアドレス自身へ通知します。変更なし・メタデータのみの更新では通知しません。端末画面への反映完了を確認する通知ではありません。

GitHubの Settings → Secrets and variables → Actions に次の Repository secrets を登録します。メールアドレス・認証情報はコードに記載しません。

| Secret | 値 |
| --- | --- |
| `J3_SMTP_USERNAME` | 通知を受け取るGmailアドレス（送信元も同じ） |
| `J3_SMTP_PASSWORD` | この通知専用のGoogleアプリパスワード |

Googleアプリパスワードは2段階認証が必要です。通常のGoogleログインパスワードは使用しません。作成・利用条件は https://support.google.com/accounts/answer/185833?hl=ja を参照してください。

登録後、Actions → Automatic official J3 results → Run workflow で `test_email` をオンにして動作確認できます。実際の公式結果を確認・更新した後、テストメールを1通送信します。

認証設定がなければ警告を出して通知をスキップします。送信失敗でも公式結果更新は保持し、メールのみの自動再送はしません。送信失敗はワークフローの通知ステップで確認してください。SMTPサーバーの受付成功は受信箱への到着保証ではありません。
