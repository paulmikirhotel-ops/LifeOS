// Tiny key/value store on IndexedDB, with a memory fallback (private windows, old browsers, tests).
const DB = 'lifeos-offline';
const OS = 'kv';
let dbPromise = null;
const mem = new Map();

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(OS);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

function run(db, mode, fn) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(OS, mode);
      const os = tx.objectStore(OS);
      const res = fn(os);
      tx.oncomplete = () => resolve(res && 'result' in res ? res.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (e) { reject(e); }
  });
}

export async function kvGet(key) {
  const db = await openDb();
  if (!db) return mem.get(key);
  try { return await run(db, 'readonly', (os) => os.get(key)); } catch { return mem.get(key); }
}
export async function kvSet(key, value) {
  const db = await openDb();
  if (!db) { mem.set(key, value); return; }
  try { await run(db, 'readwrite', (os) => os.put(value, key)); } catch { mem.set(key, value); }
}
export async function kvDel(key) {
  mem.delete(key);
  const db = await openDb();
  if (!db) return;
  try { await run(db, 'readwrite', (os) => os.delete(key)); } catch { /* ignore */ }
}
/** Delete everything whose key starts with prefix ('' = everything). */
export async function kvClear(prefix = '') {
  for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k);
  const db = await openDb();
  if (!db) return;
  try {
    await run(db, 'readwrite', (os) => {
      if (!prefix) return os.clear();
      return os.delete(IDBKeyRange.bound(prefix, `${prefix}￿`));
    });
  } catch { /* ignore */ }
}
export async function kvKeys(prefix = '') {
  const db = await openDb();
  if (!db) return [...mem.keys()].filter((k) => k.startsWith(prefix));
  try {
    return await new Promise((resolve) => {
      const out = [];
      const tx = db.transaction(OS, 'readonly');
      const req = tx.objectStore(OS).openKeyCursor(IDBKeyRange.bound(prefix, `${prefix}￿`));
      req.onsuccess = () => { const c = req.result; if (c) { out.push(c.key); c.continue(); } };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => resolve(out);
    });
  } catch { return [...mem.keys()].filter((k) => k.startsWith(prefix)); }
}
