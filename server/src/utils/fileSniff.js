import path from 'node:path';

/**
 * What files may be shared in Connect chats. A file is accepted only when its extension is on the list AND its first
 * bytes really look like that kind of file, so a renamed program or web page is refused. SVG and HTML are never allowed
 * (they can carry scripts). The stored/served type always comes from this table, never from what the browser claims.
 */
const T = {
  jpg: { mime: 'image/jpeg', kind: 'image' }, jpeg: { mime: 'image/jpeg', kind: 'image' },
  png: { mime: 'image/png', kind: 'image' }, gif: { mime: 'image/gif', kind: 'image' }, webp: { mime: 'image/webp', kind: 'image' },
  mp4: { mime: 'video/mp4', kind: 'video' }, mov: { mime: 'video/quicktime', kind: 'video' }, webm: { mime: 'video/webm', kind: 'video' },
  mp3: { mime: 'audio/mpeg', kind: 'audio' }, m4a: { mime: 'audio/mp4', kind: 'audio' }, ogg: { mime: 'audio/ogg', kind: 'audio' }, wav: { mime: 'audio/wav', kind: 'audio' },
  pdf: { mime: 'application/pdf', kind: 'file' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'file' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'file' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'file' },
  doc: { mime: 'application/msword', kind: 'file' }, xls: { mime: 'application/vnd.ms-excel', kind: 'file' }, ppt: { mime: 'application/vnd.ms-powerpoint', kind: 'file' },
  txt: { mime: 'text/plain', kind: 'file' }, csv: { mime: 'text/csv', kind: 'file' },
};

const startsWith = (b, bytes, at = 0) => bytes.every((v, i) => b[at + i] === v);
const ascii = (b, s, at = 0) => startsWith(b, [...s].map((c) => c.charCodeAt(0)), at);

const CHECKS = {
  jpg: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  png: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  gif: (b) => ascii(b, 'GIF87a') || ascii(b, 'GIF89a'),
  webp: (b) => ascii(b, 'RIFF') && ascii(b, 'WEBP', 8),
  mp4: (b) => ascii(b, 'ftyp', 4),
  webm: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
  mp3: (b) => ascii(b, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  ogg: (b) => ascii(b, 'OggS'),
  wav: (b) => ascii(b, 'RIFF') && ascii(b, 'WAVE', 8),
  pdf: (b) => ascii(b, '%PDF'),
  zip: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
  ole: (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  text: (b) => {
    const n = Math.min(b.length, 8192);
    for (let i = 0; i < n; i += 1) if (b[i] === 0) return false;
    return true;
  },
};
const CHECK_FOR = { jpg: 'jpg', jpeg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', mp4: 'mp4', mov: 'mp4', m4a: 'mp4', webm: 'webm', mp3: 'mp3', ogg: 'ogg', wav: 'wav', pdf: 'pdf', docx: 'zip', xlsx: 'zip', pptx: 'zip', doc: 'ole', xls: 'ole', ppt: 'ole', txt: 'text', csv: 'text' };

export const extOf = (name) => path.extname(String(name || '')).slice(1).toLowerCase();

/** Cleans a file name for display and downloads: no paths, no control characters, at most 120 characters. */
export function safeName(name) {
  const base = path.basename(String(name || 'file').replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, '').trim().slice(-120);
  return clean || 'file';
}

/** Returns { ext, mime, kind, inline } for an acceptable file, or { error } saying why not. */
export function inspectFile(name, buffer, { voice = false } = {}) {
  const ext = extOf(name);
  const t = T[ext];
  if (!t) return { error: 'This type of file cannot be shared. Photos, videos, audio, PDF, Word, Excel, PowerPoint, text and CSV are allowed.' };
  if (!buffer || buffer.length === 0) return { error: 'That file is empty.' };
  if (!CHECKS[CHECK_FOR[ext]](buffer)) return { error: 'The file does not match its type, so it was not accepted.' };
  // A recorded voice note: browsers record in WebM, Ogg or MP4 containers. These are stored and played as audio.
  if (voice) {
    if (!['webm', 'ogg', 'm4a', 'mp4'].includes(ext)) return { error: 'This voice note format is not supported.' };
    return { ext, mime: ext === 'webm' ? 'audio/webm' : ext === 'ogg' ? 'audio/ogg' : 'audio/mp4', kind: 'audio', inline: true, voice: true };
  }
  return { ext, mime: t.mime, kind: t.kind, inline: t.kind !== 'file' || ext === 'pdf' };
}
