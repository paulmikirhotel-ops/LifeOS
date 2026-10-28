#!/usr/bin/env node
/**
 * App half of the incoming-call fix. Run from the client folder (safe to run again):
 *   node scripts/apply-callfix-patch.mjs
 *
 * Changes client/src/context/ConnectContext.jsx (nothing else):
 *   1. A ringing call is now picked with the rules in utils/callState.js: the same call is never shown twice,
 *      and a call I answered, declined or let ring out never comes back.
 *   2. Safety net: every few seconds (and when the app wakes up or comes back online) it asks the server
 *      "is anything ringing for me?", so a call still shows up even if the live connection is slow or blocked.
 * Prints "patched", "nothing to do" or "WARNING" per step.
 */
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src', 'context', 'ConnectContext.jsx');
if (!fs.existsSync(file)) {
  console.warn(`WARNING: ${file} not found. Run this from the client folder.`);
  process.exit(1);
}
let src = fs.readFileSync(file, 'utf8');
const nl = src.includes('\r\n') ? '\r\n' : '\n';
const L = (text) => text.replace(/\n/g, nl);
let failed = false;

function step(name, done, find, replace) {
  if (src.includes(done)) {
    console.log(`${name}: nothing to do`);
    return;
  }
  const m = typeof find === 'string' ? (src.includes(find) ? find : null) : src.match(find)?.[0];
  if (!m) {
    console.warn(`WARNING: ${name}: could not find the spot to change. Nothing was changed for this step.`);
    failed = true;
    return;
  }
  src = src.replace(m, () => replace(m));
  console.log(`${name}: patched`);
}

step(
  'import',
  "from '../utils/callState.js'",
  "import { kindOfFile } from '../utils/connectFormat.js';",
  (m) => `${m}${nl}` + L("import { CALL_CHECK_MS, nextIncoming, acceptIncomingEvent } from '../utils/callState.js';")
);

step(
  'helper',
  'applyServerIncoming = useCallback',
  /^[ \t]*const refreshAll = useCallback\(async \(\) => \{/m,
  (m) =>
    L(`  // Calls I am done with (answered, declined, rang out). They never come back on screen, even if a late answer from the server mentions them.
  const dismissedRef = useRef(new Set());
  const applyServerIncoming = useCallback((fromServer) => {
    setIncoming((cur) => nextIncoming({ current: cur, fromServer, dismissed: dismissedRef.current }));
  }, []);
`) + m
);

step('refreshAll uses helper', 'applyServerIncoming(r.data.incoming || null);', 'setIncoming(r.data.incoming || null);', () => 'applyServerIncoming(r.data.incoming || null);');

step(
  'refreshAll deps',
  '[refreshConversations, refreshFriends, refreshSummary, applyServerIncoming]',
  '[refreshConversations, refreshFriends, refreshSummary]);\n\n  // Start when signed in'.replace(/\n/g, nl),
  () => '[refreshConversations, refreshFriends, refreshSummary, applyServerIncoming]);' + nl + nl + '  // Start when signed in'
);

step(
  'incoming event',
  'acceptIncomingEvent({',
  /if \(ev\.event === 'incoming'\) \{ setIncoming\(call\);/,
  () => "if (ev.event === 'incoming') { setIncoming((cur) => acceptIncomingEvent({ current: cur, call, dismissed: dismissedRef.current, myId }));"
);

step(
  'decline',
  'dismissedRef.current.add(call.id); setIncoming',
  /decline: async \(call\) => \{ setIncoming/,
  () => 'decline: async (call) => { dismissedRef.current.add(call.id); setIncoming'
);

step(
  'dismiss',
  'dismiss: (call) => { dismissedRef.current.add(call.id);',
  /dismiss: \(call\) => setIncoming\(\(cur\) => \(cur\?\.id === call\.id \? null : cur\)\),/,
  () => 'dismiss: (call) => { dismissedRef.current.add(call.id); setIncoming((cur) => (cur?.id === call.id ? null : cur)); },'
);

step(
  'safety-net check',
  'CALL_CHECK_MS)',
  /^[ \t]*const messagesRef = useRef\(\{\}\);/m,
  (m) =>
    L(`  // Safety net for the live connection: if it is slow, blocked or asleep, a ringing call is still found within a few seconds.
  // (A phone that is closed or in the background is reached by the push notification instead.)
  useEffect(() => {
    if (!myId || !summary.callsEnabled) return undefined;
    let stopped = false;
    const check = async () => {
      if (stopped || document.hidden) return;
      try {
        const r = await connectApi.activeCalls();
        if (stopped) return;
        applyServerIncoming(r.data.incoming || null);
        setCallByConv((m) => ({ ...m, ...Object.fromEntries([r.data.incoming, r.data.ongoing].filter(Boolean).map((c) => [c.conversationId, c])) }));
      } catch { /* the next check will try again */ }
    };
    const timer = setInterval(check, CALL_CHECK_MS);
    const wake = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
    };
  }, [myId, summary.callsEnabled, applyServerIncoming]);

`) + m
);

if (!failed) fs.writeFileSync(file, src);
else console.warn('WARNING: ConnectContext.jsx was NOT written because at least one step failed.');
process.exit(failed ? 1 : 0);
