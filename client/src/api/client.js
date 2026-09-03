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
          await axios.post('/api/auth/refresh', {}, { withCredentials: true });
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed, clear auth and redirect
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          return Promise.reject(refreshError);
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
