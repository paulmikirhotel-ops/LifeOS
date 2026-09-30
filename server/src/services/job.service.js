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

export function registerJobHandler(type, run, onFinalFailure) {
  handlers.set(type, { run, onFinalFailure });
}

/** De-duplicated: at most one queued/running job per (meeting, type). */
export async function enqueue(type, { tenantId, meetingId, payload = {}, delayMs = 0, maxAttempts = 3 }) {
  const runAt = new Date(Date.now() + delayMs);
  const job = await Job.findOneAndUpdate(
    { meetingId, type, status: { $in: ['queued', 'running'] } },
    { $setOnInsert: { type, tenantId, meetingId, payload, runAt, maxAttempts, status: 'queued', attempts: 0 } },
    { upsert: true, new: true }
  );
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

    const h = handlers.get(job.type);
    if (!h) {
      await Job.updateOne({ _id: job._id }, { $set: { status: 'failed', lastError: 'No handler', finishedAt: new Date() } });
      return;
    }
    try {
      await h.run(job);
      await Job.updateOne({ _id: job._id }, { $set: { status: 'done', finishedAt: new Date() }, $unset: { lastError: 1 } });
    } catch (err) {
      const message = String(err?.message || err).slice(0, 900);
      console.error(`[jobs] ${job.type} (${job.meetingId}) attempt ${job.attempts}/${job.maxAttempts} failed: ${message}`);
      if (job.attempts >= job.maxAttempts || err?.permanent) {
        await Job.updateOne({ _id: job._id }, { $set: { status: 'failed', lastError: message, finishedAt: new Date() } });
        try {
          await h.onFinalFailure?.(job, err);
        } catch (e) {
          console.error(`[jobs] onFinalFailure error: ${e.message}`);
        }
      } else {
        const backoff = 30_000 * 2 ** (job.attempts - 1);
        await Job.updateOne(
          { _id: job._id },
          { $set: { status: 'queued', runAt: new Date(Date.now() + backoff), lastError: message } }
        );
      }
    }
  } catch (err) {
    console.error(`[jobs] tick error: ${err.message}`);
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
