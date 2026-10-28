import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as realtime from '../src/services/realtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const patchScript = path.join(here, '..', 'scripts', 'apply-callfix-patch.mjs');

function fakeRes() {
  const res = new EventEmitter();
  res.chunks = [];
  res.write = (c) => { res.chunks.push(String(c)); return true; };
  return res;
}
const connectEvents = (res) => res.chunks.filter((c) => c.startsWith('event: connect'));

test('a call reaches every open connection of the person being called, wherever they are in the app', () => {
  const b1 = fakeRes();
  const b2 = fakeRes(); // a second tab or device of the same person
  const offB = [realtime.register('u-B', 'tenant-1', b1), realtime.register('u-B', 'tenant-2', b2)];
  realtime.emitToUser('u-B', 'connect', { kind: 'call', event: 'incoming', call: { id: 'c1' } });
  assert.equal(connectEvents(b1).length, 1);
  assert.equal(connectEvents(b2).length, 1);
  assert.match(connectEvents(b1)[0], /"event":"incoming"/);
  offB.forEach((f) => f());
});

test('an unauthorized user does not receive someone else\'s call', () => {
  const a = fakeRes();
  const b = fakeRes();
  const c = fakeRes(); // another person, signed in at the same time
  const offs = [realtime.register('u-A', 't', a), realtime.register('u-B', 't', b), realtime.register('u-C', 't', c)];
  realtime.emitToUser('u-B', 'connect', { kind: 'call', event: 'incoming', call: { id: 'secret' } });
  assert.equal(connectEvents(b).length, 1);
  assert.equal(connectEvents(a).length, 0);
  assert.equal(connectEvents(c).length, 0);
  assert.ok(!c.chunks.join('').includes('secret'));
  offs.forEach((f) => f());
});

test('a person who is offline simply gets nothing (the app finds the call when it reconnects)', () => {
  assert.doesNotThrow(() => realtime.emitToUser('u-nobody', 'connect', { kind: 'call' }));
  assert.equal(realtime.isOnline('u-nobody'), false);
});

test('after a connection closes, nothing more is sent to it and a reconnect works', () => {
  const first = fakeRes();
  realtime.register('u-R', 't', first);
  first.emit('close');
  realtime.emitToUser('u-R', 'connect', { kind: 'call', event: 'incoming' });
  assert.equal(connectEvents(first).length, 0);
  assert.equal(realtime.isOnline('u-R'), false);
  const again = fakeRes();
  const off = realtime.register('u-R', 't', again);
  realtime.emitToUser('u-R', 'connect', { kind: 'call', event: 'incoming' });
  assert.equal(connectEvents(again).length, 1);
  off();
});

const FIXTURE = `function toDto(call, conv, callerName) {
  return {
    id: String(call._id),
    startedAt: call.startedAt || null,
    ringingUntil: new Date(new Date(call.createdAt).getTime() + RING_MS),
    joined: [],
  };
}
`;

for (const crlf of [false, true]) {
  test(`server patch adds ringLeftMs once and is safe to re-run (${crlf ? 'CRLF' : 'LF'})`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-callfix-'));
    try {
      fs.mkdirSync(path.join(dir, 'src', 'services'), { recursive: true });
      const file = path.join(dir, 'src', 'services', 'connectCall.service.js');
      fs.writeFileSync(file, crlf ? FIXTURE.replace(/\n/g, '\r\n') : FIXTURE);
      const run = () => spawnSync(process.execPath, [patchScript], { cwd: dir, encoding: 'utf8' });
      const one = run();
      assert.equal(one.status, 0, one.stderr);
      assert.match(one.stdout, /patched/);
      const text = fs.readFileSync(file, 'utf8');
      assert.equal((text.match(/ringLeftMs/g) || []).length, 1);
      assert.match(text, /ringLeftMs: Math\.max\(0, new Date\(call\.createdAt\)\.getTime\(\) \+ RING_MS - Date\.now\(\)\)/);
      if (crlf) assert.ok(!/[^\r]\n/.test(text));
      const two = run();
      assert.match(two.stdout, /nothing to do/);
      assert.equal(fs.readFileSync(file, 'utf8'), text);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('server patch warns (and changes nothing) when the line it needs is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-callfix-'));
  try {
    fs.mkdirSync(path.join(dir, 'src', 'services'), { recursive: true });
    const file = path.join(dir, 'src', 'services', 'connectCall.service.js');
    fs.writeFileSync(file, 'export const nothing = 1;\n');
    const r = spawnSync(process.execPath, [patchScript], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /WARNING/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'export const nothing = 1;\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
