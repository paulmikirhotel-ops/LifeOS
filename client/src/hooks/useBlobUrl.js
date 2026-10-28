import { useEffect, useState } from 'react';
import { connectApi } from '../api/connect.js';

// Private files need the sign-in cookie, so they are fetched through the API client and shown from a local blob URL.
const cache = new Map(); // messageId -> Promise<string>

export function loadAttachmentUrl(messageId) {
  if (!cache.has(messageId)) {
    const p = connectApi.file(messageId).then((blob) => URL.createObjectURL(blob));
    p.catch(() => cache.delete(messageId));
    cache.set(messageId, p);
    if (cache.size > 80) cache.delete(cache.keys().next().value);
  }
  return cache.get(messageId);
}

/** { url, error, loading } for a stored attachment. `skip` (e.g. a local preview while uploading) disables the fetch. */
export function useAttachmentUrl(messageId, skip = false) {
  const [state, setState] = useState({ url: null, error: false });
  useEffect(() => {
    if (skip || !messageId) return undefined;
    let alive = true;
    setState({ url: null, error: false });
    loadAttachmentUrl(messageId).then((url) => alive && setState({ url, error: false })).catch(() => alive && setState({ url: null, error: true }));
    return () => { alive = false; };
  }, [messageId, skip]);
  return { ...state, loading: !skip && !state.url && !state.error };
}

/** Saves a stored attachment to the device with its original name. */
export async function downloadAttachment(messageId, name) {
  const url = await loadAttachmentUrl(messageId);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const avatarCache = new Map(); // "gav:<groupId>:<version>" -> Promise<string>

/** Group picture: `src` looks like "gav:<groupId>:<version>"; anything else is returned unchanged. */
export function useGroupAvatar(src) {
  const [url, setUrl] = useState(null);
  const isGav = typeof src === 'string' && src.startsWith('gav:');
  useEffect(() => {
    if (!isGav) { setUrl(null); return undefined; }
    let alive = true;
    if (!avatarCache.has(src)) {
      const p = connectApi.groupAvatar(src.split(':')[1]).then((blob) => URL.createObjectURL(blob));
      p.catch(() => avatarCache.delete(src));
      avatarCache.set(src, p);
    }
    avatarCache.get(src).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => { alive = false; };
  }, [src, isGav]);
  return isGav ? url : src;
}
