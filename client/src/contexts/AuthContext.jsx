import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { setAccessToken } from '../services/api.js';

const AuthContext = createContext(null);
export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const r = await api.post('/auth/refresh');
      setAccessToken(r.data.accessToken);
      const me = await api.get('/auth/me');
      setUser(me.data.user);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const login = async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    setAccessToken(r.data.accessToken);
    setUser(r.data.user);
    return r.data.user;
  };
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch { /* ignore */ }
    setAccessToken(null);
    setUser(null);
  };
  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}
