/** Transcript formatting + chunking helpers (pure functions). */

export function fmtClock(ms = 0) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function speakerOf(seg) {
  return seg.speakerName || seg.speakerLabel || 'Speaker';
}

/** One transcript line as shown to the LLM. The [seq] marker lets answers cite evidence. */
export function segmentLine(seg) {
  return `[${seg.seq}] ${speakerOf(seg)} (${fmtClock(seg.startMs)}): ${seg.text}`;
}

/**
 * Splits segments into chunks at segment boundaries so each chunk fits comfortably in a
 * model's context (≈ maxChars/4 tokens). Never splits an utterance.
 */
export function chunkSegments(segments, maxChars = 24000) {
  const chunks = [];
  let cur = [];
  let size = 0;
  for (const seg of segments) {
    const line = segmentLine(seg);
    if (cur.length && size + line.length + 1 > maxChars) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push({ seg, line });
    size += line.length + 1;
  }
  if (cur.length) chunks.push(cur);
  return chunks.map((items, index) => ({
    index,
    startSeq: items[0].seg.seq,
    endSeq: items[items.length - 1].seg.seq,
    validSeqs: new Set(items.map((i) => i.seg.seq)),
    text: items.map((i) => i.line).join('\n'),
  }));
}
