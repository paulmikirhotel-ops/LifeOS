import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  STRIDE, segmentOf, localIndex, startIndexFor, groupBySegment, isRecorderStale, claimDecision, uploadDecision, RECORDER_STALE_MS,
} from '../src/services/recordingSegments.js';
import { concatAudio, ffmpegPath } from '../src/services/audioConcat.js';

const NOW = 1_000_000_000;

test('segment index maths', () => {
  assert.equal(segmentOf(0), 0);
  assert.equal(segmentOf(STRIDE - 1), 0);
  assert.equal(segmentOf(STRIDE), 1);
  assert.equal(localIndex(STRIDE + 7), 7);
  assert.equal(startIndexFor(3), 3 * STRIDE);
});

test('groupBySegment orders, de-duplicates and ignores junk', () => {
  const g = groupBySegment([STRIDE + 1, 2, 0, 1, 2, STRIDE, -4, 1.5, 'x']);
  assert.deepEqual(g, [
    { segment: 0, indexes: [0, 1, 2] },
    { segment: 1, indexes: [STRIDE, STRIDE + 1] },
  ]);
  assert.deepEqual(groupBySegment([]), []);
});

test('isRecorderStale', () => {
  assert.equal(isRecorderStale(null, NOW), true);
  assert.equal(isRecorderStale({ userId: 'a', heartbeatAt: NOW - 1000 }, NOW), false);
  assert.equal(isRecorderStale({ userId: 'a', heartbeatAt: NOW - RECORDER_STALE_MS - 1 }, NOW), true);
  assert.equal(isRecorderStale({ userId: 'a' }, NOW), true);
});

test('claimDecision: free, same person, stale takeover, busy', () => {
  assert.deepEqual(claimDecision({ active: null, userId: 'a', now: NOW }), { ok: true });
  assert.deepEqual(claimDecision({ active: { userId: 'a', heartbeatAt: NOW }, userId: 'a', now: NOW }), { ok: true });
  assert.deepEqual(claimDecision({ active: { userId: 'a', heartbeatAt: NOW - 60_000 }, userId: 'b', now: NOW }), { ok: true, takeover: true });
  assert.deepEqual(claimDecision({ active: { userId: 'a', name: 'Amara', heartbeatAt: NOW - 1000 }, userId: 'b', now: NOW }), { ok: false, by: 'Amara' });
});

test('uploadDecision: only the current recorder, or the organizer in the old flow', () => {
  const live = { userId: 'a', heartbeatAt: NOW };
  assert.equal(uploadDecision({ active: live, userId: 'a', isOrganizer: false, now: NOW }).ok, true);
  assert.equal(uploadDecision({ active: live, userId: 'b', isOrganizer: false, now: NOW }).ok, false);
  assert.equal(uploadDecision({ active: live, userId: 'org', isOrganizer: true, now: NOW }).ok, false); // someone else is recording
  assert.equal(uploadDecision({ active: null, userId: 'org', isOrganizer: true, now: NOW }).ok, true); // old flow
  assert.equal(uploadDecision({ active: null, userId: 'b', isOrganizer: false, now: NOW }).ok, false);
});

