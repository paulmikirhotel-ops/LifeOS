// Settings, connection state and data-use counter. Plain store that React reads through useSyncExternalStore.
import { useSyncExternalStore } from 'react';
import { monthKey, resolveLowData } from './logic.js';

const SETTINGS_KEY = 'lifeos-offline-settings';
const USAGE_KEY = 'lifeos-data-usage';
const USER_KEY = 'lifeos-offline-user';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

const DEFAULTS = { offlineCopies: true, connectRead: false, lowData: 'auto' };
function readSettings() {
  try { return { ...DEFAULTS, ...(JSON.parse(lsGet(SETTINGS_KEY) || '{}')) }; } catch { return { ...DEFAULTS }; }
}

let state = {
  settings: readSettings(),
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  queued: 0,
  failed: 0,
  flushing: false,
  lastSyncAt: null,
  lastSynced: 0,
  cachedAt: null, // set while the page is showing an offline copy
  usage: 0,
};
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
export function setState(patch) {
  let changed = false;
  for (const k of Object.keys(patch)) if (state[k] !== patch[k]) { changed = true; break; }
  if (!changed) return;
  state = { ...state, ...patch };
  emit();
}
export const getState = () => state;
export const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const useOffline = () => useSyncExternalStore(subscribe, getState, getState);

export function saveSettings(patch) {
  const settings = { ...state.settings, ...patch };
  lsSet(SETTINGS_KEY, JSON.stringify(settings));
  setState({ settings });
}
export function isLowData() {
  const conn = typeof navigator !== 'undefined' ? (navigator.connection || navigator.mozConnection || navigator.webkitConnection) : null;
  return resolveLowData(state.settings.lowData, conn);
}

export const getUserId = () => lsGet(USER_KEY) || '';
export const setUserId = (id) => (id ? lsSet(USER_KEY, id) : lsDel(USER_KEY));

// Estimated data used by this app on this phone this month (response sizes only).
function readUsage() { try { const u = JSON.parse(lsGet(USAGE_KEY) || '{}'); return u.m === monthKey() ? u.b || 0 : 0; } catch { return 0; } }
export function addUsage(bytes) {
  if (!bytes) return;
  const b = readUsage() + bytes;
  lsSet(USAGE_KEY, JSON.stringify({ m: monthKey(), b }));
  state = { ...state, usage: b }; // no emit on every request; the Data page re-reads when opened
}
export const refreshUsage = () => setState({ usage: readUsage() });
state.usage = readUsage();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setState({ online: true }));
  window.addEventListener('offline', () => setState({ online: false }));
}
