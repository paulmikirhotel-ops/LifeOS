import api from './client.js';

/** NextStep API. The axios client already unwraps the { success, data } envelope to the body. */
export const nextstepApi = {
  list: () => api.get('/nextstep'),
  next: () => api.get('/nextstep/next'),
  create: (body) => api.post('/nextstep/plans', body),
  get: (id) => api.get(`/nextstep/plans/${id}`),
  update: (id, body) => api.patch(`/nextstep/plans/${id}`, body),
  archive: (id) => api.delete(`/nextstep/plans/${id}`),
  revise: (id, instruction) => api.post(`/nextstep/plans/${id}/revise`, { instruction }),
  approve: (id) => api.post(`/nextstep/plans/${id}/approve`),
  addItem: (id, body) => api.post(`/nextstep/plans/${id}/items`, body),
  patchItem: (id, itemId, body) => api.patch(`/nextstep/plans/${id}/items/${itemId}`, body),
  removeItem: (id, itemId) => api.delete(`/nextstep/plans/${id}/items/${itemId}`),
  mark: (id, itemId, action) => api.post(`/nextstep/plans/${id}/items/${itemId}/mark`, { action }),
};
