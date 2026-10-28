import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { connectApi } from '../api/connect.js';
import { playNotificationChime } from '../utils/notificationSound.js';
import { kindOfFile } from '../utils/connectFormat.js';

/**
 * LifeOS Connect state: conversations, friends, unread counts and the live events pushed by the server.
 * Live events arrive as `lifeos:connect` window events, re-published by NotificationContext from its one SSE connection.
 */
const ConnectContext = createContext(null);
const RANK = { sent: 1, delivered: 2, read: 3 };
const TYPING_MS = 5000;
const RES_ICON = { task: '✅', goal: '🎯', event: '📅', meeting: '🎥', note: '📝' };
const LABEL = { image: '📷 Photo', video: '🎬 Video', audio: '🎵 Audio' };
/** The one-line preview for the chat list, from a message. */
function lastLine(m, from) {
  const body = m.kind === 'file' ? `📄 ${m.attachment?.name || 'Document'}` : m.kind === 'contact' ? `👤 ${m.contact?.name || 'Contact'}` : m.kind === 'resource' ? `${RES_ICON[m.resource?.type] || '🔗'} ${m.resource?.title || 'Shared item'}` : (m.text || LABEL[m.kind] || '');
  return `${from?.group ? `${(from.name || '').split(' ')[0]}: ` : ''}${body}`.slice(0, 200);
}
const emptyFriends = { friends: [], incoming: [], outgoing: [] };
const emptySummary = { callsEnabled: false, unread: 0, friends: 0, requests: 0, groups: 0, meetings: 0 };

