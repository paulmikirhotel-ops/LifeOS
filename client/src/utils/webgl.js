/** Rules for the optional 3D background on Connect. Kept apart from the screen so they can be tested without a browser. */

/**
 * Decides from plain facts about the phone / computer whether the 3D background is worth showing.
 * It is switched off when the person asked for less motion or less data, on weak devices, or without WebGL.
 */
export function detect3D({ reducedMotion = false, saveData = false, deviceMemory, cores, webgl = true } = {}) {
  if (reducedMotion) return { ok: false, reason: 'reduced-motion' };
  if (saveData) return { ok: false, reason: 'save-data' };
  if (typeof deviceMemory === 'number' && deviceMemory < 3) return { ok: false, reason: 'low-memory' };
  if (typeof cores === 'number' && cores < 4) return { ok: false, reason: 'few-cores' };
  if (!webgl) return { ok: false, reason: 'no-webgl' };
  return { ok: true, reason: '' };
}

/** Reads the facts from the browser, then asks detect3D. Any failure means "no 3D" (the page still looks good with the CSS version). */
export function canUse3D() {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    const webgl = Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    return detect3D({
      reducedMotion: Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
      saveData: Boolean(navigator.connection?.saveData),
      deviceMemory: navigator.deviceMemory,
      cores: navigator.hardwareConcurrency,
      webgl,
    }).ok;
  } catch {
    return false;
  }
}

/** The floating spheres, always the same so the picture is steady. x/y/z are positions, r is size, amp/speed/phase drive the float. */
export function orbSpecs() {
  return [
    { x: 7.5, y: 0.6, z: -1, r: 2.1, amp: 0.45, speed: 0.55, phase: 0.0, color: 0x38bdf8, opacity: 0.55 },
    { x: 4.2, y: -1.8, z: 1, r: 1.1, amp: 0.35, speed: 0.8, phase: 1.3, color: 0xffffff, opacity: 0.4 },
    { x: 10.5, y: -1.5, z: 0, r: 1.5, amp: 0.4, speed: 0.65, phase: 2.1, color: 0x6366f1, opacity: 0.5 },
    { x: 1.5, y: 2.2, z: -2, r: 0.9, amp: 0.3, speed: 0.9, phase: 3.4, color: 0x22d3ee, opacity: 0.45 },
    { x: -4.5, y: -1.2, z: -3, r: 1.7, amp: 0.4, speed: 0.5, phase: 4.2, color: 0x2563eb, opacity: 0.4 },
    { x: 8.8, y: 2.6, z: 1.5, r: 0.7, amp: 0.3, speed: 1.0, phase: 5.0, color: 0xffffff, opacity: 0.45 },
  ];
}
