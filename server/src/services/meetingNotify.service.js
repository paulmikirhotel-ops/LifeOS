import { MeetingParticipant } from '../models/index.js';
import * as notificationService from './notification.service.js';
import { invitePath } from '../utils/invite.js';

/**
 * All meeting notifications go through here so wording, deep links and the "Join Meeting" action
 * are identical whether they come from a user action (create / edit / start / cancel) or from the
 * scheduler (reminders, start-time).
 *
 * Who is told:
 *  - the organizer and workspace participants (notification lives in the meeting's workspace and
 *    links to /meetings/:id), and
 *  - signed-in LifeOS users who joined through the invitation link (notification lives in THEIR OWN
 *    workspace and links back to the invitation page, since they cannot open workspace meetings).
 * Guests (no account) cannot receive notifications.
 *
 * notification.service never throws, so none of this can break the action that triggered it.
 */

const KINDS = {
  invited: { title: () => "You've been invited to a meeting", priority: 'normal', join: false },
  updated: { title: () => 'The meeting details have been updated', priority: 'normal', join: false },
  reminder: { title: ({ label }) => `Your meeting starts in ${label}`, priority: 'high', join: true },
  starting: { title: () => 'Your meeting is starting now', priority: 'high', join: true },
  started: { title: () => 'Your meeting has started', priority: 'high', join: true },
  cancelled: { title: () => 'Meeting cancelled', priority: 'normal', join: false },
};

export function humanizeMinutes(mins) {
  const n = Math.max(1, Math.round(mins));
  const unit = (v, word) => `${v} ${word}${v === 1 ? '' : 's'}`;
  if (n >= 1440) return unit(Math.round(n / 1440), 'day');
  if (n >= 60) return unit(Math.round(n / 60), 'hour');
  return unit(n, 'minute');
}

export function whenLabel(meeting) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: meeting.timezone || 'UTC', timeZoneName: 'short',
    }).format(new Date(meeting.startAt));
  } catch {
    return new Date(meeting.startAt).toUTCString();
  }
}

/** [{ userId, tenantId, path, joinPath }] — one entry per person, never the excluded user. */
export async function resolveRecipients(meeting, { excludeUserId, onlyUserIds, skipUserIds } = {}) {
  const out = new Map();
  const workspacePath = `/meetings/${meeting._id}`;
  const workspaceIds = [String(meeting.organizerId), ...(meeting.participants || []).filter((p) => p.userId).map((p) => String(p.userId))];
  for (const userId of workspaceIds) {
    out.set(userId, { userId, tenantId: meeting.tenantId, path: workspacePath, joinPath: `${workspacePath}?join=1` });
  }

  // Signed-in people who joined via the link (their current link version only — regenerating the link drops them).
  const version = meeting.invite?.version || 1;
  const rows = await MeetingParticipant.find({ meetingId: meeting._id, userId: { $exists: true }, inviteVersion: version })
    .select('userId notifyTenantId')
    .lean();
  const linkPath = invitePath(meeting._id, version);
  for (const r of rows) {
    const id = String(r.userId);
    if (!out.has(id) && r.notifyTenantId) out.set(id, { userId: id, tenantId: r.notifyTenantId, path: linkPath, joinPath: linkPath });
  }

  let list = [...out.values()];
  if (excludeUserId) list = list.filter((r) => r.userId !== String(excludeUserId));
  if (skipUserIds?.length) list = list.filter((r) => !skipUserIds.map(String).includes(r.userId));
  if (onlyUserIds) list = list.filter((r) => onlyUserIds.map(String).includes(r.userId));
  return list;
}

/**
 * kind: invited | updated | reminder | starting | started | cancelled
 * opts: { message, label, excludeUserId, onlyUserIds, dedupeKey: (userId) => string }
 */
export async function notifyMeeting(meeting, kind, opts = {}) {
  const def = KINDS[kind];
  if (!def) return;
  const recipients = await resolveRecipients(meeting, opts);
  const defaultMessage = {
    invited: `"${meeting.title}" · ${whenLabel(meeting)}`,
    updated: `"${meeting.title}" · ${whenLabel(meeting)}`,
    reminder: `"${meeting.title}" · ${whenLabel(meeting)}`,
    starting: `"${meeting.title}" is starting. Join now.`,
    started: `"${meeting.title}" is live. Join now.`,
    cancelled: `"${meeting.title}" was cancelled.`,
  }[kind];

  await Promise.allSettled(
    recipients.map((r) =>
      notificationService.createNotification({
        tenantId: r.tenantId,
        userId: r.userId,
        type: kind === 'reminder' ? 'reminder' : 'meeting',
        module: 'meeting',
        title: def.title(opts),
        message: opts.message || defaultMessage,
        relatedId: meeting._id,
        priority: def.priority,
        dedupeKey: opts.dedupeKey ? opts.dedupeKey(r.userId) : undefined,
        data: {
          kind: `meeting.${kind}`,
          meetingId: String(meeting._id),
          path: r.path,
          ...(def.join ? { action: 'join', actionLabel: 'Join Meeting', joinPath: r.joinPath } : {}),
        },
      })
    )
  );
}

/** Fire-and-forget wrapper for request handlers. */
export function notifyMeetingAsync(meeting, kind, opts) {
  notifyMeeting(meeting, kind, opts).catch((e) => console.error(`[meetings] notify ${kind} failed: ${e.message}`));
}
