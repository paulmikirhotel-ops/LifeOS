/**
 * Realtime hub — lightweight Server-Sent Events (SSE) broadcaster.
 *
 * One connection per (userId, tenantId). Connections are keyed by userId; each
 * connection remembers the tenant it was opened for. Events are only delivered
 * when they belong to that tenant, so switching workspaces never leaks events
 * from another tenant.
 *
 * No external dependencies. Falls back gracefully: if the client cannot keep an
 * SSE connection open it polls /notifications/unread/count instead.
 */

const connections = new Map(); // userId(string) -> Map<connId, { res, tenantId }>
let connCounter = 0;
let heartbeatTimer = null;

function write(res, chunk) {
  try {
    res.write(chunk);
  } catch (err) {
    // Connection already gone — cleanup happens in 'close'.
  }
}

function sendHeartbeat() {
  for (const conns of connections.values()) {
    for (const { res } of conns.values()) {
      write(res, ':hb\n\n');
    }
  }
}

function ensureHeartbeat() {
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(sendHeartbeat, 25000);
    heartbeatTimer.unref?.(); // never keep the process alive just for heartbeats
  }
}

/**
 * Registers an SSE response for a user/tenant.
 * Returns an unsubscribe function.
 */
let presenceHook = null;
/** Connect listens here to tell friends when someone comes online or goes offline. */
export function setPresenceHook(fn) {
  presenceHook = fn;
}

function tellPresence(userId, online) {
  try {
    presenceHook?.(userId, online);
  } catch {
    /* presence is best-effort */
  }
}

function drop(key, connId) {
  const conns = connections.get(key);
  if (!conns || !conns.delete(connId)) return;
  if (conns.size === 0) {
    connections.delete(key);
    tellPresence(key, false);
  }
}

export function register(userId, tenantId, res) {
  const key = String(userId);
  let conns = connections.get(key);
  const first = !conns;
  if (!conns) {
    conns = new Map();
    connections.set(key, conns);
  }
  const connId = `${Date.now()}-${connCounter++}`;
  conns.set(connId, { res, tenantId: String(tenantId) });
  ensureHeartbeat();
  if (first) tellPresence(key, true);

  res.on('close', () => drop(key, connId));

  return () => drop(key, connId);
}

/** Is this user connected right now (any tab, any workspace)? */
export function isOnline(userId) {
  return connections.has(String(userId));
}

/** Sends an event to every open connection of a user, whichever workspace it was opened for (Connect is per person). */
export function emitToUser(userId, event, payload) {
  const conns = connections.get(String(userId));
  if (!conns || conns.size === 0) return;
  const data = `event: ${event}\nid: ${Date.now()}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const conn of conns.values()) write(conn.res, data);
}

/**
 * Sends an event to every open connection of `userId` whose tenant matches.
 * Payload is a JSON object delivered as an SSE `notification` event.
 */
export function emit(userId, tenantId, payload) {
  const key = String(userId);
  const conns = connections.get(key);
  if (!conns || conns.size === 0) return;

  const tenantKey = String(tenantId);
  const data = `event: notification\nid: ${Date.now()}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const conn of conns.values()) {
    if (conn.tenantId === tenantKey) {
      write(conn.res, data);
    }
  }
}

/** Total open connections (debugging / tests). */
export function connectionCount() {
  return [...connections.values()].reduce((sum, conns) => sum + conns.size, 0);
}
