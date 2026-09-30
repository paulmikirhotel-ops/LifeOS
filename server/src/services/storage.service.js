import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Object storage for meeting audio.
 *
 *  - 's3'    : any S3-compatible store (Cloudflare R2 recommended). Buckets stay PRIVATE;
 *              playback uses short-lived presigned URLs.
 *  - 'local' : development only (files on disk). Refused in production because hosts like
 *              Render's free tier have an ephemeral filesystem — recordings would vanish.
 *
 * The AWS SDK is imported lazily so the API boots even where it is not installed
 * (e.g. local dev with the 'local' driver).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_ROOT = path.resolve(__dirname, '../../storage-dev');

const notConfigured = () =>
  new ApiError(503, 'Recording storage is not configured on the server', { code: 'STORAGE_NOT_CONFIGURED' });

export function storageConfigured() {
  const s = env.storage;
  if (s.driver === 's3') return Boolean(s.bucket && s.endpoint && s.accessKeyId && s.secretAccessKey);
  if (s.driver === 'local') return !env.isProd || s.allowLocalInProd;
  return false;
}

export function storageDriver() {
  return env.storage.driver;
}

// ── S3 driver ─────────────────────────────────────────────────────────

let s3 = null;
async function s3Client() {
  if (s3) return s3;
  const sdk = await import('@aws-sdk/client-s3');
  const c = env.storage;
  s3 = {
    sdk,
    bucket: c.bucket,
    client: new sdk.S3Client({
      region: c.region,
      endpoint: c.endpoint,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    }),
  };
  return s3;
}

// ── Public API ────────────────────────────────────────────────────────

export async function putObject(key, buffer, contentType = 'application/octet-stream') {
  if (!storageConfigured()) throw notConfigured();
  if (env.storage.driver === 'local') {
    const file = localPath(key);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, buffer);
    return;
  }
  const { sdk, client, bucket } = await s3Client();
  await client.send(new sdk.PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }));
}

/** Streams an object (optionally a byte range). Returns { stream, size, contentRange? }. */
export async function getObject(key, range) {
  if (!storageConfigured()) throw notConfigured();
  if (env.storage.driver === 'local') {
    const file = localPath(key);
    const stat = await fsp.stat(file).catch(() => null);
    if (!stat) throw ApiError.notFound('Recording file not found');
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
      return {
        stream: fs.createReadStream(file, { start, end }),
        size: end - start + 1,
        contentRange: `bytes ${start}-${end}/${stat.size}`,
        totalSize: stat.size,
      };
    }
    return { stream: fs.createReadStream(file), size: stat.size, totalSize: stat.size };
  }
  const { sdk, client, bucket } = await s3Client();
  try {
    const r = await client.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key, Range: range }));
    return { stream: r.Body, size: r.ContentLength, contentRange: r.ContentRange, totalSize: undefined };
  } catch (err) {
    if (err?.name === 'NoSuchKey') throw ApiError.notFound('Recording file not found');
    throw err;
  }
}

export async function deletePrefix(prefix) {
  if (!storageConfigured()) return;
  if (env.storage.driver === 'local') {
    await fsp.rm(localPath(prefix), { recursive: true, force: true });
    return;
  }
  const { sdk, client, bucket } = await s3Client();
  let token;
  do {
    const list = await client.send(
      new sdk.ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
    );
    const objects = (list.Contents || []).map((o) => ({ Key: o.Key }));
    if (objects.length) {
      await client.send(new sdk.DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
}

export async function deleteObject(key) {
  if (!storageConfigured()) return;
  if (env.storage.driver === 'local') {
    await fsp.rm(localPath(key), { force: true });
    return;
  }
  const { sdk, client, bucket } = await s3Client();
  await client.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Concatenates chunk objects (in order) into one object WITHOUT holding the recording in
 * memory: chunks are streamed one after another into a multipart upload.
 * Returns the total size in bytes.
 */
export async function assemble(chunkKeys, destKey, contentType) {
  if (!storageConfigured()) throw notConfigured();
  if (env.storage.driver === 'local') {
    const dest = localPath(destKey);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const out = fs.createWriteStream(dest);
    for (const key of chunkKeys) {
      await new Promise((resolve, reject) => {
        const src = fs.createReadStream(localPath(key));
        src.on('error', reject);
        src.on('end', resolve);
        src.pipe(out, { end: false });
      });
    }
    await new Promise((resolve) => out.end(resolve));
    return (await fsp.stat(dest)).size;
  }

  const { sdk, client, bucket } = await s3Client();
  const { Upload } = await import('@aws-sdk/lib-storage');
  let total = 0;
  async function* body() {
    for (const key of chunkKeys) {
      const r = await client.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key }));
      for await (const part of r.Body) {
        total += part.length;
        yield part;
      }
    }
  }
  const upload = new Upload({
    client,
    params: { Bucket: bucket, Key: destKey, Body: Readable.from(body()), ContentType: contentType },
    queueSize: 2,
    partSize: 5 * 1024 * 1024,
  });
  await upload.done();
  return total;
}

/**
 * A URL the browser (or Deepgram) can fetch for a limited time.
 *  - s3: presigned GET straight from the bucket (no bandwidth through the API server).
 *  - local: API stream URL protected by a signed, expiring token (no cookies needed for <audio>).
 */
export async function getSignedReadUrl(key, { meetingId, ttlSec = 900, apiBase = '' } = {}) {
  if (!storageConfigured()) throw notConfigured();
  const expiresAt = new Date(Date.now() + ttlSec * 1000);
  if (env.storage.driver === 'local') {
    const token = jwt.sign({ typ: 'rec', mid: String(meetingId), key }, env.jwt.secret, { expiresIn: ttlSec });
    return { url: `${apiBase}/api/meetings/${meetingId}/recording/stream?token=${token}`, expiresAt };
  }
  const { sdk, client, bucket } = await s3Client();
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const url = await getSignedUrl(client, new sdk.GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: ttlSec,
  });
  return { url, expiresAt };
}

export function verifyStreamToken(token, meetingId) {
  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secret);
  } catch {
    throw ApiError.unauthorized('Playback link expired or invalid');
  }
  if (payload.typ !== 'rec' || payload.mid !== String(meetingId)) {
    throw ApiError.unauthorized('Playback link expired or invalid');
  }
  return payload.key;
}

function localPath(key) {
  const p = path.resolve(LOCAL_ROOT, key);
  if (!p.startsWith(LOCAL_ROOT)) throw ApiError.badRequest('Invalid storage key'); // path traversal guard
  return p;
}

// ── Key helpers ───────────────────────────────────────────────────────

export const keys = {
  chunk: (tenantId, meetingId, index) =>
    `meetings/${tenantId}/${meetingId}/chunks/${String(index).padStart(6, '0')}`,
  recording: (tenantId, meetingId, ext) => `meetings/${tenantId}/${meetingId}/recording.${ext}`,
  prefix: (tenantId, meetingId) => `meetings/${tenantId}/${meetingId}/`,
};

const EXT_BY_MIME = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
export function extFor(mime = '') {
  return EXT_BY_MIME[mime.split(';')[0].trim().toLowerCase()] || 'bin';
}
