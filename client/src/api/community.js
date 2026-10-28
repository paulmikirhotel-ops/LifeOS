import api from './client.js';

/** Community (Skill Exchange) API. The axios client already unwraps the { success, data } envelope to the body. */
export const communityApi = {
  me: () => api.get('/community/me'),
  saveProfile: (body) => api.put('/community/profile', body),
  mentors: (q) => api.get('/community/mentors', { params: { q: q || undefined } }),
  requestSession: (userId, message) => api.post('/community/mentors/request', { userId, message: message || undefined }),
  groups: ({ q, mine } = {}) => api.get('/community/groups', { params: { q: q || undefined, mine: mine ? 1 : undefined } }),
  createGroup: (body) => api.post('/community/groups', body),
  updateGroup: (id, body) => api.patch(`/community/groups/${id}`, body),
  join: (id, message) => api.post(`/community/groups/${id}/join`, { message: message || undefined }),
  leave: (id) => api.post(`/community/groups/${id}/leave`),
  removeMember: (id, userId) => api.delete(`/community/groups/${id}/members/${userId}`),
  requests: () => api.get('/community/requests'),
  respond: (id, action) => api.post(`/community/requests/${id}/respond`, { action }),
  cancel: (id) => api.delete(`/community/requests/${id}`),
  report: (body) => api.post('/community/report', body),
  block: (userId) => api.post(`/community/block/${userId}`),
  // Impact Network
  listings: ({ q, category, mine } = {}) => api.get('/community/impact', { params: { q: q || undefined, category: category || undefined, mine: mine ? 1 : undefined } }),
  createListing: (body) => api.post('/community/impact', body),
  updateListing: (id, body) => api.patch(`/community/impact/${id}`, body),
  interest: (id, message) => api.post(`/community/impact/${id}/interest`, { message: message || undefined }),
  // Volunteering log
  log: () => api.get('/community/log'),
  addLog: (body) => api.post('/community/log', body),
  updateLog: (id, body) => api.patch(`/community/log/${id}`, body),
  removeLog: (id) => api.delete(`/community/log/${id}`),
};

export const communityAdminApi = {
  list: (status) => api.get('/community/admin/reports', { params: { status } }),
  setStatus: (id, status) => api.patch(`/community/admin/reports/${id}`, { status }),
  listings: () => api.get('/community/admin/listings'),
  verify: (id, verified) => api.patch(`/community/admin/listings/${id}/verify`, { verified }),
};
