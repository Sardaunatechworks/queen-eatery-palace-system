import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requiredPermission?: string;
  requireStaff?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  requiredPermission,
  requireStaff = false,
}) => {
  const { user, loading, isStaff, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-3 border-[var(--color-brand-red)] border-t-transparent animate-spin" />
          <p className="text-[var(--text-sm)] text-[var(--color-text-muted)] font-medium">
            Authenticating session...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireStaff && !isStaff) {
    return <Navigate to="/dashboard" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // Redirect based on role
    switch (user.role) {
      case 'super_admin':
      case 'admin':
        return <Navigate to="/admin/overview" replace />;
      case 'cashier':
        return <Navigate to="/cashier/terminal" replace />;
      case 'kitchen':
        return <Navigate to="/kitchen/dashboard" replace />;
      case 'customer':
      default:
        return <Navigate to="/customer/menu" replace />;
    }
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/admin/overview" replace />;
  }

  return <>{children}</>;
};
