/**
 * The address people outside this browser should use when you share a link (meeting invitation, shared summary).
 *
 * By default it is the address LifeOS is open on. That is wrong while developing: if you open LifeOS at
 * https://localhost:5173, a link copied from it says "localhost", which means "this phone" to whoever receives it.
 * Set VITE_PUBLIC_URL (for example https://192.168.1.20:5173 or your tunnel / production address) to override it.
 */
const trim = (s) => String(s || '').trim().replace(/\/+$/, '');

export function publicOrigin() {
  return trim(import.meta.env.VITE_PUBLIC_URL) || window.location.origin;
}

/** True when the link we would hand out only works on this computer. */
export function isLocalOnlyOrigin(origin = publicOrigin()) {
  try {
    const host = new URL(origin).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}
