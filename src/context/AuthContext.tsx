import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient } from '../lib/apiClient';
import { useSSE } from '../hooks/useSSE';
import type { UserProfile, ApiResponse, UserRole, UserPermissions } from '../types';

export type { UserProfile, UserRole, UserPermissions };

interface AuthContextType {
  user: UserProfile | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  login: (profile: UserProfile) => void;
  isStaff: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  hasPermission: (permission: string) => boolean;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  login: () => {},
  isStaff: false,
  isAdmin: false,
  isSuperAdmin: false,
  hasPermission: () => false,
  refreshSession: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Authenticate user profile in state (tokens are managed in HttpOnly cookies)
  const login = useCallback((profile: UserProfile) => {
    setUser(profile);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout').catch(() => {});
    } finally {
      setUser(null);
    }
  }, []);

  // Initialize and restore auth state via HttpOnly cookie session
  const verifySession = useCallback(async () => {
    try {
      const response = await apiClient.get<ApiResponse<{ profile: UserProfile }>>('/auth/me');
      if (response.success && response.data?.profile) {
        setUser(response.data.profile);
      } else {
        setUser(null);
      }
    } catch (err: any) {
      // If throttled by rate limiter, retain current state and do not trigger refresh storm
      if (err?.status === 429) {
        return;
      }

      // If access cookie expired (401), attempt silent refresh
      try {
        const refreshRes = await apiClient.post<ApiResponse<{ profile: UserProfile }>>('/auth/refresh');
        if (refreshRes.success && refreshRes.data?.profile) {
          setUser(refreshRes.data.profile);
        } else {
          setUser(null);
        }
      } catch (refreshErr: any) {
        // Only clear user on actual 401 Unauthorized session expiration
        if (refreshErr?.status === 401 || err?.status === 401) {
          setUser(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  // Real-time SSE profile and permissions stream
  useSSE({
    endpoint: '/sse/profile',
    eventName: 'profile_update',
    enabled: !!user,
    fallbackIntervalMs: 15000,
    onMessage: (profileData: any) => {
      if (profileData && profileData.uid) {
        setUser((prev) => {
          if (!prev) return profileData;
          // Sync if permissions, role, status or photo changed
          if (
            JSON.stringify(prev.permissions) !== JSON.stringify(profileData.permissions) ||
            prev.role !== profileData.role ||
            prev.status !== profileData.status ||
            prev.name !== profileData.name
          ) {
            return { ...prev, ...profileData };
          }
          return prev;
        });
      }
    },
  });

  // Cross-tab synchronization via BroadcastChannel
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        channel = new BroadcastChannel('qep_auth_channel');
        channel.onmessage = (event) => {
          if (event.data?.type === 'PERMISSIONS_UPDATED' || event.data?.type === 'AUTH_STATE_CHANGED') {
            if (!event.data.userId || String(event.data.userId) === String(user?.uid)) {
              verifySession();
            }
          }
        };
      }
    } catch {
      // Ignore in unsupported environments
    }

    return () => {
      channel?.close();
    };
  }, [user?.uid, verifySession]);

  // Multi-tab sync & Page Visibility: re-verify session when tab becomes visible
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        verifySession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [verifySession]);

  // Poll account status periodically as safety net
  useEffect(() => {
    if (!user) return;

    const checkStatus = async () => {
      if (document.hidden) return;
      try {
        const response = await apiClient.get<ApiResponse<{ profile: UserProfile }>>('/auth/me');
        if (response.success && response.data?.profile) {
          const fresh = response.data.profile;
          setUser((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(fresh)) return prev;
            return fresh;
          });
        }
      } catch (err: any) {
        // ONLY sign out if explicitly 401 Unauthorized (session revoked or suspended)
        if (err?.status === 401) {
          await signOut();
        }
      }
    };

    const interval = setInterval(checkStatus, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, [user, signOut]);

  const isStaff = !!user && ['super_admin', 'admin', 'cashier', 'kitchen'].includes(user.role);
  const isAdmin = !!user && ['super_admin', 'admin'].includes(user.role);
  const isSuperAdmin = !!user && user.role === 'super_admin';

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      if (user.role === 'super_admin' || user.role === 'admin') return true;
      if (!user.permissions) return false;

      // Direct check
      if (user.permissions[permission] !== undefined) {
        return !!user.permissions[permission];
      }

      // Check common alias translations
      const aliases: Record<string, string[]> = {
        manageOrders: ['orders.view', 'orders.create', 'orders.update_status'],
        manageInventory: ['inventory.view', 'inventory.adjust'],
        manageMenu: ['menu.view', 'menu.create', 'menu.edit'],
        manageReports: ['reports.view', 'reports.export'],
        manageCMS: ['cms.view', 'cms.edit'],
        manageNotifications: ['notifications.view', 'notifications.manage'],
        manageStaff: ['staff.view', 'staff.manage_permissions'],
        viewDashboard: ['reports.view', 'orders.view', 'dashboard.view'],
      };

      if (aliases[permission]) {
        return aliases[permission].some((k) => !!user.permissions[k]);
      }

      return false;
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile: user,
        loading,
        signOut,
        login,
        isStaff,
        isAdmin,
        isSuperAdmin,
        hasPermission,
        refreshSession: verifySession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
