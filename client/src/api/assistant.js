import api from './client.js';

/** Assistant API. The axios client unwraps the { success, data } envelope to the body. */
export const assistantApi = {
  status: () => api.get('/assistant/status'),
  chats: () => api.get('/assistant/chats'),
  chat: (id) => api.get(`/assistant/chats/${id}`),
  removeChat: (id) => api.delete(`/assistant/chats/${id}`),
  send: (message, chatId) => api.post('/assistant/chat', { message, ...(chatId ? { chatId } : {}) }),
  confirm: (id) => api.post(`/assistant/proposals/${id}/confirm`),
  cancel: (id) => api.post(`/assistant/proposals/${id}/cancel`),
  undo: (id) => api.post(`/assistant/proposals/${id}/undo`),
};
