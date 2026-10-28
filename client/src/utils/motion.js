/** Small motion helpers shared by animated components. */

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fast start, long gentle landing: feels responsive without being jumpy. t is 0..1. */
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

export const clamp01 = (n) => Math.min(1, Math.max(0, n));
