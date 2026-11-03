import React, { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../api/client';

interface AuthUser { id: string; name: string; email: string; role: string; }
interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  logout: () => void;
  demoLogin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>(null!);
export const useAuth = () => useContext(AuthContext);

const STORAGE_KEY = 'shopright_admin_auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const stored = localStorage.getItem(STORAGE_KEY);
  const initial = stored ? JSON.parse(stored) as { user: AuthUser; token: string } : null;
  const [user, setUser] = useState<AuthUser | null>(initial?.user ?? null);
  const [token, setToken] = useState<string | null>(initial?.token ?? null);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.login(email, password);
    const authUser = data.user as unknown as AuthUser;
    setUser(authUser);
    setToken(data.accessToken);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: authUser, token: data.accessToken }));
  }, []);

  const googleLogin = useCallback(async (idToken: string) => {
    const data = await api.googleLogin(idToken);
    const authUser = data.user as unknown as AuthUser;
    setUser(authUser);
    setToken(data.accessToken);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: authUser, token: data.accessToken }));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const demoLogin = useCallback(() => login('admin@shopright.local', 'Password123!'), [login]);

  return (
    <AuthContext.Provider value={{ user, token, login, googleLogin, logout, demoLogin }}>
      {children}
    </AuthContext.Provider>
  );
}
