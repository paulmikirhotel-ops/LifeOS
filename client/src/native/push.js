// Pure helpers for the Android push setup (no phone or network code, so they can be tested).

/** The page a tapped call notification should open. Only paths inside the app are allowed. */
export function targetFromNotification(data) {
  const u = String(data?.url ?? '');
  return /^\/[A-Za-z0-9\-_/]*$/.test(u) && !u.startsWith('//') ? u : '/connect';
}

/** The channel Android uses for call alerts: loud, shows on the lock screen, vibrates. The app's MainActivity creates it first, with the phone's own ringtone. */
export const CALL_CHANNEL = Object.freeze({
  id: 'calls_ring',
  name: 'Calls',
  description: 'Incoming LifeOS calls',
  importance: 5,
  visibility: 1,
  vibration: true,
});

/** True only inside the LifeOS Android app. */
export function isNativeApp(cap = typeof window !== 'undefined' ? window.Capacitor : undefined) {
  try { return Boolean(cap?.isNativePlatform?.()); } catch { return false; }
}
