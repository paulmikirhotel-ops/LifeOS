import api from './client.js';

/** Life Balance, Knowledge and Backup. The axios client already unwraps the { success, data } envelope. */
// If the axios client already unwrapped { success, data }, this changes nothing. If not, it does it here.
const unwrap = (r) => (r && typeof r === 'object' && r.success === true && 'data' in r ? r.data : r);
const get = (url, cfg) => api.get(url, cfg).then(unwrap);
const post = (url, body, cfg) => api.post(url, body, cfg).then(unwrap);
const patch = (url, body, cfg) => api.patch(url, body, cfg).then(unwrap);
const put = (url, body, cfg) => api.put(url, body, cfg).then(unwrap);
const del = (url, cfg) => api.delete(url, cfg).then(unwrap);
/** Used by the pages to refuse an answer that is not shaped as expected, instead of crashing. */
export const describeAnswer = (r) => (r === null || r === undefined ? 'nothing' : typeof r === 'object' ? `an object with: ${Object.keys(r).slice(0, 8).join(', ') || 'no fields'}` : `a ${typeof r}`);
const raw = { headers: { 'Content-Type': 'application/octet-stream' }, transformRequest: [(d) => d] };

export const lifeApi = {
  balance: (week) => get('/life/balance', { params: week ? { week } : undefined }),
  addArea: (body) => post('/life/areas', body),
  updateArea: (id, body) => patch(`/life/areas/${id}`, body),
  removeArea: (id) => del(`/life/areas/${id}`),
  addLog: (body) => post('/life/logs', body),
  removeLog: (id) => del(`/life/logs/${id}`),

  entries: (params) => get('/life/knowledge', { params }),
  addEntry: (body) => post('/life/knowledge', body),
  updateEntry: (id, body) => patch(`/life/knowledge/${id}`, body),
  removeEntry: (id) => del(`/life/knowledge/${id}`),

  backupInfo: () => get('/life/backup'),
  backupSettings: (reminder) => put('/life/backup/settings', { reminder }),
  exportBackup: () => get('/life/backup/export'),
  previewRestore: (text) => post('/life/backup/preview', text, raw),
  restore: (text) => post('/life/backup/restore', text, raw),
};
