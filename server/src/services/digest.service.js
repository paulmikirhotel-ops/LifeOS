import { User, Membership } from '../models/index.js';
import { env } from '../config/env.js';
import { sendMail } from '../utils/mailer.js';
import { weekRange, previousWeek } from './briefingLogic.js';
import { getWeekly } from './briefing.service.js';
import {
  buildDigest,
  isEmptyWeek,
  digestWindowOpen,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from './digestEmail.js';

const secret = () => env.jwt.secret;

export function unsubscribeUrlFor(userId) {
  return `${env.serverPublicUrl}/api/briefing/unsubscribe?u=${userId}&t=${unsubscribeToken(String(userId), secret())}`;
}

/** Turns the digest off from the email link. Returns false when the link is not valid. */
export async function unsubscribe(userId, token) {
  if (!/^[a-f0-9]{24}$/i.test(String(userId || '')) || !verifyUnsubscribeToken(userId, token, secret())) return false;
  await User.updateOne({ _id: userId }, { $set: { weeklyDigest: false } });
  return true;
}

async function sendOne(u, prev) {
  // Claim the week first: only one server/tick can win, so nobody is emailed twice.
  const claim = await User.updateOne(
    { _id: u._id, weeklyDigestSentFor: { $ne: prev.startStr } },
    { $set: { weeklyDigestSentFor: prev.startStr } }
  );
  if (claim.modifiedCount === 0) return 'skipped';

  const membership =
    (u.activeTenantId && (await Membership.findOne({ tenantId: u.activeTenantId, userId: u._id, status: 'active' }).lean())) ||
    (await Membership.findOne({ userId: u._id, status: 'active' }).sort({ createdAt: 1 }).lean());
  if (!membership) return 'skipped';

  const report = await getWeekly(
    { id: String(u._id), tenantId: String(membership.tenantId), permissions: membership.permissions },
    prev.startStr
  );
  if (isEmptyWeek(report)) return 'empty';

  const mail = buildDigest({
    name: u.name,
    week: report.week,
    score: report.score,
    stats: report.stats,
    insights: report.insights,
    aiText: report.ai?.text || null,
    todayUrl: `${env.clientUrls[0]}/today`,
    unsubscribeUrl: unsubscribeUrlFor(u._id),
  });
  const res = await sendMail({ to: u.email, subject: mail.subject, text: mail.text, html: mail.html });
  if (res.sent === false) console.error(`[digest] email to user ${u._id} failed: ${res.error}`);
  return res.sent === false ? 'failed' : 'sent';
}

/** Called by the scheduler tick. Sequential and capped so a big list cannot hammer the mail server. */
export async function sendDueDigests(now = new Date(), limit = 100) {
  if (!digestWindowOpen(now)) return { sent: 0 };
  const prev = previousWeek(weekRange(now));
  const users = await User.find({
    weeklyDigest: true,
    status: 'active',
    isEmailVerified: true,
    weeklyDigestSentFor: { $ne: prev.startStr },
  })
    .select('name email activeTenantId')
    .limit(limit)
    .lean();

  let sent = 0;
  for (const u of users) {
    try {
      if ((await sendOne(u, prev)) === 'sent') sent += 1;
    } catch (err) {
      console.error(`[digest] user ${u._id}: ${err.message}`);
    }
  }
  return { sent };
}
