import { createConfigLoader } from '../config/userApiConfig.mjs';
import { createUserApi } from './userApi.mjs';
import { clearAuth, getAuthToken } from '../utils/auth';

export const loadUserApiConfig = createConfigLoader(`${process.env.PUBLIC_URL || ''}/user-api.config.json`);
export const userApi = createUserApi({
  getConfig: loadUserApiConfig,
  getToken: getAuthToken,
  onUnauthorized: clearAuth,
});
