'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { login as apiLogin, registerAccount, getMe, getToken, setToken, clearToken, type AuthUser } from './api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkSession() {
      const token = getToken();
      if (!token) { setLoading(false); return; }
      try {
        const { user } = await getMe();
        setUser(user);
      } catch {
        clearToken();
      } finally {
        setLoading(false);
      }
    }
    checkSession();

    // Fired by lib/api.ts whenever a request comes back 401 (expired/invalid session)
    function onUnauthorized() { setUser(null); }
    window.addEventListener('foodaudit:unauthorized', onUnauthorized);
    return () => window.removeEventListener('foodaudit:unauthorized', onUnauthorized);
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    try {
      const { token, user } = await apiLogin(email, password);
      setToken(token);
      setUser(user);
    } catch (e: any) {
      setError(e.message || 'Failed to sign in');
      throw e;
    }
  }

  async function register(name: string, email: string, password: string) {
    setError(null);
    try {
      const { token, user } = await registerAccount(name, email, password);
      setToken(token);
      setUser(user);
    } catch (e: any) {
      setError(e.message || 'Failed to create account');
      throw e;
    }
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
