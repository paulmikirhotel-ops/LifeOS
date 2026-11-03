import { orbSpecs } from './webgl.js';

/**
 * Builds the floating-orbs picture inside `host` (a div) with three.js and returns { dispose }.
 * `THREE` is passed in so the screen can load three.js only when it is needed, and so this can be tested with a stand-in.
 * Light on battery: 30 pictures a second at most, pixel ratio capped, pauses when off screen or when the tab is hidden.
 */
export function createOrbScene(THREE, host, { dark = false, env = {} } = {}) {
  const raf = env.raf || ((f) => requestAnimationFrame(f));
  const caf = env.caf || ((id) => cancelAnimationFrame(id));
  const doc = env.doc || (typeof document !== 'undefined' ? document : null);
  const RO = env.ResizeObserver || (typeof ResizeObserver !== 'undefined' ? ResizeObserver : null);
  const IO = env.IntersectionObserver || (typeof IntersectionObserver !== 'undefined' ? IntersectionObserver : null);
  const dpr = env.devicePixelRatio || (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(dpr, 1.5));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 60);
  camera.position.set(0, 0, 12);
  scene.add(new THREE.AmbientLight(0xffffff, dark ? 0.7 : 1));
  const sun = new THREE.DirectionalLight(0xffffff, dark ? 1.4 : 1.8);
  sun.position.set(4, 6, 8);
  scene.add(sun);

  const sphere = new THREE.SphereGeometry(1, 32, 24);
  const ringGeo = new THREE.TorusGeometry(1, 0.03, 12, 96);
  const materials = [];
  const orbs = orbSpecs().map((s) => {
    const mat = new THREE.MeshLambertMaterial({ color: s.color, transparent: true, opacity: s.opacity });
    materials.push(mat);
    const mesh = new THREE.Mesh(sphere, mat);
    mesh.scale.setScalar(s.r);
    mesh.position.set(s.x, s.y, s.z);
    scene.add(mesh);
    return { mesh, s };
  });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
  materials.push(ringMat);
  const rings = [[6.2, 8, 0.9], [4.2, 5.5, 1.4]].map(([scale, x, tilt]) => {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.scale.setScalar(scale);
    ring.position.set(x, 0.2, -2);
    ring.rotation.x = tilt;
    scene.add(ring);
    return ring;
  });

  const resize = () => {
    const w = Math.max(1, host.clientWidth || 1);
    const h = Math.max(1, host.clientHeight || 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };

  let disposed = false;
  let frame = 0;
  let last = 0;
  let onScreen = true;
  const tabHidden = () => Boolean(doc && doc.hidden);

  const draw = (ms) => {
    const t = ms / 1000;
    for (const { mesh, s } of orbs) {
      mesh.position.y = s.y + Math.sin(t * s.speed + s.phase) * s.amp;
      mesh.position.x = s.x + Math.cos(t * s.speed * 0.7 + s.phase) * s.amp * 0.6;
    }
    rings.forEach((ring, i) => { ring.rotation.z = t * (0.12 + i * 0.08); ring.rotation.y = Math.sin(t * 0.2 + i) * 0.4; });
    renderer.render(scene, camera);
  };
  const tick = (now) => {
    if (disposed) return;
    frame = raf(tick);
    if (now - last < 33) return; // about 30 pictures a second
    last = now;
    draw(now);
  };
  const stop = () => { if (frame) { caf(frame); frame = 0; } };
  const start = () => { if (!disposed && !frame && onScreen && !tabHidden()) frame = raf(tick); };

  const onVisibility = () => (tabHidden() ? stop() : start());
  const onLost = (e) => { e.preventDefault?.(); stop(); };
  doc?.addEventListener?.('visibilitychange', onVisibility);
  canvas.addEventListener?.('webglcontextlost', onLost);
  const ro = RO ? new RO(resize) : null;
  ro?.observe(host);
  const io = IO ? new IO((entries) => { onScreen = entries.some((e) => e.isIntersecting); if (onScreen) start(); else stop(); }) : null;
  io?.observe(host);

  resize();
  start();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      ro?.disconnect();
      io?.disconnect();
      doc?.removeEventListener?.('visibilitychange', onVisibility);
      canvas.removeEventListener?.('webglcontextlost', onLost);
      sphere.dispose();
      ringGeo.dispose();
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      if (canvas.parentNode === host) host.removeChild(canvas);
    },
  };
}
