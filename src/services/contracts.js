import { createContractApi } from './contractApi.mjs';
import { loadUserApiConfig } from './users';
import { clearAuth, getAuthToken } from '../utils/auth';

export const contractApi = createContractApi({
  getConfig: loadUserApiConfig,
  getToken: getAuthToken,
  onUnauthorized: clearAuth,
});
