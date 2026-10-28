import { useEffect, useRef, useState } from 'react';
import { measureRoom, rateMeasurement, smooth } from '../utils/audioQuality.js';

const EVERY_MS = 3000;

/** Measures voice quality every few seconds while connected. Returns { level: 'unknown'|'good'|'fair'|'poor', lossPct, rttMs, jitterMs }. */
export function useAudioQuality(room, connected) {
  const [state, setState] = useState({ level: 'unknown', lossPct: 0, rttMs: 0, jitterMs: 0 });
  const memo = useRef(new Map());
  const history = useRef([]);

  useEffect(() => {
    if (!room || !connected) {
      history.current = [];
      memo.current = new Map();
      setState({ level: 'unknown', lossPct: 0, rttMs: 0, jitterMs: 0 });
      return undefined;
    }
    let stopped = false;
    const tick = async () => {
      const m = await measureRoom(room, memo.current);
      if (stopped) return;
      history.current = [...history.current, rateMeasurement(m, room.localParticipant?.connectionQuality)].slice(-4);
      setState({ level: smooth(history.current), lossPct: m.lossPct, rttMs: m.rttMs, jitterMs: m.jitterMs });
    };
    const first = setTimeout(tick, 1500);
    const id = setInterval(tick, EVERY_MS);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [room, connected]);

  return state;
}
