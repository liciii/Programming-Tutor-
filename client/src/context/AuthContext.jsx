import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

const DEV_MODE = true;
const DEV_USER = { id: 'dev-user', name: 'Test User', email: 'test@example.com' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (DEV_MODE) {
      // Skip auth in dev mode and go straight to app
      setUser(DEV_USER);
      setOnboardingComplete(true);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('token');
    if (token) {
      api.get('/auth/me')
        .then(data => {
          setUser(data.user);
          setOnboardingComplete(data.onboardingComplete);
        })
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    setOnboardingComplete(data.onboardingComplete);
    return data;
  };

  const register = async (name, email, password) => {
    const data = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    setOnboardingComplete(false);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setOnboardingComplete(false);
  };

  const completeOnboarding = () => setOnboardingComplete(true);

  return (
    <AuthContext.Provider value={{ user, onboardingComplete, loading, login, register, logout, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
