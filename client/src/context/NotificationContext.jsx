import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from './AuthContext.jsx';
import { useTenant } from './TenantContext.jsx';
import {
  playNotificationChime,
  unlockNotificationAudio,
  setNotificationSoundEnabled,
} from '../utils/notificationSound.js';
import { moduleRoute } from '../utils/notificationMeta.js';

const NotificationContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const SSE_RECONNECT_MS = 20000;
const POLL_MS = 60000;
const SSE_OPEN_TIMEOUT_MS = 15000;
const TOAST_MS = 5000;
const MAX_SEEN = 200;

const DEFAULT_PREFS = {
  sound: true,
  toast: true,
  modules: {
    task: true,
    schedule: true,
    calendar: true,
    journal: true,
    focus: true,
    finance: true,
    habit: true,
    goal: true,
    system: true,
    invitation: true,
  },
};

function moduleEnabled(prefs, module) {
  const key = module || 'system';
  if (prefs.modules[key] === false) return false;
  return true;
}

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const { activeTenantId } = useTenant();
  const navigate = useNavigate();

  const authed = !!user && !!activeTenantId;
  const userId = user?.id || null;
  const tenantKey = activeTenantId || 'none';

  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]); // recent notifications (mixed)
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [sseHealthy, setSseHealthy] = useState(false);

  const esRef = useRef(null);
  const seenRef = useRef(new Set());
  const pollRef = useRef(null);
  const reconnectRef = useRef(null);
  const openTimerRef = useRef(null);
  const errorCountRef = useRef(0);
  const toastIdRef = useRef(0);
  const mountedRef = useRef(true);
  const prefsRef = useRef(DEFAULT_PREFS);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  // ── Audio unlock on first user gesture ────────────────────────────────
  useEffect(() => {
    const unlock = () => unlockNotificationAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // ── Keep the sound engine in sync with preferences ────────────────────
  useEffect(() => {
    setNotificationSoundEnabled(prefs.sound !== false);
  }, [prefs.sound]);

  // ── Fetch helpers ──────────────────────────────────────────────────────
  const refreshCount = useCallback(async () => {
    if (!authed) return;
    try {
      const res = await api.get('/notifications/unread/count');
      if (res.success) setUnread(res.data.count);
    } catch {
      /* network hiccup — ignore */
    }
  }, [authed]);

  const refreshAll = useCallback(async () => {
    if (!authed) return;
    try {
      const [countRes, listRes] = await Promise.all([
        api.get('/notifications/unread/count'),
        api.get('/notifications', { params: { limit: 10 } }),
      ]);
      if (countRes.success) setUnread(countRes.data.count);
      if (listRes.success) setItems(listRes.data.items || []);
    } catch {
      /* ignore */
    }
  }, [authed]);

  // ── Preferences ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!authed) {
      setPrefs(DEFAULT_PREFS);
      return undefined;
    }
    api
      .get('/notifications/preferences')
      .then((res) => {
        if (!cancelled && res.success) {
          setPrefs({
            sound: res.data.sound !== false,
            toast: res.data.toast !== false,
            modules: { ...DEFAULT_PREFS.modules, ...(res.data.modules || {}) },
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authed, userId]);

  const updatePrefs = useCallback(async (patch) => {
    try {
      const res = await api.patch('/notifications/preferences', patch);
      if (res.success) {
        setPrefs({
          sound: res.data.sound !== false,
          toast: res.data.toast !== false,
          modules: { ...DEFAULT_PREFS.modules, ...(res.data.modules || {}) },
        });
        return res.data;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  // ── Live notifications from SSE ───────────────────────────────────────
  const addToast = useCallback((n) => {
    const toastId = ++toastIdRef.current;
    setToasts((prev) => [...prev, { ...n, toastId }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
    }, TOAST_MS);
  }, []);

  const handleLive = useCallback(
    (n) => {
      if (!n?._id) return;
      if (seenRef.current.has(n._id)) return; // never replay the same one
      seenRef.current.add(n._id);
      if (seenRef.current.size > MAX_SEEN) {
        const first = seenRef.current.values().next().value;
        seenRef.current.delete(first);
      }

      setItems((prev) => [n, ...prev.filter((i) => i._id !== n._id)].slice(0, 30));
      setUnread((prev) => prev + 1);

      // Read the latest prefs from a ref so this handler stays stable
      // (keeps the SSE connection from re-opening on every pref change).
      const currentPrefs = prefsRef.current;
      if (!moduleEnabled(currentPrefs, n.module || n.type)) return;
      if (currentPrefs.toast !== false) addToast(n);
      if (currentPrefs.sound !== false) playNotificationChime();

      // Optional OS-level notification — only when the tab is hidden.
      if (typeof document !== 'undefined' && document.hidden) {
        try {
          if (
            localStorage.getItem('lifeos.browserNotif') === 'on' &&
            typeof Notification !== 'undefined' &&
            Notification.permission === 'granted'
          ) {
            new Notification(n.title || 'New notification', {
              body: n.message || '',
              tag: n._id,
            });
          }
        } catch {
          /* ignore */
        }
      }
    },
    [addToast]
  );

  // ── Polling fallback (only used when SSE is unhealthy) ─────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      refreshCount();
    }, POLL_MS);
  }, [refreshCount]);

  const connectSSE = useCallback(() => {
    if (!authed || !mountedRef.current) return;

    let es;
    try {
      es = new EventSource(`${API_BASE}/notifications/stream`, { withCredentials: true });
    } catch {
      setSseHealthy(false);
      startPolling();
      return;
    }
    esRef.current = es;
    errorCountRef.current = 0;

    const stopOpenTimer = () => {
      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
    };

    es.onopen = () => {
      if (esRef.current !== es) return; // stale connection
      setSseHealthy(true);
      stopOpenTimer();
      stopPolling();
      refreshAll();
    };

    es.addEventListener('notification', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.notification) handleLive(payload.notification);
      } catch {
        /* ignore malformed frames */
      }
    });

    es.onerror = () => {
      errorCountRef.current += 1;
      if (errorCountRef.current >= 3) {
        // Give up on this connection; reconnect manually after a delay.
        es.close();
        setSseHealthy(false);
        startPolling();
        if (mountedRef.current && !reconnectRef.current) {
          reconnectRef.current = setTimeout(() => {
            reconnectRef.current = null;
            connectSSE();
          }, SSE_RECONNECT_MS);
        }
      }
    };

    // If we never get an open event, the endpoint is unreachable (e.g. 401/404).
    openTimerRef.current = setTimeout(() => {
      if (esRef.current === es) {
        es.close();
        esRef.current = null;
        setSseHealthy(false);
        startPolling();
      }
    }, SSE_OPEN_TIMEOUT_MS);
  }, [authed, refreshAll, startPolling, stopPolling, handleLive]);

  // Manage SSE lifecycle on auth / tenant changes.
  useEffect(() => {
    if (!authed) {
      setUnread(0);
      setItems([]);
      setSseHealthy(false);
      stopPolling();
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      return undefined;
    }
    refreshAll();
    connectSSE();

    const onVisibility = () => {
      if (!document.hidden) refreshCount();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refreshCount);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refreshCount);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      stopPolling();
    };
  }, [authed, tenantKey, connectSSE, refreshAll, refreshCount, stopPolling]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPolling();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [stopPolling]);

  // Fresh list every time the panel opens.
  useEffect(() => {
    if (panelOpen && authed) refreshAll();
  }, [panelOpen, authed, refreshAll]);

  // ── Actions ────────────────────────────────────────────────────────────
  const markRead = useCallback(
    async (id) => {
      try {
        await api.patch(`/notifications/${id}/read`);
      } catch {
        /* ignore */
      }
      setItems((prev) => prev.map((i) => (i._id === id ? { ...i, isRead: true, readAt: new Date().toISOString() } : i)));
      setUnread((prev) => Math.max(0, prev - 1));
    },
    []
  );

  const markAllRead = useCallback(async () => {
    try {
      await api.patch('/notifications/read-all');
    } catch {
      /* ignore */
    }
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
    setUnread(0);
  }, []);

  const removeNotification = useCallback(async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
    } catch {
      /* ignore */
    }
    setItems((prev) => prev.filter((i) => i._id !== id));
    refreshCount();
  }, [refreshCount]);

  const dismissToast = useCallback((toastId) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  }, []);

  /** Open a notification: mark read (if unread) and deep-link to its module. */
  const openNotification = useCallback(
    async (n) => {
      if (n?.toastId) dismissToast(n.toastId);
      if (n?._id && !n.isRead) {
        markRead(n._id);
      }
      const route = moduleRoute(n?.module || n?.type);
      if (route) navigate(route);
      setPanelOpen(false);
    },
    [navigate, markRead, dismissToast]
  );

  const value = {
    unread,
    items,
    prefs,
    panelOpen,
    setPanelOpen,
    sseHealthy,
    toasts,
    markRead,
    markAllRead,
    openNotification,
    removeNotification,
    dismissToast,
    refresh: refreshAll,
    updatePrefs,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export const useNotification = () => useContext(NotificationContext);
