import React, { createContext, useContext, useEffect, useState } from 'react';
import { userApi, loadUserApiConfig } from '../services/users';
import { startConfigRefresh } from '../config/userApiConfig.mjs';
import { AUTH_CHANGED, clearAuth, getAuthUser, setAuth } from '../utils/auth';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(getAuthUser);
  useEffect(() => startConfigRefresh(loadUserApiConfig), []);
  useEffect(() => {
    const sync = () => setUser(getAuthUser());
    window.addEventListener(AUTH_CHANGED, sync);
    return () => window.removeEventListener(AUTH_CHANGED, sync);
  }, []);
  const login = async (username, password) => {
    const session = await userApi.login(username, password);
    setAuth(session);
    return session.user;
  };
  return <AuthContext.Provider value={{ user, login, logout: clearAuth, loading: false }}>{children}</AuthContext.Provider>;
}
