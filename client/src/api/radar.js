import api from './client.js';

/** Opportunity Radar API. The axios client already unwraps the { success, data } envelope to the body. */
export const radarApi = {
  feed: (params) => api.get('/radar/feed', { params }),
  sources: () => api.get('/radar/sources'),
  addSource: (body) => api.post('/radar/sources', body),
  updateSource: (id, body) => api.patch(`/radar/sources/${id}`, body),
  removeSource: (id) => api.delete(`/radar/sources/${id}`),
  refresh: (body = {}) => api.post('/radar/refresh', body),
  profile: () => api.get('/radar/profile'),
  saveProfile: (keywords) => api.put('/radar/profile', { keywords }),
  setState: (id, state) => api.patch(`/radar/items/${id}`, { state }),
  addTask: (id) => api.post(`/radar/items/${id}/task`),
  explain: (id) => api.post(`/radar/items/${id}/explain`),
};