export function ConnectProvider({ children }) {
  const { user } = useAuth();
  const myId = user?.id || null;
  const [conversations, setConversations] = useState([]);
  const [friends, setFriends] = useState(emptyFriends);
  const [summary, setSummary] = useState(emptySummary);
  const [messagesBy, setMessagesBy] = useState({});
  const [typing, setTyping] = useState({});
  const [ready, setReady] = useState(false);
  const [notes, setNotes] = useState({ items: [], unread: 0 });
  const [incoming, setIncoming] = useState(null); // a call that is ringing for me
  const [callByConv, setCallByConv] = useState({}); // conversationId -> live call (so a chat can show "Join call")
  const convRef = useRef([]);
  const activeRef = useRef(null);
  const typingTimers = useRef({});
  const tmpCounter = useRef(0);
  convRef.current = conversations;

  const refreshConversations = useCallback(async () => {
    try { const r = await connectApi.conversations(); setConversations(r.data.items); } catch { /* keep what we have */ }
  }, []);
  const refreshFriends = useCallback(async () => {
    try { const r = await connectApi.friends(); setFriends(r.data); } catch { /* ignore */ }
  }, []);
  const refreshSummary = useCallback(async () => {
    try { const r = await connectApi.summary(); setSummary(r.data); } catch { /* ignore */ }
  }, []);
  const refreshAll = useCallback(async () => {
    await Promise.all([refreshConversations(), refreshFriends(), refreshSummary()]);
    try { const n = await connectApi.notifications(); setNotes(n.data); } catch { /* ignore */ }
    try {
      const r = await connectApi.activeCalls();
      setIncoming(r.data.incoming || null);
      setCallByConv((m) => ({ ...m, ...Object.fromEntries([r.data.incoming, r.data.ongoing].filter(Boolean).map((c) => [c.conversationId, c])) }));
    } catch { /* calls are optional */ }
    setReady(true);
  }, [refreshConversations, refreshFriends, refreshSummary]);

  // Start when signed in, clear when signed out.
  useEffect(() => {
    if (!myId) { setConversations([]); setFriends(emptyFriends); setSummary(emptySummary); setMessagesBy({}); setIncoming(null); setCallByConv({}); setNotes({ items: [], unread: 0 }); setReady(false); return undefined; }
    refreshAll();
    return undefined;
  }, [myId, refreshAll]);

  // ── messages ──────────────────────────────────────────────────────────
  const patchMessages = useCallback((convId, fn) => {
    setMessagesBy((prev) => (prev[convId] ? { ...prev, [convId]: { ...prev[convId], items: fn(prev[convId].items) } } : prev));
  }, []);

  const loadMessages = useCallback(async (convId) => {
    const r = await connectApi.messages(convId, { limit: 50 });
    setMessagesBy((prev) => ({ ...prev, [convId]: { items: r.data.items, hasMore: r.data.hasMore, loaded: true } }));
  }, []);

  const loadOlder = useCallback(async (convId) => {
    const cur = messagesBy[convId];
    const first = cur?.items?.find((m) => !m.pending);
    if (!first || !cur.hasMore) return;
    const r = await connectApi.messages(convId, { before: first.id, limit: 50 });
    setMessagesBy((prev) => ({ ...prev, [convId]: { ...prev[convId], items: [...r.data.items, ...prev[convId].items], hasMore: r.data.hasMore } }));
  }, [messagesBy]);

  const markRead = useCallback(async (convId) => {
    const conv = convRef.current.find((c) => c.id === convId);
    const had = conv?.unread || 0;
    if (had) {
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unread: 0 } : c)));
      setSummary((s) => ({ ...s, unread: Math.max(0, s.unread - had) }));
    }
    try { await connectApi.read(convId); } catch { /* the next refresh will correct the badge */ }
  }, []);

  const setActive = useCallback((convId) => {
    activeRef.current = convId;
    if (convId && !document.hidden) markRead(convId);
  }, [markRead]);

  // If a conversation is open while its unread count is non-zero (e.g. the page was opened straight on it), clear it.
  useEffect(() => {
    const a = activeRef.current;
    if (a && !document.hidden && conversations.some((c) => c.id === a && c.unread > 0)) markRead(a);
  }, [conversations, markRead]);

  const bumpConversation = useCallback((convId, patch) => {
    setConversations((prev) => {
      const i = prev.findIndex((c) => c.id === convId);
      if (i < 0) return prev;
      const next = { ...prev[i], ...patch };
      return [next, ...prev.slice(0, i), ...prev.slice(i + 1)];
    });
  }, []);

  const sendMessage = useCallback(async (convId, text, replyTo, mentions = []) => {
    const tmpId = `tmp-${++tmpCounter.current}`;
    const now = new Date().toISOString();
    const temp = { id: tmpId, conversationId: convId, senderId: myId, text, at: now, pending: true, deleted: false, edited: false, replyTo: replyTo ? { id: replyTo.id, text: replyTo.text } : null };
    setMessagesBy((prev) => (prev[convId] ? { ...prev, [convId]: { ...prev[convId], items: [...prev[convId].items, temp] } } : prev));
    bumpConversation(convId, { last: text.slice(0, 200), at: now, mine: true, status: undefined, unread: 0 });
    try {
      const r = await connectApi.send(convId, { text, ...(replyTo ? { replyToId: replyTo.id } : {}), ...(mentions.length ? { mentions } : {}) });
      patchMessages(convId, (items) => items.map((m) => (m.id === tmpId ? r.data : m)));
      bumpConversation(convId, { last: r.data.text.slice(0, 200), at: r.data.at, status: 'sent' });
      return r.data;
    } catch (err) {
      patchMessages(convId, (items) => items.filter((m) => m.id !== tmpId));
      refreshConversations();
      throw err;
    }
  }, [myId, bumpConversation, patchMessages, refreshConversations]);

  const editMessage = useCallback(async (convId, messageId, text) => {
    const r = await connectApi.edit(messageId, text);
    patchMessages(convId, (items) => items.map((m) => (m.id === messageId ? r.data : m)));
    refreshConversations();
  }, [patchMessages, refreshConversations]);

  const deleteMessage = useCallback(async (convId, messageId) => {
    await connectApi.remove(messageId);
    patchMessages(convId, (items) => items.map((m) => (m.id === messageId ? { ...m, deleted: true, text: '' } : m)));
    refreshConversations();
  }, [patchMessages, refreshConversations]);

  const sendAttachment = useCallback(async (convId, file, caption, replyTo) => {
    const tmpId = `tmp-${++tmpCounter.current}`;
    const now = new Date().toISOString();
    const kind = kindOfFile(file);
    const localUrl = kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : null;
    const temp = { id: tmpId, conversationId: convId, senderId: myId, kind, text: caption || '', attachment: { name: file.name, size: file.size, mime: file.type }, localUrl, progress: 0, at: now, pending: true, deleted: false, edited: false, replyTo: replyTo ? { id: replyTo.id, text: replyTo.text } : null };
    setMessagesBy((prev) => (prev[convId] ? { ...prev, [convId]: { ...prev[convId], items: [...prev[convId].items, temp] } } : prev));
    const setProgress = (progress) => patchMessages(convId, (items) => items.map((m) => (m.id === tmpId ? { ...m, progress } : m)));
    bumpConversation(convId, { last: LABEL[kind] || `📄 ${file.name}`, at: now, mine: true, status: undefined, unread: 0 });
    try {
      const r = await connectApi.upload(convId, file, { caption, replyToId: replyTo?.id }, setProgress);
      patchMessages(convId, (items) => items.map((m) => (m.id === tmpId ? r.data : m)));
      refreshConversations();
      return r.data;
    } catch (err) {
      patchMessages(convId, (items) => items.filter((m) => m.id !== tmpId));
      refreshConversations();
      throw err;
    } finally {
      if (localUrl) setTimeout(() => URL.revokeObjectURL(localUrl), 60000);
    }
  }, [myId, bumpConversation, patchMessages, refreshConversations]);

  const sendContact = useCallback(async (convId, userId, replyTo) => {
    const r = await connectApi.sendContact(convId, userId, replyTo?.id);
    patchMessages(convId, (items) => (items.some((m) => m.id === r.data.id) ? items : [...items, r.data]));
    refreshConversations();
    return r.data;
  }, [patchMessages, refreshConversations]);

  const sendResource = useCallback(async (convId, body, replyTo) => {
    const r = await connectApi.shareResource(convId, { ...body, ...(replyTo ? { replyToId: replyTo.id } : {}) });
    patchMessages(convId, (items) => (items.some((m) => m.id === r.data.id) ? items : [...items, r.data]));
    refreshConversations();
    return r.data;
  }, [patchMessages, refreshConversations]);

  const groupActions = useMemo(() => {
    const after = async (r) => { await Promise.all([refreshConversations(), refreshSummary()]); return r.data; };
    return {
      create: async (body) => after(await connectApi.createGroup(body)),
      update: async (id, body) => after(await connectApi.updateGroup(id, body)),
      addMembers: async (id, userIds) => after(await connectApi.addMembers(id, userIds)),
      removeMember: async (id, userId) => after(await connectApi.removeMember(id, userId)),
      makeAdmin: async (id, userId) => after(await connectApi.makeAdmin(id, userId)),
      removeAdmin: async (id, userId) => after(await connectApi.removeAdmin(id, userId)),
      setAvatar: async (id, file) => after(await connectApi.setGroupAvatar(id, file)),
      removeAvatar: async (id) => after(await connectApi.removeGroupAvatar(id)),
    };
  }, [refreshConversations, refreshSummary]);

  const sendTyping = useCallback((convId) => { connectApi.typing(convId).catch(() => {}); }, []);

  const openWith = useCallback(async (userId) => {
    const r = await connectApi.open(userId);
    await refreshConversations();
    return r.data;
  }, [refreshConversations]);

  // ── friends ───────────────────────────────────────────────────────────
  const afterFriendChange = useCallback(() => Promise.all([refreshFriends(), refreshConversations(), refreshSummary()]), [refreshFriends, refreshConversations, refreshSummary]);
  const friendActions = useMemo(() => ({
    request: async (userId) => { const r = await connectApi.sendRequest(userId); await afterFriendChange(); return r.data; },
    accept: async (requestId) => { await connectApi.accept(requestId); await afterFriendChange(); },
    decline: async (requestId) => { await connectApi.decline(requestId); await afterFriendChange(); },
    remove: async (userId) => { await connectApi.removeFriend(userId); await afterFriendChange(); },
  }), [afterFriendChange]);

  // ── live events ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!myId) return undefined;
    const showTyping = (convId) => {
      setTyping((t) => ({ ...t, [convId]: true }));
      clearTimeout(typingTimers.current[convId]);
      typingTimers.current[convId] = setTimeout(() => setTyping((t) => ({ ...t, [convId]: false })), TYPING_MS);
    };
    const onEvent = (e) => {
      const ev = e.detail || {};
      switch (ev.kind) {
        case 'message': {
          const { conversationId: cid, message } = ev;
          const watching = activeRef.current === cid && !document.hidden;
          patchMessages(cid, (items) => (items.some((m) => m.id === message.id) ? items : [...items, message]));
          if (message.kind === 'system') break;
          setTyping((t) => ({ ...t, [cid]: false }));
          if (convRef.current.some((c) => c.id === cid)) {
            bumpConversation(cid, { last: lastLine(message, { name: ev.from?.name, group: convRef.current.find((c) => c.id === cid)?.group }), at: message.at, mine: false, status: undefined, unread: watching ? 0 : (convRef.current.find((c) => c.id === cid)?.unread || 0) + 1 });
          } else {
            refreshConversations();
          }
          if (watching) markRead(cid);
          else {
            connectApi.delivered(cid).catch(() => {});
            if (!convRef.current.find((c) => c.id === cid)?.muted) { setSummary((s) => ({ ...s, unread: s.unread + 1 })); playNotificationChime(); } // a muted chat makes no sound and is not in the badge
          }
          break;
        }
        case 'message-edited':
          patchMessages(ev.conversationId, (items) => items.map((m) => (m.id === ev.message.id ? { ...m, ...ev.message, status: m.status } : m)));
          refreshConversations();
          break;
        case 'reaction':
          patchMessages(ev.conversationId, (items) => items.map((m) => (m.id === ev.messageId ? { ...m, reactions: ev.reactions } : m)));
          break;
        case 'message-deleted':
          patchMessages(ev.conversationId, (items) => items.map((m) => (m.id === ev.messageId ? { ...m, deleted: true, text: '' } : m)));
          refreshConversations();
          break;
        case 'receipt':
          patchMessages(ev.conversationId, (items) => items.map((m) => (m.senderId === myId && !m.pending && m.id <= ev.upTo && (RANK[m.status] || 0) < RANK[ev.status] ? { ...m, status: ev.status } : m)));
          setConversations((prev) => prev.map((c) => (c.id === ev.conversationId && c.mine && (RANK[c.status] || 0) < RANK[ev.status] ? { ...c, status: ev.status } : c)));
          break;
        case 'typing': showTyping(ev.conversationId); break;
        case 'presence':
          setConversations((prev) => prev.map((c) => (c.userId === ev.userId ? { ...c, online: ev.online } : c)));
          setFriends((f) => ({ ...f, friends: f.friends.map((x) => (x.id === ev.userId ? { ...x, online: ev.online } : x)) }));
          break;
        case 'conversation-changed': refreshConversations(); refreshSummary(); break;
        case 'friend-request': case 'friend-accepted': case 'friends-changed':
          afterFriendChange();
          if (ev.kind !== 'friends-changed') playNotificationChime();
          break;
        case 'notification': {
          const item = ev.item;
          if (!item) break;
          setNotes((n) => (n.items.some((x) => x.id === item.id) ? n : { items: [item, ...n.items].slice(0, 40), unread: n.unread + 1 }));
          playNotificationChime();
          // When the tab is in the background, show a normal browser notification (only if the person already allowed them).
          try {
            if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(item.title, { body: item.body || undefined, tag: item.id });
          } catch { /* optional */ }
          break;
        }
        case 'call': {
          const call = ev.call;
          if (!call) break;
          if (ev.event === 'incoming') { setIncoming(call); setCallByConv((m) => ({ ...m, [call.conversationId]: call })); }
          else if (ev.event === 'update') setCallByConv((m) => ({ ...m, [call.conversationId]: call }));
          else if (ev.event === 'ended') {
            setIncoming((cur) => (cur?.id === call.id ? null : cur));
            setCallByConv((m) => { const { [call.conversationId]: gone, ...rest } = m; return gone && gone.id !== call.id ? m : rest; });
            refreshConversations();
          }
          break;
        }
        default: break;
      }
    };
    const onOpen = () => refreshAll();
    const onVisible = () => { if (!document.hidden && activeRef.current) markRead(activeRef.current); };
    window.addEventListener('lifeos:connect', onEvent);
    window.addEventListener('lifeos:connect-open', onOpen);
    document.addEventListener('visibilitychange', onVisible);
    const timers = typingTimers.current;
    return () => {
      window.removeEventListener('lifeos:connect', onEvent);
      window.removeEventListener('lifeos:connect-open', onOpen);
      document.removeEventListener('visibilitychange', onVisible);
      Object.values(timers).forEach(clearTimeout);
    };
  }, [myId, patchMessages, bumpConversation, refreshConversations, refreshAll, afterFriendChange, markRead]);

  const messagesRef = useRef({});
  messagesRef.current = messagesBy;
  /** Loads older pages until a given message is on screen (used when jumping to a search result). */
  const ensureLoaded = useCallback(async (convId, messageId) => {
    for (let i = 0; i < 20; i += 1) {
      const cur = messagesRef.current[convId];
      if (cur?.items.some((m) => m.id === messageId)) return true;
      const first = cur?.items.find((m) => !m.pending);
      if (!cur?.hasMore || !first) return false;
      const r = await connectApi.messages(convId, { before: first.id, limit: 50 });
      messagesRef.current = { ...messagesRef.current, [convId]: { ...cur, items: [...r.data.items, ...cur.items], hasMore: r.data.hasMore } };
      setMessagesBy((prev) => ({ ...prev, [convId]: { ...prev[convId], items: [...r.data.items, ...prev[convId].items], hasMore: r.data.hasMore } }));
    }
    return false;
  }, []);
  const react = useCallback(async (convId, messageId, emoji) => {
    const r = await connectApi.react(messageId, emoji);
    patchMessages(convId, (items) => items.map((m) => (m.id === messageId ? { ...m, reactions: r.data.reactions } : m)));
  }, [patchMessages]);
  const forward = useCallback(async (messageId, conversationIds) => {
    const r = await connectApi.forward(messageId, conversationIds);
    r.data.items.forEach((m) => patchMessages(m.conversationId, (items) => (items.some((x) => x.id === m.id) ? items : [...items, m])));
    refreshConversations();
    return r.data.items.length;
  }, [patchMessages, refreshConversations]);
  const setPrefs = useCallback(async (convId, body) => {
    const r = await connectApi.setPrefs(convId, body);
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, ...r.data } : c)));
    refreshSummary();
  }, [refreshSummary]);

  const noteActions = useMemo(() => ({
    markAll: async () => { setNotes((n) => ({ items: n.items.map((x) => ({ ...x, read: true })), unread: 0 })); try { await connectApi.readNotifications(); } catch { /* ignore */ } },
    markOne: async (id) => {
      setNotes((n) => { const hit = n.items.find((x) => x.id === id && !x.read); return hit ? { items: n.items.map((x) => (x.id === id ? { ...x, read: true } : x)), unread: Math.max(0, n.unread - 1) } : n; });
      try { await connectApi.readNotifications([id]); } catch { /* ignore */ }
    },
  }), []);

  const callActions = useMemo(() => ({
    start: async (conversationId, mode) => {
      const r = await connectApi.startCall(conversationId, mode);
      setCallByConv((m) => ({ ...m, [conversationId]: r.data.call }));
      return r.data.call;
    },
    decline: async (call) => { setIncoming((cur) => (cur?.id === call.id ? null : cur)); try { await connectApi.declineCall(call.id); } catch { /* it may already be over */ } },
    dismiss: (call) => setIncoming((cur) => (cur?.id === call.id ? null : cur)),
    load: async (conversationId) => {
      try {
        const r = await connectApi.conversationCall(conversationId);
        setCallByConv((m) => { const { [conversationId]: _old, ...rest } = m; return r.data.call ? { ...rest, [conversationId]: r.data.call } : rest; });
      } catch { /* ignore */ }
    },
  }), []);

  const value = useMemo(() => ({
    myId, ready, conversations, friends, summary, messagesBy, typing,
    refreshAll, loadMessages, loadOlder, setActive, markRead, sendMessage, sendAttachment, sendContact, sendResource, editMessage, deleteMessage, sendTyping, openWith, friendActions, groupActions,
    unread: summary.unread, requests: friends.incoming.length,
    ensureLoaded, react, forward, setPrefs, notes, noteActions, incoming, callByConv, callActions, callsEnabled: Boolean(summary.callsEnabled),
  }), [ensureLoaded, react, forward, setPrefs, notes, noteActions, incoming, callByConv, callActions, myId, ready, conversations, friends, summary, messagesBy, typing, refreshAll, loadMessages, loadOlder, setActive, markRead, sendMessage, sendAttachment, sendContact, sendResource, editMessage, deleteMessage, sendTyping, openWith, friendActions, groupActions]);

  return <ConnectContext.Provider value={value}>{children}</ConnectContext.Provider>;
}

export const useConnect = () => useContext(ConnectContext);
