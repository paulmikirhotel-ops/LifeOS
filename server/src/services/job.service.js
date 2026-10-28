import mongoose from 'mongoose';
import { Job } from '../models/index.js';

/**
 * Durable, single-worker background queue backed by MongoDB.
 *
 * Why not in-memory? Render can restart the API at any time. Jobs are persisted, claimed
 * atomically, retried with exponential backoff, and stale locks (a crash mid-job) are
 * reclaimed. Concurrency is 1 on purpose: a small instance must not run several
 * transcript/LLM jobs at once.
 */

const TICK_MS = 4000;
const STALE_LOCK_MS = 20 * 60 * 1000;

const handlers = new Map(); // type -> { run(job), onFinalFailure?(job, err) }
let timer = null;
let busy = false;

// Log prefix per job type, so a developer can follow one meeting through the pipeline in the terminal.
const TAGS = { finalize_recording: 'recording', transcribe: 'transcription', analyze: 'summary', minutes: 'minutes' };
const tag = (type) => TAGS[type] || 'jobs';

const TRANSIENT = /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|ENOTFOUND|MongoNetworkError|MongoServerSelectionError|socket hang up|topology was destroyed|connection .* closed/i;
const isTransient = (err) => TRANSIENT.test(`${err?.code || ''} ${err?.name || ''} ${err?.message || ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retries a short database write a few times when the connection was reset under us (not for long-running work). */
async function withRetry(label, fn, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || i === tries - 1) break;
      console.warn(`[jobs] ${label}: ${err.message} - retrying (${i + 1}/${tries - 1})`);
      await sleep(500 * 2 ** i);
    }
  }
  throw lastErr;
}

export function registerJobHandler(type, run, onFinalFailure) {
  handlers.set(type, { run, onFinalFailure });
}

/** De-duplicated: at most one queued/running job per (meeting, type). */
export async function enqueue(type, { tenantId, meetingId, payload = {}, delayMs = 0, maxAttempts = 3 }) {
  const runAt = new Date(Date.now() + delayMs);
  const res = await Job.findOneAndUpdate(
    { meetingId, type, status: { $in: ['queued', 'running'] } },
    { $setOnInsert: { type, tenantId, meetingId, payload, runAt, maxAttempts, status: 'queued', attempts: 0 } },
    { upsert: true, new: true, includeResultMetadata: true }
  );
  // includeResultMetadata gives { value, lastErrorObject }; tolerate a plain document too (unit-test fakes).
  const job = res && 'value' in res ? res.value : res;
  if (res?.lastErrorObject?.updatedExisting) {
    console.log(`[${tag(type)}] job already ${job?.status || 'queued'} - not creating a duplicate (meeting ${meetingId})`);
  } else {
    console.log(`[${tag(type)}] job created (meeting ${meetingId}${job?._id ? `, job ${job._id}` : ''})`);
  }
  return job;
}

export async function updatePayload(jobId, patch) {
  const set = {};
  for (const [k, v] of Object.entries(patch)) set[`payload.${k}`] = v;
  await Job.updateOne({ _id: jobId }, { $set: set });
}

async function tick() {
  if (busy || mongoose.connection.readyState !== 1) return; // skip while the DB is not connected
  busy = true;
  let claimed = null;
  try {
    // Reclaim jobs whose worker died mid-run.
    await Job.updateMany(
      { status: 'running', lockedAt: { $lt: new Date(Date.now() - STALE_LOCK_MS) } },
      { $set: { status: 'queued', runAt: new Date() } }
    );

    const job = await Job.findOneAndUpdate(
      { status: 'queued', runAt: { $lte: new Date() } },
      { $set: { status: 'running', lockedAt: new Date() }, $inc: { attempts: 1 } },
      { sort: { runAt: 1 }, new: true }
    );
    if (!job) return;

    claimed = job;

    const h = handlers.get(job.type);
    if (!h) {
      console.error(`[jobs] job failed: no handler registered for type "${job.type}" (meeting ${job.meetingId})`);
      await Job.updateOne({ _id: job._id }, { $set: { status: 'failed', lastError: 'No handler', finishedAt: new Date() } });
      return;
    }
    const t0 = Date.now();
    console.log(`[${tag(job.type)}] job started (meeting ${job.meetingId}, attempt ${job.attempts}/${job.maxAttempts})`);
    try {
      await h.run(job);
      await withRetry('mark job done', () =>
        Job.updateOne({ _id: job._id }, { $set: { status: 'done', finishedAt: new Date() }, $unset: { lastError: 1 } })
      );
      console.log(`[${tag(job.type)}] job done in ${Math.round((Date.now() - t0) / 1000)}s (meeting ${job.meetingId})`);
    } catch (err) {
      const message = String(err?.message || err).slice(0, 900);
      const giveUp = job.attempts >= job.maxAttempts || err?.permanent;
      console.error(`[jobs] job failed: ${job.type} (meeting ${job.meetingId}) attempt ${job.attempts}/${job.maxAttempts}: ${message}${giveUp ? ' - giving up' : ''}`);
      if (giveUp) {
        await withRetry('mark job failed', () =>
          Job.updateOne({ _id: job._id }, { $set: { status: 'failed', lastError: message, finishedAt: new Date() } })
        );
        try {
          await withRetry('final-failure handler', () => h.onFinalFailure?.(job, err));
        } catch (e) {
          console.error(`[jobs] onFinalFailure error: ${e.message}`);
        }
      } else {
        const backoff = 30_000 * 2 ** (job.attempts - 1);
        console.warn(`[jobs] ${job.type} (meeting ${job.meetingId}) will be retried in ${Math.round(backoff / 1000)}s`);
        await withRetry('requeue job', () =>
          Job.updateOne({ _id: job._id }, { $set: { status: 'queued', runAt: new Date(Date.now() + backoff), lastError: message } })
        );
      }
    }
  } catch (err) {
    console.error(`[jobs] tick error: ${err.message}`);
    // The connection dropped while we held a job. Hand it back right away instead of leaving it "running"
    // (and invisible) until the stale-lock timeout, which is how a transcript used to stall for 20 minutes.
    if (claimed) {
      try {
        await Job.updateOne({ _id: claimed._id, status: 'running' }, { $set: { status: 'queued', runAt: new Date(Date.now() + 5000) } });
        console.warn(`[jobs] released ${claimed.type} (meeting ${claimed.meetingId}) back to the queue`);
      } catch (e) {
        console.error(`[jobs] could not release job: ${e.message}`);
      }
    }
  } finally {
    busy = false;
  }
}

export function startJobRunner() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
  console.log('[jobs] runner started');
}

export function stopJobRunner() {
  if (timer) clearInterval(timer);
  timer = null;
}
