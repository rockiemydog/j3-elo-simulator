const API = 'https://j3-official-refresh.hideakiito382.chatgpt.site/api/results';

async function updateResults(env = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch(API, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) throw new Error('Update service unavailable');
    const data = await response.json();
    if (['busy', 'cooldown'].includes(data.status)) {
      console.log('J3 update deferred; next scheduled run will retry');
      return;
    }
    const feed = data.feed;
    if (!['ready', 'updated', 'unchanged'].includes(data.status) ||
        feed?.verified !== true || !Array.isArray(feed.matches) ||
        feed.matches.length < 90 || feed.matches.length > 380 ||
        !/^[0-9a-f]{8}$/.test(data.resultId) ||
        !Number.isFinite(Date.parse(feed.officialCheckedAt))) {
      throw new Error('Unverified update response');
    }
    console.log(JSON.stringify({
      status: data.status, matches: feed.matches.length,
      resultId: data.resultId, officialCheckedAt: feed.officialCheckedAt
    }));
    await notifyResults(data, env);
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async scheduled(event, env) {
    await updateResults(env);
  },
  async fetch(request) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    return Response.json({
      service: 'j3-results-scheduler', version: 2,
      message: 'Code installed. Check Cron configuration and execution logs.',
      email: 'Check MAIL_MODE, notification ledger and inbox; HTTP visits never send mail.'
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
};

// Fixed migration baseline: already visible on both user screens, not a new notification.
const BASELINE = 'bf7150fe';
const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const b64 = text => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

export function composeMail(data, env, test = false) {
  const rows = data.feed.matches;
  const ids = new Set();
  let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;
  for (const row of rows) {
    const g = row.game;
    if (!Array.isArray(g) || g.length !== 4 || typeof g[0] !== 'string' ||
        typeof g[1] !== 'string' || g[0] === g[1] ||
        !Number.isInteger(g[2]) || !Number.isInteger(g[3]) || g[2] < 0 || g[3] < 0 ||
        typeof row.id !== 'string' || ids.has(row.id)) throw new Error('Invalid match for notification');
    ids.add(row.id);
    if (!g.slice(0, 2).includes('北九州')) continue;
    const [f, a] = g[0] === '北九州' ? [g[2], g[3]] : [g[3], g[2]];
    gf += f; ga += a; wins += f > a; draws += f === a; losses += f < a;
  }
  let hash = 2166136261;
  const canonical = rows.map(r => r.game.join('|')).sort().join('\n');
  for (let i = 0; i < canonical.length; i++) hash = Math.imul(hash ^ canonical.charCodeAt(i), 16777619) >>> 0;
  if (hash.toString(16).padStart(8, '0') !== data.resultId) throw new Error('Result ID mismatch');
  const points = wins * 3 + draws;
  const subject = `${test ? '【移行テスト】' : ''}J3公式結果：確定${rows.length}試合／北九州 勝点${points}`;
  const text = [test ? 'Cloudflareからのメール通知テストです。' : '保存済みの公式結果に変更がありました。',
    `結果ID：${data.resultId}`, `リーグ確定：${rows.length}試合`,
    `北九州：${wins + draws + losses}試合・勝点${points}（${wins}勝${draws}分${losses}敗）`,
    `得点${gf}・失点${ga}`, `公式サイト確認：${data.feed.officialCheckedAt}`,
    '両画面で同じ結果IDと集計一致の表示を確認してください。',
    'この通知は端末画面への反映完了を確認したものではありません。',
    '', 'シミュレーター：https://rockiemydog.github.io/j3-elo-simulator/',
    'トラッカー：https://rockiemydog.github.io/j3-elo-simulator/progress-tracker/'].join('\n');
  if (!ADDRESS.test(env.SMTP_USERNAME || '') || !ADDRESS.test(env.NOTIFICATION_EMAIL || ''))
    throw new Error('Invalid mail configuration');
  return [
    `From: ${env.SMTP_USERNAME}`, `To: ${env.NOTIFICATION_EMAIL}`,
    `Subject: ${Array.from(subject).join('').match(/.{1,12}/gu).map(part => '=?UTF-8?B?' + b64(part) + '?=').join('\r\n ')}`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@j3-results-scheduler.workers.dev>`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64', '', b64(text).match(/.{1,76}/g).join('\r\n'), ''
  ].join('\r\n');
}

// The SMTP server's final 250 means accepted, not inbox delivery.
// Never log replies: they may contain authentication or private details.
export async function sendSMTP(raw, env, connectOverride) {
  const connect = connectOverride || (await import('cloudflare:sockets')).connect;
  const socket = connect({ hostname: 'smtp.gmail.com', port: 465 }, { secureTransport: 'on' });
  socket.closed.catch(() => {});
  const reader = socket.readable.getReader(), writer = socket.writable.getWriter();
  let buffer = '', size = 0, inData = false;
  const decoder = new TextDecoder(), encoder = new TextEncoder();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; socket.close().catch(() => {}); }, 30000);
  async function reply(expected) {
    let firstCode;
    for (;;) {
      while (!buffer.includes('\r\n')) {
        const { value, done } = await reader.read();
        if (done) throw new Error('SMTP disconnected');
        size += value.length;
        if (size > 131072) throw new Error('SMTP reply too large');
        buffer += decoder.decode(value, { stream: true });
      }
      const end = buffer.indexOf('\r\n'), line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const m = /^(\d{3})([ -])/.exec(line);
      if (!m || (firstCode && firstCode !== m[1])) throw new Error('Invalid SMTP reply');
      firstCode = m[1];
      if (m[2] === ' ') {
        if (!expected.includes(Number(m[1]))) throw new Error('SMTP command rejected');
        return;
      }
    }
  }
  async function command(value, expected) {
    await writer.write(encoder.encode(value + '\r\n'));
    await reply(expected);
  }
  try {
    await socket.opened;
    await reply([220]);
    await command('EHLO j3-results-scheduler.workers.dev', [250]);
    await command('AUTH LOGIN', [334]);
    await command(b64(env.SMTP_USERNAME), [334]);
    await command(b64(env.SMTP_PASSWORD.replace(/\s/g, '')), [235]);
    await command(`MAIL FROM:<${env.SMTP_USERNAME}>`, [250]);
    await command(`RCPT TO:<${env.NOTIFICATION_EMAIL}>`, [250, 251]);
    await command('DATA', [354]);
    inData = true;
    await command(raw.replace(/^\./gm, '..') + '\r\n.', [250]);
    // Do not let QUIT/disconnection after acceptance cause duplicate retry.
    return { accepted: true };
  } catch {
    const error = new Error(timedOut ? 'SMTP timeout' : 'SMTP failed');
    error.ambiguous = inData;
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock(); writer.releaseLock();
    await socket.close().catch(() => {});
  }
}

export async function notifyResults(data, env, deliver = sendSMTP) {
  const mode = env.MAIL_MODE || 'off';
  if (mode === 'off') return;
  if (!['test', 'live'].includes(mode) || !env.NOTIFY_DB || !env.SMTP_PASSWORD)
    throw new Error('Mail configuration incomplete');
  // Compose/validate before touching the ledger or sending anything.
  const raw = composeMail(data, env, mode === 'test');
  if (mode === 'test' && !/^[a-zA-Z0-9_-]{1,64}$/.test(env.MAIL_TEST_ID || ''))
    throw new Error('MAIL_TEST_ID required');
  const db = env.NOTIFY_DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS notification_ledger (
    key TEXT PRIMARY KEY, state TEXT NOT NULL, at INTEGER NOT NULL
  )`).run();
  await db.prepare("INSERT OR IGNORE INTO notification_ledger VALUES (?, 'baseline', ?)")
    .bind('result:' + BASELINE, Date.now()).run();
  const key = mode === 'test' ? 'test:' + env.MAIL_TEST_ID : 'result:' + data.resultId;
  // Atomic insert arbitrates parallel Cron runs. A crash retains 'sending';
  // never retry that uncertain delivery automatically.
  const claim = await db.prepare("INSERT OR IGNORE INTO notification_ledger VALUES (?, 'sending', ?)")
    .bind(key, Date.now()).run();
  if (!claim.meta.changes) {
    const previous = await db.prepare('SELECT state FROM notification_ledger WHERE key = ?').bind(key).first();
    if (['sending', 'uncertain'].includes(previous?.state)) throw new Error('Mail acceptance uncertain; inspect ledger/inbox before retry');
    console.log(JSON.stringify({ mail: 'already_recorded', resultId: data.resultId }));
    return;
  }
  try {
    await deliver(raw, env);
  } catch (error) {
    if (error.ambiguous === false) {
      await db.prepare('DELETE FROM notification_ledger WHERE key = ?').bind(key).run();
    } else {
      await db.prepare("UPDATE notification_ledger SET state = 'uncertain' WHERE key = ?").bind(key).run();
    }
    throw new Error('Mail not confirmed; check configuration and ledger');
  }
  await db.prepare("UPDATE notification_ledger SET state = 'accepted', at = ? WHERE key = ?")
    .bind(Date.now(), key).run();
  console.log(JSON.stringify({ mail: 'smtp_accepted', mode, resultId: data.resultId }));
}
