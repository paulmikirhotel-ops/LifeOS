/**
 * Mixes every voice in the room (your microphone + each remote participant) into ONE audio stream.
 *
 * Why: the meeting recorder and the live transcript were built around a single audio stream. In a video
 * room everyone else's voice arrives as separate remote tracks, so the host's browser mixes them here and
 * hands the result to the existing recorder. Recording, chunk upload, transcription (speaker labels) and the
 * AI summary then work exactly as they already do — nothing downstream needs to know about video.
 *
 * Notes
 *  - Sources are connected ONLY to the recording destination, never to the speakers (no double playback).
 *  - A compressor keeps several people talking at once from clipping.
 *  - A muted microphone is silent here too (LiveKit disables the underlying track), so muted = not recorded.
 */
export class AudioMixer {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('Audio mixing is not supported in this browser.');
    this.ctx = new Ctx();
    this.dest = this.ctx.createMediaStreamDestination();
    this.dest.channelCount = 1; // speech, mono: half the size, same transcript quality
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.compressor = this.ctx.createDynamicsCompressor();
    this.master.connect(this.compressor);
    this.compressor.connect(this.dest);
    this.sources = new Map(); // id -> { node, track }
  }

  get stream() {
    return this.dest.stream;
  }

  /** Browsers start audio contexts suspended until a user gesture; call this from the click that starts recording. */
  async resume() {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  add(id, mediaStreamTrack) {
    if (!mediaStreamTrack || mediaStreamTrack.kind !== 'audio') return;
    const existing = this.sources.get(id);
    if (existing && existing.track === mediaStreamTrack) return;
    if (existing) this.remove(id);
    const node = this.ctx.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
    node.connect(this.master);
    this.sources.set(id, { node, track: mediaStreamTrack });
  }

  remove(id) {
    const entry = this.sources.get(id);
    if (!entry) return;
    try {
      entry.node.disconnect();
    } catch {
      /* already disconnected */
    }
    this.sources.delete(id);
  }

  close() {
    [...this.sources.keys()].forEach((id) => this.remove(id));
    try {
      this.dest.stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    this.ctx.close().catch(() => {});
  }
}
