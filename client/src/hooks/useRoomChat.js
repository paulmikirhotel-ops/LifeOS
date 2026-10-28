import { useCallback, useEffect, useRef, useState } from 'react';
import { formatApiError } from '../utils/errors.js';

/**
 * In-meeting chat for both doors. The server is the source of truth: messages are fetched every few seconds
 * (faster while the panel is open) and immediately when someone else nudges the room that a message was sent.
 *
 *  list(afterId) → { data: { items } }     send(text) → { data: message }
 *  enabled  true while connected          open  panel visible (clears the unread count)
 *  tick     changes when someone nudged   myKey my room identity, to right-align my messages and skip my own unread
 */
export function useRoomChat({ list, send, enabled, open, tick, myKey }) {
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const lastRef = useRef(null);
  const firstRef = useRef(true);
  const openRef = useRef(open);
  const listRef = useRef(list);
  const keyRef = useRef(myKey);
  openRef.current = open;
  listRef.current = list;
  keyRef.current = myKey;

  const add = useCallback((items) => {
    if (!items.length) return [];
    let fresh = [];
    setMessages((cur) => {
      const known = new Set(cur.map((m) => m.id));
      fresh = items.filter((m) => !known.has(m.id));
      return fresh.length ? [...cur, ...fresh] : cur;
    });
    lastRef.current = items[items.length - 1].id;
    return items;
  }, []);

  const fetchNew = useCallback(async () => {
    if (!listRef.current) return;
    try {
      const res = await listRef.current(lastRef.current);
      const items = res?.data?.items || [];
      if (!items.length) { firstRef.current = false; return; }
      const wasFirst = firstRef.current;
      firstRef.current = false;
      add(items);
      // History that was already there when I joined is not "new"; later messages from others are.
      if (!wasFirst && !openRef.current) setUnread((n) => n + items.filter((m) => m.key !== keyRef.current).length);
    } catch {
      /* a missed poll is harmless */
    }
  }, [add]);

  useEffect(() => {
    if (!enabled) return undefined;
    fetchNew();
    const id = setInterval(fetchNew, open ? 3000 : 8000);
    return () => clearInterval(id);
  }, [enabled, open, fetchNew]);

  useEffect(() => {
    if (enabled && tick) fetchNew();
  }, [tick, enabled, fetchNew]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open, messages.length]);

  const post = useCallback(
    async (text) => {
      const body = String(text || '').trim();
      if (!body || !send) return false;
      setSending(true);
      setError(null);
      try {
        const res = await send(body);
        if (res?.data) add([res.data]);
        return true;
      } catch (err) {
        setError(formatApiError(err));
        return false;
      } finally {
        setSending(false);
      }
    },
    [send, add]
  );

  return { messages, unread, sending, error, post, clearError: () => setError(null) };
}
