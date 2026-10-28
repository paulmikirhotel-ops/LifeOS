import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * Joins several finished audio files (one per recording segment) into ONE valid file with ffmpeg.
 * Plain byte-joining would not work: every segment has its own audio header.
 *
 * ffmpeg comes from the optional `ffmpeg-static` package when installed, otherwise from PATH.
 */
let cachedPath;
export async function ffmpegPath() {
  if (cachedPath !== undefined) return cachedPath;
  try {
    const mod = await import('ffmpeg-static');
    cachedPath = mod.default || null;
  } catch {
    cachedPath = null;
  }
  cachedPath = cachedPath || 'ffmpeg';
  return cachedPath;
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.on('error', (e) => reject(new Error(`ffmpeg could not start: ${e.message}`)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`))));
  });
}

/**
 * Joins the files in order. Uses ffmpeg's concat FILTER (not the concat demuxer) so segments recorded in different
 * browsers (WebM/Opus from Chrome, MP4/AAC from Safari) can still be joined. Everything is converted to mono, 48 kHz,
 * Opus in WebM at 32 kbps: the same shape as the recorder's own output, so playback and transcription are unchanged.
 */
export async function concatAudio(inputFiles, outFile) {
  if (!inputFiles.length) throw new Error('Nothing to join');
  const args = ['-y', '-v', 'error'];
  inputFiles.forEach((f) => args.push('-i', path.resolve(f)));
  const prep = inputFiles.map((_, i) => `[${i}:a]aformat=sample_rates=48000:channel_layouts=mono[a${i}]`).join(';');
  const join = `${inputFiles.map((_, i) => `[a${i}]`).join('')}concat=n=${inputFiles.length}:v=0:a=1[out]`;
  args.push('-filter_complex', `${prep};${join}`, '-map', '[out]', '-c:a', 'libopus', '-b:a', '32k', outFile);
  await run(await ffmpegPath(), args);
}
