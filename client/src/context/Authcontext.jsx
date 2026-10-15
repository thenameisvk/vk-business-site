import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import API, { getSession, saveSession, clearSession } from '../api';

const AuthContext = createContext(null);

/* session = { token, role: 'admin' | 'user', user: { id?, name } } */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getSession());
  const [checking, setChecking] = useState(() => !!getSession());

  // On page load, confirm the stored token is still valid (also picks up blocks)
  useEffect(() => {
    if (!getSession()) { setChecking(false); return undefined; }
    let alive = true;
    API.get('/user/me')
      .then(({ data }) => {
        if (!alive) return;
        const next = { ...getSession(), role: data.role, user: data.user };
        saveSession(next);
        setSession(next);
      })
      .catch(() => { if (alive) { clearSession(); setSession(null); } })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (secretKey) => {
    const { data } = await API.post('/user/login', { secretKey });
    const next = { token: data.token, role: data.role, user: data.user };
    saveSession(next);
    setSession(next);
    return next;
  }, []);

  const logout = useCallback(() => { clearSession(); setSession(null); }, []);

  const value = useMemo(() => ({ session, checking, login, logout }), [session, checking, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}