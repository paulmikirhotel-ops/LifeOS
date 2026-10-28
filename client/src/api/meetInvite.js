import axios from 'axios';
import api from './client.js';

/**
 * Public join-link API. Deliberately NOT the shared `api` client: that one refreshes sessions and
 * signs the user out on 401, but a 401 here just means "sign in to join" (or a wrong pass).
 * Cookies are still sent so a signed-in LifeOS user is recognised.
 */
const pub = axios.create({ baseURL: `${import.meta.env.VITE_API_URL || '/api'}/public/meet`, withCredentials: true });
const unwrap = (r) => r.data;
const fail = (e) => Promise.reject(e.response?.data || { success: false, message: 'Could not reach LifeOS. Check your connection.', code: 'NETWORK_ERROR' });

/** Renews an expiring login cookie (via the normal client) so the server sees a signed-in user as signed in. */
export const touchSession = () => api.get('/auth/me').catch(() => null);

export const meetInviteApi = {
  info: (token) => pub.get(`/${token}`).then(unwrap, fail),
  join: (token, body) => pub.post(`/${token}/join`, body).then(unwrap, fail),
  session: (token, pass) => pub.get(`/${token}/session`, { headers: { 'X-Meeting-Pass': pass } }).then(unwrap, fail),
  // read-only minutes (by pass while still in the browser, or by the personal key from the e-mail)
  minutes: (token, pass) => pub.get(`/${token}/minutes`, { headers: pass ? { 'X-Meeting-Pass': pass } : {} }).then(unwrap, fail),
  minutesByKey: (key) => pub.get(`/minutes/${encodeURIComponent(key)}`).then(unwrap, fail),
  // chat for link joiners
  chatList: (token, pass, after) => pub.get(`/${token}/chat`, { params: after ? { after } : {}, headers: { 'X-Meeting-Pass': pass } }).then(unwrap, fail),
  chatSend: (token, pass, text) => pub.post(`/${token}/chat`, { text }, { headers: { 'X-Meeting-Pass': pass } }).then(unwrap, fail),
  // hand-off recording for link joiners (same rules as members; saved on the organizer's meeting)
  recClaim: (token, pass) => pub.post(`/${token}/recording/claim`, {}, { headers: { 'X-Meeting-Pass': pass } }).then(unwrap, fail),
  recRelease: (token, pass) => pub.post(`/${token}/recording/release`, {}, { headers: { 'X-Meeting-Pass': pass } }).then(unwrap, fail),
  recBeat: (token, pass, body) => pub.post(`/${token}/recording/beat`, body || {}, { headers: { 'X-Meeting-Pass': pass } }).then(unwrap, fail),
  recChunk: (token, pass, index, blob, mime) =>
    pub.put(`/${token}/recording/chunks/${index}`, blob, { headers: { 'X-Meeting-Pass': pass, 'Content-Type': mime }, timeout: 60000, transformRequest: [(d) => d] }).then(unwrap, fail),
  // video room for link joiners (authorised by the pass)
  roomJoin: (token, pass) => pub.post(`/${token}/room`, {}, { headers: { 'X-Meeting-Pass': pass } }).then(unwrap, fail),
  roomPing: (token, pass) => pub.post(`/${token}/room/ping`, {}, { headers: { 'X-Meeting-Pass': pass } }).then(unwrap, fail),
  roomLeave: (token, pass) => pub.post(`/${token}/room/leave`, {}, { headers: { 'X-Meeting-Pass': pass } }).then(unwrap, fail),
};

// The pass lives in sessionStorage (this tab only) and is sent as a header, never in the URL.
const key = (token) => `lifeos:meet-pass:${token.slice(0, 16)}`;
export const passStore = {
  get: (t) => { try { return sessionStorage.getItem(key(t)); } catch { return null; } },
  set: (t, v) => { try { sessionStorage.setItem(key(t), v); } catch { /* private mode */ } },
  clear: (t) => { try { sessionStorage.removeItem(key(t)); } catch { /* ignore */ } },
};
