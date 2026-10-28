import api from './client.js';

/** Wrappers over /api/connect (the axios client already unwraps the response envelope). */
const base = '/connect';

export const adminReportsApi = {
  list: (status) => api.get('/admin/connect-reports', { params: { status } }),
  setStatus: (id, status) => api.patch(`/admin/connect-reports/${id}`, { status }),
};

export const connectApi = {
  summary: () => api.get(`${base}/summary`),
  search: (q) => api.get(`${base}/users/search`, { params: { q } }),
  friends: () => api.get(`${base}/friends`),
  sendRequest: (userId) => api.post(`${base}/friends/requests`, { userId }),
  accept: (requestId) => api.post(`${base}/friends/requests/${requestId}/accept`),
  decline: (requestId) => api.post(`${base}/friends/requests/${requestId}/decline`),
  removeFriend: (userId) => api.delete(`${base}/friends/${userId}`),
  conversations: () => api.get(`${base}/conversations`),
  open: (userId) => api.post(`${base}/conversations`, { userId }),
  messages: (id, params) => api.get(`${base}/conversations/${id}/messages`, { params }),
  send: (id, body) => api.post(`${base}/conversations/${id}/messages`, body),
  edit: (messageId, text) => api.patch(`${base}/messages/${messageId}`, { text }),
  remove: (messageId) => api.delete(`${base}/messages/${messageId}`),
  read: (id) => api.post(`${base}/conversations/${id}/read`),
  delivered: (id) => api.post(`${base}/conversations/${id}/delivered`),
  createGroup: (body) => api.post(`${base}/groups`, body),
  updateGroup: (id, body) => api.patch(`${base}/groups/${id}`, body),
  addMembers: (id, userIds) => api.post(`${base}/groups/${id}/members`, { userIds }),
  removeMember: (id, userId) => api.delete(`${base}/groups/${id}/members/${userId}`),
  makeAdmin: (id, userId) => api.put(`${base}/groups/${id}/admins/${userId}`),
  removeAdmin: (id, userId) => api.delete(`${base}/groups/${id}/admins/${userId}`),
  upload: (id, file, { caption, replyToId, voice } = {}, onProgress) => {
    const form = new FormData();
    if (voice) form.append('voice', '1');
    if (caption) form.append('caption', caption);
    if (replyToId) form.append('replyToId', replyToId);
    form.append('file', file);
    return api.post(`${base}/conversations/${id}/attachments`, form, {
      headers: { 'Content-Type': undefined },
      timeout: 0,
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
    });
  },
  sendContact: (id, userId, replyToId) => api.post(`${base}/conversations/${id}/contact`, { userId, ...(replyToId ? { replyToId } : {}) }),
  shareOptions: (type, q) => api.get(`${base}/share/options`, { params: { type, ...(q ? { q } : {}) } }),
  shareResource: (id, body) => api.post(`${base}/conversations/${id}/resource`, body),
  getResource: (messageId) => api.get(`${base}/resources/${messageId}`),
  addResource: (messageId) => api.post(`${base}/resources/${messageId}/add`),
  file: (messageId) => api.get(`${base}/attachments/${messageId}`, { responseType: 'blob' }),
  sharedFiles: (params) => api.get(`${base}/files`, { params }),
  startCall: (id, mode) => api.post(`${base}/conversations/${id}/call`, { mode }),
  conversationCall: (id) => api.get(`${base}/conversations/${id}/call`),
  activeCalls: () => api.get(`${base}/calls/active`),
  react: (messageId, emoji) => api.put(`${base}/messages/${messageId}/reaction`, { emoji }),
  forward: (messageId, conversationIds) => api.post(`${base}/messages/${messageId}/forward`, { conversationIds }),
  setPrefs: (id, body) => api.put(`${base}/conversations/${id}/prefs`, body),
  searchMessages: (id, q) => api.get(`${base}/conversations/${id}/search`, { params: { q } }),
  groupAvatar: (id) => api.get(`${base}/groups/${id}/avatar`, { responseType: 'blob' }),
  setGroupAvatar: (id, file) => { const form = new FormData(); form.append('file', file); return api.put(`${base}/groups/${id}/avatar`, form, { headers: { 'Content-Type': undefined } }); },
  removeGroupAvatar: (id) => api.delete(`${base}/groups/${id}/avatar`),
  adminReports: (status) => api.get('/admin/connect-reports', { params: { status } }),
  adminSetReport: (id, status) => api.patch(`/admin/connect-reports/${id}`, { status }),
  blocked: () => api.get(`${base}/blocks`),
  block: (userId) => api.post(`${base}/blocks`, { userId }),
  unblock: (userId) => api.delete(`${base}/blocks/${userId}`),
  report: (body) => api.post(`${base}/reports`, body),
  privacy: () => api.get(`${base}/privacy`),
  setPrivacy: (discoverable) => api.put(`${base}/privacy`, { discoverable }),
  notifications: () => api.get(`${base}/notifications`),
  readNotifications: (ids) => api.post(`${base}/notifications/read`, ids ? { ids } : {}),
  callHistory: () => api.get(`${base}/calls/history`),
  joinCall: (id) => api.post(`${base}/calls/${id}/join`),
  declineCall: (id) => api.post(`${base}/calls/${id}/decline`),
  leaveCall: (id) => api.post(`${base}/calls/${id}/leave`),
  pingCall: (id) => api.post(`${base}/calls/${id}/ping`),
  typing: (id) => api.post(`${base}/conversations/${id}/typing`),
};
