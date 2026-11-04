import test from 'node:test';
import assert from 'node:assert/strict';
import { detect3D, orbSpecs, ringSpecs } from '../src/utils/webgl.js';
import { createOrbScene } from '../src/utils/orbScene.js';

test('3D is allowed on a normal phone', () => {
  assert.deepEqual(detect3D({ deviceMemory: 4, cores: 8, webgl: true }), { ok: true, reason: '' });
  assert.equal(detect3D({}).ok, true); // unknown facts do not block it
});
test('3D is off for reduced motion, data saver, weak devices and no WebGL', () => {
  assert.equal(detect3D({ reducedMotion: true }).reason, 'reduced-motion');
  assert.equal(detect3D({ saveData: true }).reason, 'save-data');
  assert.equal(detect3D({ deviceMemory: 2 }).reason, 'low-memory');
  assert.equal(detect3D({ cores: 2 }).reason, 'few-cores');
  assert.equal(detect3D({ webgl: false }).reason, 'no-webgl');
});
test('orb layout is steady and complete', () => {
  const a = orbSpecs();
  assert.deepEqual(a, orbSpecs());
  assert.ok(a.length >= 4 && a.length <= 8);
  for (const s of a) for (const k of ['x', 'y', 'z', 'r', 'amp', 'speed', 'phase', 'color', 'opacity']) assert.equal(typeof s[k], 'number');
});

// A stand-in for three.js that records what the scene does with it.
function fakeThree(log) {
  const disposable = (name) => class { constructor() { log.push(`new ${name}`); this.disposed = false; } dispose() { log.push(`dispose ${name}`); } };
  const vec = () => ({ set() {}, setScalar() {}, x: 0, y: 0, z: 0 });
  return {
    WebGLRenderer: class {
      constructor() { this.domElement = { style: {}, parentNode: null, addEventListener() {}, removeEventListener() {} }; }
      setPixelRatio(v) { log.push(`ratio ${v}`); }
      setClearColor() {}
      setSize() {}
      render() { log.push('render'); }
      dispose() { log.push('dispose renderer'); }
    },
    Scene: class { add() {} },
    PerspectiveCamera: class { constructor() { this.position = vec(); } updateProjectionMatrix() {} },
    AmbientLight: class {},
    DirectionalLight: class { constructor() { this.position = vec(); } },
    SphereGeometry: disposable('sphere'),
    TorusGeometry: disposable('torus'),
    MeshLambertMaterial: disposable('lambert'),
    MeshBasicMaterial: disposable('basic'),
    Mesh: class { constructor() { this.position = vec(); this.scale = vec(); this.rotation = { x: 0, y: 0, z: 0 }; } },
  };
}
function fakeHost() {
  const h = { clientWidth: 360, clientHeight: 150, children: [] };
  h.appendChild = (c) => { c.parentNode = h; h.children.push(c); };
  h.removeChild = (c) => { c.parentNode = null; h.children = h.children.filter((x) => x !== c); };
  return h;
}
function fakeEnv() {
  const frames = new Map(); let id = 0; const listeners = {};
  return {
    frames,
    raf: (f) => { id += 1; frames.set(id, f); return id; },
    caf: (i) => frames.delete(i),
    doc: { hidden: false, addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener: (n) => { delete listeners[n]; }, listeners },
    ResizeObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class { observe() {} disconnect() {} },
    devicePixelRatio: 3,
    step(now) { const [k, f] = [...frames.entries()][0] || []; if (k) { frames.delete(k); f(now); } },
  };
}

test('scene draws, caps pixel ratio, pauses when the tab is hidden, and cleans up completely', () => {
  const log = []; const env = fakeEnv(); const host = fakeHost();
  const scene = createOrbScene(fakeThree(log), host, { env });
  assert.equal(host.children.length, 1, 'canvas added');
  assert.ok(log.includes('ratio 1.5'), 'pixel ratio capped');
  assert.ok(log.includes('render'), 'first picture drawn straight away');
  env.step(100); env.step(110); // second is inside 33 ms: skipped
  const drawn = log.filter((l) => l === 'render').length;
  env.step(200);
  assert.equal(log.filter((l) => l === 'render').length, drawn + 1);

  env.doc.hidden = true; env.doc.listeners.visibilitychange();
  assert.equal(env.frames.size, 0, 'no frames while the tab is hidden');
  env.doc.hidden = false; env.doc.listeners.visibilitychange();
  assert.equal(env.frames.size, 1, 'resumes when visible again');

  scene.dispose();
  assert.equal(env.frames.size, 0);
  assert.equal(host.children.length, 0, 'canvas removed');
  for (const need of ['dispose renderer', 'dispose sphere', 'dispose torus', 'dispose lambert', 'dispose basic']) assert.ok(log.includes(need), need);
  assert.equal(Object.keys(env.doc.listeners).length, 0, 'listeners removed');
  scene.dispose(); // twice is harmless
});

test('call layout keeps every sphere on a tall phone screen', () => {
  const half = 12 * Math.tan((40 / 2) * Math.PI / 180); // visible half-height at the camera distance
  const halfWidth = half * 0.45; // a narrow phone, width/height about 0.45
  const calls = orbSpecs('call');
  assert.ok(calls.length >= 4);
  for (const s of calls) {
    assert.ok(Math.abs(s.x) + s.r <= halfWidth + 0.8, `x ${s.x} r ${s.r}`);
    assert.ok(Math.abs(s.y) + s.r <= half + 0.8, `y ${s.y} r ${s.r}`);
  }
  assert.notDeepEqual(calls, orbSpecs('hero'));
  assert.deepEqual(orbSpecs(), orbSpecs('hero'));
  assert.equal(ringSpecs('call').length, 2);
  assert.equal(ringSpecs('call')[0][1], 0, 'rings centred on the picture');
  assert.equal(ringSpecs().length, 2);
});

test('scene builds the call layout too', () => {
  const log = []; const env = fakeEnv(); const host = fakeHost();
  const scene = createOrbScene(fakeThree(log), host, { layout: 'call', env });
  assert.equal(host.children.length, 1);
  scene.dispose();
  assert.equal(host.children.length, 0);
});
