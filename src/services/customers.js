import { createCustomerApi } from './customerApi.mjs';
import { loadUserApiConfig } from './users';
import { clearAuth, getAuthToken } from '../utils/auth';

export const customerApi = createCustomerApi({
  getConfig: loadUserApiConfig,
  getToken: getAuthToken,
  onUnauthorized: clearAuth,
});
