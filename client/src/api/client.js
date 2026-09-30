import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  // Never let the browser HTTP cache revalidate API GETs: a 304 has no body,
  // and axios treats 304 as an error (validateStatus 200-299), which blanked
  // pages whose data was cached (e.g. /analytics/overview). With no-store the
  // server always sends the full payload.
  headers: { 'Cache-Control': 'no-store' },
});

// One refresh at a time. The API rotates refresh tokens, so parallel refreshes (e.g. a
// recording chunk upload and a poll both getting a 401 after the 15-minute access token
// expires) would invalidate each other and sign the user out mid-meeting.
let refreshing = null;
function refreshSession() {
  if (!refreshing) {
    // Use the configured API base (VITE_API_URL) — a hard-coded '/api/…' would hit the
    // static host instead of the API when the frontend and API are deployed separately.
    refreshing = axios
      .post(`${api.defaults.baseURL}/auth/refresh`, {}, { withCredentials: true })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

// Response interceptor to extract data from envelope
api.interceptors.response.use(
  (response) => {
    return response.data; // Returns { success: true, data } or { success: false, ... }
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      const isAuthPath = originalRequest.url.includes('/auth/refresh') || originalRequest.url.includes('/auth/login');
      
      if (!isAuthPath) {
        originalRequest._retry = true;
        try {
          // Attempt to refresh the token
          await refreshSession();
          return api(originalRequest);
        } catch (refreshError) {
          // Only sign out when the server actually rejected the session. A dropped connection
          // must not log the user out of a live meeting.
          const status = refreshError?.response?.status;
          if (status === 401 || status === 403) {
            window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          }
          return Promise.reject(
            refreshError?.response?.data || { success: false, message: 'Connection interrupted', code: 'NETWORK_ERROR' }
          );
        }
      }
    }

    // Wrap error for easier handling in components
    const apiError = error.response?.data || {
      success: false,
      message: error.message || 'An unexpected error occurred',
      code: 'NETWORK_ERROR'
    };

    return Promise.reject(apiError);
  }
);

export default api;
