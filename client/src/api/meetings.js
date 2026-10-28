import api from './client.js';

/** Thin wrappers over /api/meetings (the axios client already unwraps the response envelope). */
const base = '/meetings';
const q = (params) => {
  const s = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') s.set(k, v);
  });
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const meetingsApi = {
  capabilities: () => api.get(`${base}/capabilities`),
  members: () => api.get(`${base}/members`),
  list: (params) => api.get(`${base}${q(params)}`),
  get: (id) => api.get(`${base}/${id}`),
  create: (body) => api.post(base, body),
  update: (id, body) => api.put(`${base}/${id}`, body),
  remove: (id, scope) => api.delete(`${base}/${id}${q({ scope })}`),
  start: (id) => api.post(`${base}/${id}/start`),
  end: (id, body) => api.post(`${base}/${id}/end`, body || {}),
  cancel: (id) => api.post(`${base}/${id}/cancel`),

  transcript: (id, params) => api.get(`${base}/${id}/transcript${q(params)}`),
  editSegment: (id, seq, body) => api.patch(`${base}/${id}/transcript/${seq}`, body),
  importTranscript: (id, text) => api.post(`${base}/${id}/transcript/import`, { text }),
  speakers: (id) => api.get(`${base}/${id}/speakers`),
  renameSpeaker: (id, label, name) => api.patch(`${base}/${id}/speakers`, { label, name }),

  putChunk: (id, index, blob, mime) =>
    api.put(`${base}/${id}/recording/chunks/${index}`, blob, {
      headers: { 'Content-Type': mime },
      timeout: 60000,
      transformRequest: [(d) => d],
    }),
  transcribeChunk: (id, blob, mime, offsetMs) =>
    api.post(`${base}/${id}/transcribe-chunk${q({ offsetMs })}`, blob, {
      headers: { 'Content-Type': mime },
      timeout: 60000,
      transformRequest: [(d) => d],
    }),
  recordingUrl: (id) => api.get(`${base}/${id}/recording/url`),

  process: (id, stage) => api.post(`${base}/${id}/process`, { stage }),
  generateSummary: (id) => api.post(`${base}/${id}/generate-summary`),
  generateMinutes: (id) => api.post(`${base}/${id}/generate-minutes`),
  saveMinutes: (id, content) => api.put(`${base}/${id}/minutes`, { content }),
  ask: (id, question, history) => api.post(`${base}/${id}/ask`, { question, history }),

  actionItems: (id) => api.get(`${base}/${id}/action-items`),
  allActionItems: (params) => api.get(`${base}/action-items${q(params)}`),
  createActionItem: (id, body) => api.post(`${base}/${id}/action-items`, body),
  updateActionItem: (id, itemId, body) => api.patch(`${base}/${id}/action-items/${itemId}`, body),
  removeActionItem: (id, itemId) => api.delete(`${base}/${id}/action-items/${itemId}`),
  taskFromItem: (id, itemId) => api.post(`${base}/${id}/action-items/${itemId}/task`),
  tasksFromItems: (id) => api.post(`${base}/${id}/action-items/create-tasks`),

  exportFile: (id, kind, format) => api.get(`${base}/${id}/export${q({ kind, format })}`, { responseType: 'blob' }),
  getShare: (id) => api.get(`${base}/${id}/share`),
  createShare: (id, body) => api.post(`${base}/${id}/share`, body),
  revokeShare: (id) => api.delete(`${base}/${id}/share`),
  publicMeeting: (token) => api.get(`/public/meetings/${encodeURIComponent(token)}`),

  // ── invitation link (Phase 1) ─────────────────────────────────────────
  /** Organizer view of the link, its access settings and attendance counts. */
  invite: (id) => api.get(`${base}/${id}/invite`),
  /** Issues a new code — every previously shared link stops working at once. */
  regenerateInvite: (id) => api.post(`${base}/${id}/invite/regenerate`),
  /** Turns the link off without touching the meeting. */
  revokeInvite: (id) => api.post(`${base}/${id}/invite/revoke`),
  updateAccess: (id, body) => api.patch(`${base}/${id}/access`, body),

  // ── attendance ────────────────────────────────────────────────────────
  attendance: (id) => api.get(`${base}/${id}/attendance`),
  reviewAttendance: (id, attendanceId, decision) =>
    api.post(`${base}/${id}/attendance/${attendanceId}/review`, { decision }),
  removeAttendance: (id, attendanceId) => api.delete(`${base}/${id}/attendance/${attendanceId}`),

  // ── my invitations / joining from inside the app ──────────────────────
  myInvitations: () => api.get(`${base}/invitations`),
  respond: (id, response) => api.post(`${base}/${id}/respond`, { response }),
  join: (id) => api.post(`${base}/${id}/join`),
  leave: (id) => api.post(`${base}/${id}/leave`),
};

/**
 * Public invitation-link API (`/meet/<code>`).
 *
 * A separate object because these calls must work with NO session at all — they
 * deliberately bypass the axios client's 401 → refresh → redirect interceptor,
 * which would otherwise bounce an anonymous visitor to /login and turn a
 * shareable link into a login wall.
 */
const publicBase = '/public/invite';

const guestHeaders = (guestKey) => (guestKey ? { headers: { 'x-lifeos-guest': guestKey } } : undefined);

async function publicRequest(path, { method = 'GET', body, guestKey } = {}) {
  const base = import.meta.env.VITE_API_URL || '/api';
  const response = await fetch(`${base}${publicBase}${path}`, {
    method,
    credentials: 'include', // sends the session cookie when the visitor happens to be signed in
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(guestKey ? { 'x-lifeos-guest': guestKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || 'Something went wrong. Please try again.');
    error.code = payload?.code || 'REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }
  // Matches the axios client, which unwraps the `{ success, data }` envelope.
  return payload;
}

export const inviteApi = {
  get: (code, guestKey) => publicRequest(`/${encodeURIComponent(code)}`, { guestKey }),
  join: (code, { name, email, requestOnly } = {}, guestKey) =>
    publicRequest(`/${encodeURIComponent(code)}/join`, {
      method: 'POST',
      body: { name, email, requestOnly },
      guestKey,
    }),
  addToCalendar: (code, guestKey) =>
    publicRequest(`/${encodeURIComponent(code)}/calendar`, { method: 'POST', guestKey }),
};

export { guestHeaders };
