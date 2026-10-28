// Run once from the server folder AFTER "npm install web-push":  node scripts/apply-push-patch.mjs
// Wires alerts into: LifeOS notifications, Connect notifications, new Connect messages, incoming calls. Safe to run twice.
import fs from 'node:fs';
const edit = (file, fn) => {
  if (!fs.existsSync(file)) return console.log('skip (file not in your project):', file);
  const a = fs.readFileSync(file, 'utf8'), b = fn(a);
  if (a === b) return console.log('unchanged:', file);
  fs.writeFileSync(file, b); console.log('patched:  ', file);
};
const addImport = (s, line) => {
  if (s.includes("push.service.js")) return s;
  const m = s.match(/^import [^\n]*\n(?![\s\S]*^import )/m); // after the LAST import line
  const all = [...s.matchAll(/^import [^\n]*\n/gm)];
  if (!all.length) return line + '\n' + s;
  const last = all[all.length - 1];
  return s.slice(0, last.index + last[0].length) + line + '\n' + s.slice(last.index + last[0].length);
};
const after = (s, anchor, add, label) => {
  if (s.includes(add.trim().split('\n')[0].trim())) return s;
  if (!s.includes(anchor)) { console.log('WARNING: anchor not found for', label, '- tell Claude'); return s; }
  return s.replace(anchor, anchor + add);
};
const IMP = "import { pushToUser } from './push.service.js';";

// 1) mount /api/push
edit('src/routes/index.js', (s) => {
  if (s.includes('pushRoutes')) return s;
  s = s.replace(/(import authRoutes from '\.\/auth\.routes\.js';)/, `$1\nimport pushRoutes from './push.routes.js';`);
  return s.replace(/(router\.use\('\/auth', authRoutes\);)/, `$1\nrouter.use('/push', pushRoutes);`);
});
// 2) LifeOS notifications (tasks due, meetings, goals ...)
edit('src/services/notification.service.js', (s) => {
  s = addImport(s, IMP);
  return after(s, "realtime.emit(String(userId), String(tenantId), { event: 'notification:created', notification: clientShape });",
    "\n    pushToUser(userId, { title: clientShape.title, body: message || '', url: '/notifications', tag: String(type), urgent: priority === 'high' });", 'notification.service');
});
// 3) Connect notifications (friend requests, shared items ...)
edit('src/services/connectNotify.service.js', (s) => {
  s = addImport(s, IMP);
  return after(s, "realtime.emitToUser(userId, 'connect', { kind: 'notification', item: dto(n.toObject()) });",
    "\n    pushToUser(userId, { title: n.title, body: n.body, url: link, tag: `cn-${type}` });", 'connectNotify.service');
});
// 4) new Connect chat messages (not for muted chats)
edit('src/services/connect.service.js', (s) => {
  s = addImport(s, IMP);
  return after(s, "from: { id: String(me), name: sender?.name || 'Someone' } });",
    `
  for (const uid of othersOf(c, me)) {
    const muted = (c.prefs || []).some((p) => String(p.userId) === String(uid) && p.muted);
    if (!muted) pushToUser(uid, { title: isGroup(c) ? \`\${c.name || 'Group'}\` : sender?.name || 'New message', body: line, url: '/connect/chats', tag: \`chat-\${c._id}\` });
  }`, 'connect.service');
});
// 5) incoming calls ring even when the app is closed
edit('src/services/connectCall.service.js', (s) => {
  s = addImport(s, IMP);
  return after(s, "tell(conv, { kind: 'call', event: 'incoming', call: dto, from: { id: String(me), name: callerName } }, me);",
    "\n  membersOf(conv).filter((m) => m !== String(me)).forEach((m) => pushToUser(m, { title: `${callerName} is calling`, body: call.mode === 'video' ? 'Incoming video call' : 'Incoming voice call', url: '/connect', tag: `call-${call._id}`, urgent: true }));", 'connectCall.service');
});
// 6) alerts stop when a user signs out, signs out everywhere, or deletes the account
edit('src/services/auth.service.js', (s) => {
  s = addImport(s, "import { removeAllForUser as removePush } from './push.service.js';");
  if (s.includes('removePush(userId)')) return s;
  const r = s.replace(/(export async function logout\(userId\) \{\n)/, `$1  await removePush(userId);\n`);
  if (r === s) console.log('WARNING: could not patch logout in auth.service.js - tell Claude');
  return r;
});
edit('src/services/account.service.js', (s) => {
  s = addImport(s, "import { removeAllForUser as removePush } from './push.service.js';");
  if (!s.includes('removePush(userId);')) {
    s = s.replace(/(export async function signOutEverywhere\(userId\) \{\n)/, `$1  await removePush(userId);\n`);
    s = s.replace(/(await authService\.deleteAccount\(userId\);[^\n]*\n)/, `$1  await removePush(userId);\n`);
  }
  // push keys must never appear in a user's data export
  return s.replace("const SECRET_KEY = /hash|token|secret|password/i;", "const SECRET_KEY = /hash|token|secret|password|^(p256dh|auth|endpoint)$/i;");
});
console.log('\nDone. Make sure VAPID_* keys are in .env (see docs/PUSH_SETUP.md), then restart the server.');
