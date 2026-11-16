import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserDto, Role } from '@shopright/shared-types';
import { apiRequest } from '../api/client';

interface AuthContextType {
  user: UserDto | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (name: string, email: string, phone: string, password: string) => Promise<void>;
  logout: () => void;
  quickDemoLogin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('shopright_customer_token')
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function checkCurrentUser() {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const profile = await apiRequest<UserDto>('/auth/me');
        setUser(profile);
      } catch (err) {
        console.error('Session expired or invalid:', err);
        localStorage.removeItem('shopright_customer_token');
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    checkCurrentUser();
  }, [token]);

  async function login(email: string, password: string) {
    const res = await apiRequest<{ accessToken: string; refreshToken: string; user: UserDto }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    );
    localStorage.setItem('shopright_customer_token', res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
  }

  async function loginWithGoogle(idToken: string) {
    const res = await apiRequest<{ accessToken: string; refreshToken: string; user: UserDto }>(
      '/auth/google',
      {
        method: 'POST',
        body: JSON.stringify({ idToken, role: Role.CUSTOMER }),
      }
    );
    localStorage.setItem('shopright_customer_token', res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
  }

  async function register(name: string, email: string, phone: string, password: string) {
    const res = await apiRequest<{ accessToken: string; refreshToken: string; user: UserDto }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ name, email, phone, password, role: Role.CUSTOMER }),
      }
    );
    localStorage.setItem('shopright_customer_token', res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
  }

  function logout() {
    localStorage.removeItem('shopright_customer_token');
    setToken(null);
    setUser(null);
  }

  async function quickDemoLogin() {
    await login('customer@shopright.local', 'Password123!');
  }

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, loginWithGoogle, register, logout, quickDemoLogin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
