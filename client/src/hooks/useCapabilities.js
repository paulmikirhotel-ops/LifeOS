import { useEffect, useState } from 'react';
import { meetingsApi } from '../api/meetings.js';

/**
 * What this server has switched on for Meetings (booleans only — never secrets).
 * The pages use it to show only the features that can actually work here, so a
 * scheduling-and-notes setup looks clean instead of full of disabled buttons.
 * Cached for the life of the page load; one request is shared by every component.
 */
let cache = null;
let inflight = null;

export function useCapabilities() {
  const [caps, setCaps] = useState(cache);
  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    inflight ||= meetingsApi
      .capabilities()
      .then((r) => {
        cache = r.data;
        return cache;
      })
      .catch(() => {
        inflight = null;
        return null;
      });
    inflight.then((c) => alive && c && setCaps(c));
    return () => {
      alive = false;
    };
  }, []);

  return {
    loaded: Boolean(caps),
    recording: Boolean(caps?.storage),
    transcription: Boolean(caps?.speechToText),
    ai: Boolean(caps?.ai),
  };
}