test('concatAudio joins two separate webm recordings into one playable file', async (t) => {
  const bin = await ffmpegPath();
  if (spawnSync(bin, ['-version']).status !== 0) return t.skip('ffmpeg not available');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'seg-'));
  try {
    const mk = (name, hz) => {
      const f = path.join(dir, name);
      const r = spawnSync(bin, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=2`, '-ac', '1', '-c:a', 'libopus', '-b:a', '32k', f]);
      assert.equal(r.status, 0, String(r.stderr));
      return f;
    };
    const a = mk('a.webm', 440);
    const b = mk('b.webm', 880);
    const out = path.join(dir, 'out.webm');
    await concatAudio([a, b], out);
    const probe = spawnSync(bin, ['-i', out, '-f', 'null', '-'], { encoding: 'utf8' });
    const m = /time=(\d+):(\d+):(\d+\.\d+)/g;
    let last; let x;
    while ((x = m.exec(probe.stderr))) last = x;
    const secs = Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
    assert.ok(secs > 3.5 && secs < 4.6, `expected about 4 s, got ${secs}`);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('concatAudio rejects an empty list', async () => {
  await assert.rejects(() => concatAudio([], '/tmp/x.webm'));
});

import * as realStorage from '../src/services/storage.service.js';
import { assembleRecording } from '../src/services/assembleRecording.js';

async function ffmpegOk() {
  return spawnSync(await ffmpegPath(), ['-version']).status === 0;
}
function duration(bin, file) {
  const probe = spawnSync(bin, ['-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /time=(\d+):(\d+):(\d+\.\d+)/g;
  let last; let x;
  while ((x = m.exec(probe.stderr))) last = x;
  return Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
}

test('concatAudio also joins different formats (WebM/Opus + MP4/AAC)', async (t) => {
  if (!(await ffmpegOk())) return t.skip('ffmpeg not available');
  const bin = await ffmpegPath();
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'seg-'));
  try {
    const a = path.join(dir, 'a.webm');
    const b = path.join(dir, 'b.m4a');
    assert.equal(spawnSync(bin, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'libopus', a]).status, 0);
    assert.equal(spawnSync(bin, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=2', '-c:a', 'aac', b]).status, 0);
    const out = path.join(dir, 'out.webm');
    await concatAudio([a, b], out);
    const secs = duration(bin, out);
    assert.ok(secs > 3.5 && secs < 4.7, `got ${secs}`);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('assembleRecording: one segment keeps the old single-file path', async () => {
  const calls = [];
  const storage = {
    extFor: () => 'webm',
    keys: realStorage.keys,
    assemble: async (keys, dest) => { calls.push({ keys, dest }); return 123; },
  };
  const r = await assembleRecording({ tenantId: 't', meetingId: 'm', seen: [0, 1, 2], mime: 'audio/webm', storage });
  assert.equal(r.segments, 1);
  assert.equal(r.joined, true);
  assert.equal(r.size, 123);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].keys.length, 3);
});

test('assembleRecording: two segments are joined into one real file (local storage + ffmpeg)', async (t) => {
  if (!(await ffmpegOk())) return t.skip('ffmpeg not available');
  const bin = await ffmpegPath();
  const tenantId = 'testtenant';
  const meetingId = `m${Date.now()}`;
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'seg-'));
  try {
    // Make two separate recordings and cut each into 3 pieces, like the browser's 10 s chunks.
    const mkChunks = async (name, hz, startIndex) => {
      const f = path.join(dir, name);
      assert.equal(spawnSync(bin, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=3`, '-ac', '1', '-c:a', 'libopus', '-b:a', '32k', f]).status, 0);
      const buf = await fsp.readFile(f);
      const third = Math.ceil(buf.length / 3);
      for (let i = 0; i < 3; i += 1) {
        await realStorage.putObject(realStorage.keys.chunk(tenantId, meetingId, startIndex + i), buf.subarray(i * third, (i + 1) * third), 'audio/webm');
      }
    };
    await mkChunks('s0.webm', 440, 0); // segment 0
    await mkChunks('s1.webm', 880, STRIDE); // segment 1 (a second recorder took over)

    const r = await assembleRecording({
      tenantId, meetingId, seen: [0, 1, 2, STRIDE, STRIDE + 1, STRIDE + 2], mime: 'audio/webm', storage: realStorage, log: { error: () => {} },
    });
    assert.equal(r.segments, 2);
    assert.equal(r.joined, true);
    assert.equal(r.mime, 'audio/webm');
    assert.ok(r.size > 1000);

    const out = path.join(dir, 'final.webm');
    const { stream } = await realStorage.getObject(r.dest);
    await fsp.writeFile(out, Buffer.concat(await (async () => { const parts = []; for await (const c of stream) parts.push(c); return parts; })()));
    const secs = duration(bin, out);
    assert.ok(secs > 5.4 && secs < 6.8, `expected about 6 s, got ${secs}`);
  } finally {
    await realStorage.deletePrefix(realStorage.keys.prefix(tenantId, meetingId));
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('assembleRecording falls back to a plain join when ffmpeg fails', async () => {
  const assembled = [];
  const storage = {
    extFor: () => 'webm',
    keys: realStorage.keys,
    assemble: async (keys, dest) => { assembled.push({ n: keys.length, dest }); return 77; },
    downloadToFile: async (key, file) => { await fsp.writeFile(file, 'x'); },
    putFile: async () => 1,
    deleteObject: async () => {},
  };
  const r = await assembleRecording({
    tenantId: 't', meetingId: 'm', seen: [0, STRIDE], mime: 'audio/webm', storage,
    concat: async () => { throw new Error('boom'); }, log: { error: () => {} },
  });
  assert.equal(r.joined, false);
  assert.equal(r.size, 77);
  assert.equal(assembled.at(-1).n, 2); // all chunks, plain join
});
