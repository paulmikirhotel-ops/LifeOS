/**
 * Ringtone and ringback for Connect calls, made with the browser's own audio (no sound files).
 * ONE sound at a time, ever: starting a sound while another plays replaces it, and stopRingtone() silences it instantly.
 *  - 'incoming': the phone ring heard by the person being called.
 *  - 'ringback': the soft "calling…" tone heard by the person who is calling.
 * Browsers keep audio locked until the person has touched the page once; the first tap anywhere unlocks it.
 */
const PATTERNS = {
  incoming: { period: 3000, gain: 0.16, notes: [{ at: 0, len: 0.4, hz: [440, 480] }, { at: 0.6, len: 0.4, hz: [440, 480] }], vibrate: [400, 200, 400] },
  ringback: { period: 4000, gain: 0.07, notes: [{ at: 0, len: 1.0, hz: [425] }], vibrate: null },
};

let ctx = null;
let master = null;
let timer = null;
let current = null; // 'incoming' | 'ringback' | null
let live = []; // oscillators currently sounding

function audio() {
  if (ctx) return ctx;
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return null;
  ctx = new Ctx();
  master = ctx.createGain();
  master.connect(ctx.destination);
  return ctx;
}

function unlock() {
  try {
    const c = audio();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  } catch {
    /* sound is optional */
  }
}
if (typeof window !== 'undefined' && window.addEventListener) {
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, unlock, { once: true, passive: true }));
}

function playOnce(kind) {
  const p = PATTERNS[kind];
  const c = audio();
  if (!p || !c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  master.gain.value = p.gain;
  const t0 = c.currentTime;
  p.notes.forEach((n) => {
    n.hz.forEach((hz) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t0 + n.at);
      g.gain.linearRampToValueAtTime(1 / n.hz.length, t0 + n.at + 0.03);
      g.gain.setValueAtTime(1 / n.hz.length, t0 + n.at + n.len - 0.05);
      g.gain.linearRampToValueAtTime(0.0001, t0 + n.at + n.len);
      o.connect(g);
      g.connect(master);
      o.start(t0 + n.at);
      o.stop(t0 + n.at + n.len + 0.02);
      live.push(o);
      o.onended = () => {
        live = live.filter((x) => x !== o);
      };
    });
  });
  if (p.vibrate) window.navigator?.vibrate?.(p.vibrate);
}

export function startRingtone(kind) {
  if (!PATTERNS[kind] || current === kind) return; // already ringing this sound: never start a second loop
  stopRingtone();
  current = kind;
  try {
    playOnce(kind);
  } catch {
    /* sound is optional */
  }
  timer = setInterval(() => {
    try {
      playOnce(kind);
    } catch {
      /* sound is optional */
    }
  }, PATTERNS[kind].period);
}

export function stopRingtone() {
  if (timer) clearInterval(timer);
  timer = null;
  current = null;
  live.forEach((o) => {
    try {
      o.stop();
    } catch {
      /* already stopped */
    }
  });
  live = [];
  try {
    window.navigator?.vibrate?.(0);
  } catch {
    /* ignore */
  }
}

export const ringing = () => current;
