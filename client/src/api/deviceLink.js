import api from './client.js';

/** Sign in with QR + linked devices. The axios client already unwraps { success, data }; this also copes if it did not. */
const unwrap = (r) => (r && typeof r === 'object' && r.success === true && 'data' in r ? r.data : r);
const get = (url) => api.get(url).then(unwrap);
const post = (url, body) => api.post(url, body).then(unwrap);
const del = (url) => api.delete(url).then(unwrap);

export const deviceLinkApi = {
  // the computer (not signed in yet)
  start: () => post('/auth/link/start', {}),
  status: (code, secret) => post('/auth/link/status', { code, secret }),
  // the phone (signed in)
  peek: (code) => post('/auth/link/peek', { code }),
  lookup: (pair) => post('/auth/link/lookup', { pair }),
  approve: (target) => post('/auth/link/approve', target),
  deny: (target) => post('/auth/link/deny', target),
  // my devices
  devices: () => get('/auth/link/devices'),
  removeDevice: (id) => del(`/auth/link/devices/${encodeURIComponent(id)}`),
};
