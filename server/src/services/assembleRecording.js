import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { groupBySegment } from './recordingSegments.js';
import { concatAudio } from './audioConcat.js';

/**
 * Builds the final recording file from the uploaded chunks.
 *
 *  - One segment (every recording made before hand-off existed, and any meeting nobody took over):
 *    the chunks are streamed together exactly as before.
 *  - Several segments: each segment is assembled on its own, then ffmpeg joins them into one file.
 *    If ffmpeg is unavailable or fails, the chunks are joined byte by byte (the old behaviour) so the audio
 *    is never lost, and `joined: false` tells the caller to flag it.
 *
 * `storage` and `concat` are injected so this can be tested without a database.
 */
export async function assembleRecording({ tenantId, meetingId, seen, mime, storage, concat = concatAudio, log = console }) {
  const groups = groupBySegment(seen);
  const ext = storage.extFor(mime);
  const dest = storage.keys.recording(tenantId, meetingId, ext);
  const keyOf = (i) => storage.keys.chunk(tenantId, meetingId, i);
  const allKeys = groups.flatMap((g) => g.indexes.map(keyOf));

  if (groups.length <= 1) {
    const size = await storage.assemble(allKeys, dest, mime);
    return { dest, size, mime, chunkKeys: allKeys, segments: groups.length, joined: true };
  }

  const tmpKeys = [];
  let dir;
  try {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lifeos-seg-'));
    const files = [];
    for (const g of groups) {
      const segKey = `${storage.keys.prefix(tenantId, meetingId)}segment-${g.segment}.${ext}`;
      tmpKeys.push(segKey);
      await storage.assemble(g.indexes.map(keyOf), segKey, mime);
      const file = path.join(dir, `segment-${g.segment}.${ext}`);
      await storage.downloadToFile(segKey, file);
      files.push(file);
    }
    const out = path.join(dir, 'joined.webm');
    await concat(files, out);
    const joinedDest = storage.keys.recording(tenantId, meetingId, 'webm');
    const size = await storage.putFile(out, joinedDest, 'audio/webm');
    return { dest: joinedDest, size, mime: 'audio/webm', chunkKeys: allKeys, segments: groups.length, joined: true };
  } catch (err) {
    log.error(`[recording] joining ${groups.length} segments failed (${err.message}); falling back to a plain join`);
    const size = await storage.assemble(allKeys, dest, mime);
    return { dest, size, mime, chunkKeys: allKeys, segments: groups.length, joined: false };
  } finally {
    await Promise.all(tmpKeys.map((k) => storage.deleteObject(k).catch(() => {})));
    if (dir) await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
