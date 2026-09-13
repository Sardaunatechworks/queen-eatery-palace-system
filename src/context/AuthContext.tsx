import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient } from '../lib/apiClient';
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
    } catch {
      // If access cookie expired, attempt silent refresh
      try {
        const refreshRes = await apiClient.post<ApiResponse<{ profile: UserProfile }>>('/auth/refresh');
        if (refreshRes.success && refreshRes.data?.profile) {
          setUser(refreshRes.data.profile);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

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

  // Poll account status every 30s to enforce server-side suspensions immediately
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
      } catch {
        // If suspended or session revoked, immediately clear frontend auth
        await signOut();
      }
    };

    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [user, signOut]);

  const isStaff = !!user && ['super_admin', 'admin', 'cashier', 'kitchen'].includes(user.role);
  const isAdmin = !!user && ['super_admin', 'admin'].includes(user.role);
  const isSuperAdmin = !!user && user.role === 'super_admin';

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      if (user.role === 'super_admin' || user.role === 'admin') return true;
      return !!user.permissions?.[permission];
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
