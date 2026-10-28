/**
 * Microphone and voice settings shared by Meetings and Connect calls.
 * Echo cancellation, noise suppression and auto gain are the browser's own voice processing. They are ON by default and the person
 * can switch them off in the room's Audio panel (useful for diagnosing, or for music).
 */
const KEY = 'lifeos:audio-prefs';
export const DEFAULT_PREFS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, micId: '', speakerId: '' };

export function loadAudioPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      echoCancellation: raw.echoCancellation !== false,
      noiseSuppression: raw.noiseSuppression !== false,
      autoGainControl: raw.autoGainControl !== false,
      micId: typeof raw.micId === 'string' ? raw.micId : '',
      speakerId: typeof raw.speakerId === 'string' ? raw.speakerId : '',
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveAudioPrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT_PREFS, ...prefs }));
  } catch {
    /* private mode: settings just last for this call */
  }
}

/** Constraints for the microphone. One channel is what voice needs; it also halves the bandwidth. `ideal` so a device that cannot do it still works. */
export function captureOptions(prefs = DEFAULT_PREFS) {
  return {
    echoCancellation: prefs.echoCancellation,
    noiseSuppression: prefs.noiseSuppression,
    autoGainControl: prefs.autoGainControl,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    // Newer Chrome builds on supported devices: stronger voice isolation. Ignored elsewhere.
    voiceIsolation: { ideal: prefs.noiseSuppression },
    ...(prefs.micId ? { deviceId: { ideal: prefs.micId } } : {}),
  };
}

/** How the voice is sent: DTX stops sending during silence, RED repeats audio to survive lost packets, 32 kbps is plenty for clear speech. */
export const AUDIO_PUBLISH = { dtx: true, red: true, audioPreset: { maxBitrate: 32000 } };

export const speakerPickerSupported = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
