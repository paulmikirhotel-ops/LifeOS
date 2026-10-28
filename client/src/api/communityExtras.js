import api from './client.js';

/** Community extras: Learning resources and Sessions. Like the rest of the Community API, answers carry the payload in `.data`. */
export const extrasApi = {
  resources: ({ q, skill, mine } = {}) => api.get('/community/resources', { params: { q: q || undefined, skill: skill || undefined, mine: mine ? 1 : undefined } }),
  share: (body) => api.post('/community/resources', body),
  removeResource: (id) => api.delete(`/community/resources/${id}`),
  reportResource: (id, body) => api.post(`/community/resources/${id}/report`, body),
  partners: () => api.get('/community/sessions/partners'),
  sessions: () => api.get('/community/sessions'),
  propose: (body) => api.post('/community/sessions', body),
  respond: (id, action) => api.post(`/community/sessions/${id}/respond`, { action }),
  counter: (id, body) => api.post(`/community/sessions/${id}/counter`, body),
  cancel: (id) => api.post(`/community/sessions/${id}/cancel`),
  addToCalendar: (id) => api.post(`/community/sessions/${id}/calendar`),
};

export const extrasAdminApi = {
  reports: (status) => api.get('/community/admin/resource-reports', { params: { status } }),
  setReport: (id, status) => api.patch(`/community/admin/resource-reports/${id}`, { status }),
  removeResource: (id) => api.delete(`/community/admin/resources/${id}`),
};
