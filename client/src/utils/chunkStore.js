/**
 * Tiny IndexedDB store for audio chunks that have been recorded but not yet uploaded.
 * If the tab crashes or the network drops, unsent audio survives on the device and is
 * uploaded next time. Every call degrades to a no-op where IndexedDB is unavailable
 * (private mode, some embedded browsers) — recording still works, just without this safety net.
 */
const DB = 'lifeos-meetings';
const STORE = 'chunks';

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no idb'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const out = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(out?.result);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    return undefined;
  }
}

const key = (meetingId, index) => `${meetingId}:${String(index).padStart(6, '0')}`;

export const saveChunk = (meetingId, index, blob, mime) =>
  run('readwrite', (s) => s.put({ key: key(meetingId, index), meetingId, index, blob, mime, at: Date.now() }));

export const deleteChunk = (meetingId, index) => run('readwrite', (s) => s.delete(key(meetingId, index)));

export async function listChunks(meetingId) {
  const all = (await run('readonly', (s) => s.getAll())) || [];
  return all.filter((c) => c.meetingId === meetingId).sort((a, b) => a.index - b.index);
}

export async function clearMeeting(meetingId) {
  const rows = await listChunks(meetingId);
  await Promise.all(rows.map((r) => deleteChunk(meetingId, r.index)));
}
