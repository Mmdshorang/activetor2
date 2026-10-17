import { normalizeUser } from '../services/userApi.mjs';

const SESSION_KEY = 'userApiSession.v1';
export const AUTH_CHANGED = 'user-api-auth-changed';
const removeLegacyAuth = () => {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem('token');
    storage.removeItem('authUser');
  }
};
const readSession = () => {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (typeof session?.token !== 'string' || !session.token.trim()) return null;
    const user = normalizeUser(session.user);
    return user.IsActive ? { token: session.token, user } : null;
  } catch { return null; }
};
export const getAuthToken = () => readSession()?.token || null;
export const getAuthUser = () => readSession()?.user || null;
export const setAuth = ({ token, user }) => {
  const safeUser = normalizeUser(user);
  if (typeof token !== 'string' || !token.trim() || !safeUser.IsActive) throw new Error('اطلاعات نشست ورود معتبر نیست.');
  removeLegacyAuth();
  // Password and per-user Token fields are deliberately absent from safeUser.
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, user: safeUser }));
  window.dispatchEvent(new Event(AUTH_CHANGED));
};
export const clearAuth = () => {
  removeLegacyAuth();
  sessionStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED));
};
export const canAccessPage = (user, pageKey) => Boolean(user && ['users', 'customers', 'contracts'].includes(pageKey));
