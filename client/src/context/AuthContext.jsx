import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [loading, setLoading] = useState(!!localStorage.getItem('token'));

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/auth/me')
        .then(data => {
          setUser(data.user);
          setOnboardingComplete(data.onboardingComplete);
        })
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
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

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
