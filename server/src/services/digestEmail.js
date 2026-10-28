import crypto from 'crypto';

/**
 * Weekly email digest: pure helpers (no database, no network) so they can be unit-tested.
 */

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const round1 = (n) => Math.round(n * 10) / 10;

/** Signed token for the one-click unsubscribe link (no login needed, cannot be guessed). */
export function unsubscribeToken(userId, secret) {
  return crypto.createHmac('sha256', secret).update(`digest-unsub:${userId}`).digest('hex');
}

export function verifyUnsubscribeToken(userId, token, secret) {
  if (!userId || typeof token !== 'string') return false;
  const want = Buffer.from(unsubscribeToken(String(userId), secret));
  const got = Buffer.from(token);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/** Plain facts to show, in order. Rows with no data are left out. */
export function digestRows(stats = {}) {
  const rows = [];
  if ((stats.tasksCompleted || 0) + (stats.tasksMissed || 0) > 0) {
    rows.push(['Tasks completed', String(stats.tasksCompleted || 0)]);
    if (stats.tasksMissed > 0) rows.push(['Due and not finished', String(stats.tasksMissed)]);
  }
  if (stats.focusMinutes > 0) rows.push(['Focus time', `${round1(stats.focusMinutes / 60)} h`]);
  if (stats.habitSlots > 0) {
    rows.push(['Habit consistency', `${Math.min(100, Math.round((stats.habitCheckins / stats.habitSlots) * 100))}%`]);
  }
  if (stats.meetingsHeld > 0) rows.push(['Meetings held', String(stats.meetingsHeld)]);
  return rows;
}

/** True when the week has nothing worth emailing about. */
export function isEmptyWeek(report) {
  return !report || (digestRows(report.stats).length === 0 && !(report.score > 0));
}

/**
 * @param {object} p
 * @param {string} p.name
 * @param {{start:string,end:string}} p.week
 * @param {number} p.score
 * @param {object} p.stats
 * @param {string[]} p.insights
 * @param {string|null} p.aiText
 * @param {string} p.todayUrl
 * @param {string} p.unsubscribeUrl
 */
export function buildDigest({ name, week, score, stats, insights = [], aiText = null, todayUrl, unsubscribeUrl }) {
  const first = String(name || '').split(' ')[0] || 'there';
  const rows = digestRows(stats);
  const subject = `Your LifeOS week: ${score}/100`;

  const text = [
    `Hi ${first},`,
    '',
    `Here is your week (${week.start} to ${week.end}). Productivity score: ${score}/100.`,
    '',
    ...rows.map(([k, v]) => `- ${k}: ${v}`),
    ...(insights.length ? ['', ...insights.map((i) => `* ${i}`)] : []),
    ...(aiText ? ['', aiText] : []),
    '',
    `Open your week: ${todayUrl}`,
    '',
    `Stop these emails: ${unsubscribeUrl}`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border-radius:16px;padding:24px">
<p style="margin:0 0 4px;font-size:13px;color:#64748b">${esc(week.start)} to ${esc(week.end)}</p>
<h1 style="margin:0 0 16px;font-size:22px">Hi ${esc(first)}, here is your week</h1>
<p style="margin:0 0 20px;font-size:40px;font-weight:700;color:#4f46e5">${esc(score)}<span style="font-size:16px;color:#64748b">/100</span></p>
${rows.length ? `<table style="width:100%;border-collapse:collapse;margin-bottom:16px">${rows
    .map(([k, v]) => `<tr><td style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:14px;color:#475569">${esc(k)}</td><td style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:14px;font-weight:700;text-align:right">${esc(v)}</td></tr>`)
    .join('')}</table>` : ''}
${insights.length ? `<ul style="padding-left:18px;margin:0 0 16px;font-size:14px;line-height:1.5">${insights.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
${aiText ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;background:#eef2ff;border-radius:12px;padding:12px">${esc(aiText)}</p>` : ''}
<a href="${esc(todayUrl)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:12px">Open your week</a>
</div>
<p style="font-size:12px;color:#64748b;text-align:center;margin:16px 0 0"><a href="${esc(unsubscribeUrl)}" style="color:#64748b">Stop these weekly emails</a></p>
</div></body></html>`;

  return { subject, text, html };
}

/**
 * Digests go out for the week that just ended, any time except early Monday morning (before 07:00
 * server time), so the report is not sent in the middle of the night. If the server was asleep on
 * Monday it simply sends on the next tick that day or later in the week.
 */
export function digestWindowOpen(now = new Date()) {
  return !(now.getDay() === 1 && now.getHours() < 7);
}
