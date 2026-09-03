import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const response = await api.get('/auth/me');
      if (response.success) {
        setUser(response.data.user);
        setMemberships(response.data.memberships || []);
        setPendingInvitations(response.data.pendingInvitations || []);
      }
    } catch (error) {
      setUser(null);
      setMemberships([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
    
    const handleUnauthorized = () => {
      setUser(null);
      setMemberships([]);
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [refreshMe]);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    if (response.success) {
      await refreshMe();
    }
    return response;
  };

  const register = async (data) => {
    const response = await api.post('/auth/register', data);
    if (response.success) {
      await refreshMe();
    }
    return response;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      setMemberships([]);
      localStorage.removeItem('activeTenantId');
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{ user, memberships, pendingInvitations, loading, login, register, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
