import { createTokenAxiosClient } from './axiosClient.mjs';
import { clearAuth, getAuthToken } from '../utils/auth';

// Legacy API routes keep their existing base URL and error handling.
const api = createTokenAxiosClient({
  baseURL: process.env.REACT_APP_API_BASE_URL || '/api',
  getToken: getAuthToken,
  onUnauthorized: clearAuth,
  getPathname: () => window.location.pathname,
  redirectToLogin: () => window.location.replace('/'),
});

export default api;
