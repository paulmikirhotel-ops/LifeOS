import React, { useEffect, useRef } from 'react';
import { createOrbScene } from '../../utils/orbScene.js';

/**
 * Soft floating 3D spheres behind the Connect header. three.js is downloaded only when this shows (never on slow or low-power
 * phones, see utils/webgl.js). If anything fails the header simply keeps its plain gradient.
 */
export default function ConnectOrbs({ className = '', layout = 'hero' }) {
  const host = useRef(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    let scene = null;
    let gone = false;
    import('three')
      .then((THREE) => {
        if (gone) return;
        scene = createOrbScene(THREE, el, { dark: document.documentElement.classList.contains('dark'), layout });
      })
      .catch(() => { /* no 3D: the gradient stays */ });
    return () => { gone = true; scene?.dispose(); };
  }, [layout]);
  return <div ref={host} aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`} />;
}
