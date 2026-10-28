import { useEffect, useRef, useState } from 'react';
import { easeOutExpo, prefersReducedMotion } from '../utils/motion.js';

/**
 * Animates a number from its previous value to `target` (first render: from 0).
 * People who prefer reduced motion, and non-numeric targets, get the final value immediately.
 */
export function useCountUp(target, { duration = 700 } = {}) {
  const to = Number(target);
  const valid = Number.isFinite(to);
  const [value, setValue] = useState(() => (!valid || prefersReducedMotion() ? to : 0));
  const fromRef = useRef(value);

  useEffect(() => {
    if (!valid) return undefined;
    if (prefersReducedMotion() || duration <= 0) {
      fromRef.current = to;
      setValue(to);
      return undefined;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const next = t >= 1 ? to : from + (to - from) * easeOutExpo(t);
      fromRef.current = next;
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, valid, duration]);

  return value;
}
