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
export function register(userId, tenantId, res) {
  const key = String(userId);
  let conns = connections.get(key);
  if (!conns) {
    conns = new Map();
    connections.set(key, conns);
  }
  const connId = `${Date.now()}-${connCounter++}`;
  conns.set(connId, { res, tenantId: String(tenantId) });
  ensureHeartbeat();

  res.on('close', () => {
    conns.delete(connId);
    if (conns.size === 0) connections.delete(key);
  });

  return () => {
    conns.delete(connId);
    if (conns.size === 0) connections.delete(key);
  };
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
