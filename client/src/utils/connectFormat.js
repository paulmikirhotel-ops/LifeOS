import { format, isToday, isYesterday, differenceInCalendarDays, isSameDay } from 'date-fns';

/** Short time for the conversation list: 14:02, Yesterday, Mon, or 12 Oct. */
export function listTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Yesterday';
  if (differenceInCalendarDays(new Date(), d) < 7) return format(d, 'EEE');
  return format(d, 'd MMM');
}

export function dayLabel(iso) {
  const d = new Date(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, d MMMM yyyy');
}

/** Turns stored messages into what the chat pane draws (with day separators in between). */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/** [{u, e}] -> [{emoji, count, mine}] in a stable order. */
export function groupReactions(list = [], myId) {
  const map = new Map();
  for (const r of list) { const g = map.get(r.e) || { emoji: r.e, count: 0, mine: false }; g.count += 1; if (r.u === myId) g.mine = true; map.set(r.e, g); }
  return REACTIONS.filter((e) => map.has(e)).map((e) => map.get(e));
}

export function toBubbles(messages, myId, nameOf = () => '') {
  const out = [];
  let prev = null;
  for (const m of messages) {
    if (!prev || !isSameDay(new Date(prev.at), new Date(m.at))) out.push({ id: `day-${m.id}`, day: dayLabel(m.at) });
    if (m.kind === 'system') { out.push({ id: m.id, system: m.text }); prev = m; continue; }
    const mine = m.senderId === myId;
    out.push({
      id: m.id,
      kind: m.kind || 'text',
      text: m.deleted ? 'This message was deleted' : m.text,
      attachment: m.attachment || null,
      contact: m.contact || null,
      resource: m.resource || null,
      localUrl: m.localUrl || null,
      progress: m.progress,
      deleted: m.deleted,
      reactions: groupReactions(m.reactions, myId),
      forwarded: m.forwarded,
      mentions: m.mentions || [],
      mine,
      sender: mine ? '' : nameOf(m.senderId),
      time: format(new Date(m.at), 'HH:mm'),
      edited: m.edited,
      status: m.pending ? 'sending' : m.failed ? 'failed' : m.status,
      replyTo: m.replyTo?.text || null,
      raw: m,
    });
    prev = m;
  }
  return out;
}

export function conversationRow(c) {
  return { id: c.id, name: c.name, avatar: c.avatar, online: c.online, group: c.group, last: c.last || 'No messages yet', time: listTime(c.at), unread: c.unread, mine: c.mine, status: c.status, typing: c.typing, userId: c.userId, muted: c.muted, archived: c.archived, members: c.group ? `${c.memberCount} members` : undefined };
}

export function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
}

export const MAX_UPLOAD_MB = 25;
export const ACCEPT_MEDIA = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm';
export const ACCEPT_DOCS = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.mp3,.m4a,.ogg,.wav';

/** Returns an error message if the file is obviously not acceptable (the server checks again), else null. */
export function checkUpload(file) {
  if (file.size > MAX_UPLOAD_MB * 1048576) return `"${file.name}" is too big. The limit is ${MAX_UPLOAD_MB} MB.`;
  if (file.size === 0) return `"${file.name}" is empty.`;
  return null;
}

export function kindOfFile(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

export function conversationRowFull(c) {
  return { ...conversationRow(c), members: c.group ? `${c.memberCount} members` : undefined };
}
