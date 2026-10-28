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

  // video room (workspace members)
  roomJoin: (id) => api.post(`${base}/${id}/room`),
  roomPing: (id) => api.post(`${base}/${id}/room/ping`),
  roomLeave: (id) => api.post(`${base}/${id}/room/leave`),

  // invitation link (organizer)
  getInvite: (id) => api.get(`${base}/${id}/invite`),
  updateInvite: (id, body) => api.put(`${base}/${id}/invite`, body),
  regenerateInvite: (id) => api.post(`${base}/${id}/invite/regenerate`),
  inviteParticipants: (id) => api.get(`${base}/${id}/invite/participants`),

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
  // in-meeting chat
  chatList: (id, after) => api.get(`${base}/${id}/chat${q({ after })}`),
  chatSend: (id, text) => api.post(`${base}/${id}/chat`, { text }),
  // hand-off recording: any participant may claim the single recorder slot
  claimRecording: (id) => api.post(`${base}/${id}/recording/claim`),
  releaseRecording: (id) => api.post(`${base}/${id}/recording/release`),
  recordingBeat: (id, body) => api.post(`${base}/${id}/recording/beat`, body || {}),
  transcribeChunk: (id, blob, mime, offsetMs) =>
    api.post(`${base}/${id}/transcribe-chunk${q({ offsetMs })}`, blob, {
      headers: { 'Content-Type': mime },
      timeout: 60000,
      transformRequest: [(d) => d],
    }),
  recordingUrl: (id) => api.get(`${base}/${id}/recording/url`),

  process: (id, stage) => api.post(`${base}/${id}/process`, { stage }),
  generateSummary: (id) => api.post(`${base}/${id}/generate-summary`),
  sendMinutes: (id, emails) => api.post(`${base}/${id}/minutes/send`, { emails }),
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
};
