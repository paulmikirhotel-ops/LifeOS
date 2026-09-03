import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { useAuth } from './AuthContext.jsx';
import api from '../api/client.js';

const TenantContext = createContext();

export function TenantProvider({ children }) {
  const { memberships, refreshMe } = useAuth();
  const [activeTenantId, setActiveTenantId] = useState(() => {
    return localStorage.getItem('activeTenantId');
  });

  const activeTenant = useMemo(() => {
    if (!activeTenantId || !memberships.length) return null;
    return memberships.find(m => m.tenantId === activeTenantId) || memberships[0];
  }, [activeTenantId, memberships]);

  useEffect(() => {
    if (!activeTenantId && memberships.length > 0) {
      const firstTenantId = memberships[0].tenantId;
      setActiveTenantId(firstTenantId);
      localStorage.setItem('activeTenantId', firstTenantId);
    } else if (activeTenantId && memberships.length > 0) {
      const exists = memberships.some(m => m.tenantId === activeTenantId);
      if (!exists) {
        const firstTenantId = memberships[0].tenantId;
        setActiveTenantId(firstTenantId);
        localStorage.setItem('activeTenantId', firstTenantId);
      }
    }
  }, [activeTenantId, memberships]);

  const switchTenant = async (tenantId) => {
    // Server operates on the active workspace — it re-verifies membership itself.
    const response = await api.post('/tenants/switch', { tenantId });
    if (response.success) {
      setActiveTenantId(tenantId);
      localStorage.setItem('activeTenantId', tenantId);
      await refreshMe();
    }
    return response;
  };

  const can = (permission) => {
    if (!activeTenant) return false;
    const perms = activeTenant.permissions || [];
    return perms.includes('*') || perms.includes(permission);
  };

  return (
    <TenantContext.Provider value={{ activeTenantId, activeTenant, switchTenant, can }}>
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = () => useContext(TenantContext);
