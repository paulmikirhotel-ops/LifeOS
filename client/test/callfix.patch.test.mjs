import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, '..', 'scripts', 'apply-callfix-patch.mjs');

// The few lines of ConnectContext.jsx the patch looks for.
const FIXTURE = `import { kindOfFile } from '../utils/connectFormat.js';
export function ConnectProvider() {
  const refreshAll = useCallback(async () => {
    try {
      const r = await connectApi.activeCalls();
      setIncoming(r.data.incoming || null);
    } catch { /* calls are optional */ }
  }, [refreshConversations, refreshFriends, refreshSummary]);

  // Start when signed in, clear when signed out.
  useEffect(() => {}, []);
        case 'call': {
          if (ev.event === 'incoming') { setIncoming(call); setCallByConv((m) => ({ ...m, [call.conversationId]: call })); }
        }
  const messagesRef = useRef({});
  const callActions = useMemo(() => ({
    decline: async (call) => { setIncoming((cur) => (cur?.id === call.id ? null : cur)); try { await connectApi.declineCall(call.id); } catch { /* it may already be over */ } },
    dismiss: (call) => setIncoming((cur) => (cur?.id === call.id ? null : cur)),
  }), []);
}
`;

function setup(crlf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-callfix-client-'));
  fs.mkdirSync(path.join(dir, 'src', 'context'), { recursive: true });
  const file = path.join(dir, 'src', 'context', 'ConnectContext.jsx');
  fs.writeFileSync(file, crlf ? FIXTURE.replace(/\n/g, '\r\n') : FIXTURE);
  return { dir, file };
}
const run = (dir) => spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });

for (const crlf of [false, true]) {
  test(`client patch changes ConnectContext.jsx and is safe to re-run (${crlf ? 'CRLF' : 'LF'})`, () => {
    const { dir, file } = setup(crlf);
    try {
      const one = run(dir);
      assert.equal(one.status, 0, one.stderr + one.stdout);
      assert.ok(!/WARNING/.test(one.stderr));
      const text = fs.readFileSync(file, 'utf8');
      assert.match(text, /import \{ CALL_CHECK_MS, nextIncoming, acceptIncomingEvent \} from '\.\.\/utils\/callState\.js';/);
      assert.match(text, /const dismissedRef = useRef\(new Set\(\)\);/);
      assert.match(text, /applyServerIncoming\(r\.data\.incoming \|\| null\);/);
      assert.match(text, /refreshSummary, applyServerIncoming\]\);/);
      assert.match(text, /acceptIncomingEvent\(\{ current: cur, call, dismissed: dismissedRef\.current, myId \}\)/);
      assert.match(text, /decline: async \(call\) => \{ dismissedRef\.current\.add\(call\.id\);/);
      assert.match(text, /dismiss: \(call\) => \{ dismissedRef\.current\.add\(call\.id\);/);
      assert.match(text, /setInterval\(check, CALL_CHECK_MS\)/);
      if (crlf) assert.ok(!/[^\r]\n/.test(text), 'no bare LF in a CRLF file');
      const two = run(dir);
      assert.equal(two.status, 0);
      assert.ok(!/patched/.test(two.stdout));
      assert.equal(fs.readFileSync(file, 'utf8'), text);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('client patch writes nothing and warns when a spot is missing', () => {
  const { dir, file } = setup(false);
  try {
    fs.writeFileSync(file, 'export const nothing = 1;\n');
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /WARNING/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'export const nothing = 1;\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
