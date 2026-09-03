/**
 * Reusable notification sound — a short, soft two-note chime synthesized with
 * the Web Audio API (no audio asset needed).
 *
 * Browser autoplay rules: AudioContext starts suspended until a user gesture.
 * Call `unlockNotificationAudio()` from a pointerdown/keydown handler once
 * (see NotificationContext). `playNotificationChime()` no-ops when the context
 * is unavailable or sound is disabled, so nothing ever throws.
 */

let audioCtx = null;
let soundEnabled = true;
let unlocked = false;

function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/** Resume the AudioContext (call on first user gesture). Safe to call often. */
export function unlockNotificationAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  unlocked = true;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

export function setNotificationSoundEnabled(enabled) {
  soundEnabled = enabled;
}

/** Plays one soft sine note with a quick decay envelope. */
function playNote(ctx, freq, startAt, duration, peakGain) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/**
 * Plays the notification chime once. Respects the enabled flag and silently
 * does nothing when audio is blocked (no autoplay assumptions).
 */
export function playNotificationChime() {
  if (!soundEnabled) return;
  const ctx = getCtx();
  if (!ctx) return;

  const attempt = () => {
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // G5 → C6, gentle and short.
    playNote(ctx, 783.99, now, 0.28, 0.12);
    playNote(ctx, 1046.5, now + 0.16, 0.4, 0.09);
  };

  if (ctx.state === 'suspended') {
    if (!unlocked) return; // user hasn't interacted yet — skip silently
    ctx.resume().then(attempt).catch(() => {});
  } else {
    attempt();
  }
}
