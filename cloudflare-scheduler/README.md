# Cloudflare J3 scheduler and Gmail notification migration

Worker: `j3-results-scheduler`, Cron: `*/5 * * * *`.
Replace the complete dashboard worker.js with worker.mjs (a single ESM file).
No package installation is required. The sockets import is a Cloudflare runtime API.

## Current status

Phase 1 is verified in production: 2026-10-12 15:41 JST scheduled event,
version 0b87583b-d76f-46c4-b205-c8a53780d681, outcome ok,
100 validated matches, result ID bf7150fe. A later user screen showed
2026-10-12 15:46:01 official check and the same result ID.
The version 2 mail extension has only local mocked SMTP/SQLite tests so far.
Live Cloudflare SMTP connectivity, authenticated sending and inbox delivery must
be tested before switching off GitHub notifications.

## Configuration in Cloudflare

1. Storage & databases > D1 > Create database: `j3-notifications`.
2. Worker > Settings > Bindings > Add binding > D1 database:
   variable name `NOTIFY_DB`, select `j3-notifications`.
   The Worker creates its ledger table automatically.
3. Worker > Settings > Runtime variables and secrets > Add variable:

| Type | Name | Value |
|---|---|---|
| Text | MAIL_MODE | `off` initially, `test` only once the remaining settings and code are deployed |
| Text | MAIL_TEST_ID | `migration-20261012-1` |
| Secret | SMTP_USERNAME | Existing Gmail sender address |
| Secret | SMTP_PASSWORD | A Gmail app password, never the normal Google password |
| Secret | NOTIFICATION_EMAIL | Existing recipient address |

Enter secrets only in Cloudflare. Never paste them into chat, GitHub source,
logs or screenshots. A separate Gmail app password named `J3 Cloudflare`
allows independent revocation. Existing GitHub secrets cannot be read back.
The sender and recipient retain their existing values; no new provider or domain.

4. Paste the complete worker.mjs into the existing Worker editor and Deploy.
5. Set MAIL_MODE=test and await an actual five-minute Cron invocation.
   Public HTTP requests only provide health information and never send email.
6. Confirm the production structured log `mail: smtp_accepted`, then verify
   receipt of the message headed `【移行テスト】` at the configured recipient.
   SMTP acceptance is not proof of inbox delivery. Verify the ID/counts and
   both links against the screen. Local mocked logs are not production evidence.
7. Before MAIL_MODE=live, disable the GitHub workflow's notification step via
   a repository change and merge it. Keep its collection/publishing fallback.
   Do not remove its secrets until live notification is verified.
8. Set MAIL_MODE=live. Baseline bf7150fe is already known and is not mailed.
   Subsequent content IDs notify once. Cron while the page is closed should
   continue retrieving official results; result changes and mail must be
   verified together at the next actual changed result.

## Failure handling

The D1 primary key arbitrates simultaneous runs. Test messages use their own
key and never consume a real result notification. A confirmed failure before
SMTP DATA is retryable on the next Cron. If DATA was sent but its acceptance
is uncertain, the record remains `uncertain`; do not automatically resend.
A worker crash or failed ledger update after SMTP acceptance leaves `sending`
and also prevents automatic duplicate delivery. Inspect the inbox and SMTP
sent folder before deliberately clearing a record or issuing a new test ID.
These conservative holds require manual resolution; this is not a claim of
exactly-once delivery across an SMTP and database transaction.

Passwords/replies are never logged. Authentication uses TLS to smtp.gmail.com:465.
Runtime connectivity has not yet been proven. If Cloudflare or Gmail rejects
it, retain GitHub mail and investigate the actual error without logging replies.
No retries of ambiguous acceptance, public send endpoint or guessed domains.

## Checks

`node --test cloudflare-scheduler/worker.test.mjs cloudflare-scheduler/mail.test.mjs`

Frozen baseline fixture keeps tests independent of the changing live result file.
