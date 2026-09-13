import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { DashboardLayout } from '../components/layout/DashboardLayout';

// Auth Pages (V2)
const LoginPage = lazy(() =>
  import('../modules/auth/pages/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const SignupPage = lazy(() =>
  import('../modules/auth/pages/SignupPage').then((m) => ({ default: m.SignupPage }))
);
const ForgotPasswordPage = lazy(() =>
  import('../modules/auth/pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage }))
);
const ResetPasswordPage = lazy(() =>
  import('../modules/auth/pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage }))
);

// Fallbacks / Existing V1 components to preserve continuity during milestone progression
const Landing = lazy(() =>
  import('../pages/Landing').then((m) => ({ default: m.Landing }))
);
const MenuPage = lazy(() =>
  import('../pages/MenuPage').then((m) => ({ default: m.MenuPage }))
);
const AdminDashboard = lazy(() =>
  import('../pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const CashierPOS = lazy(() =>
  import('../pages/cashier/CashierPOS').then((m) => ({ default: m.CashierPOS }))
);
const KitchenScreen = lazy(() =>
  import('../pages/kitchen/KitchenScreen').then((m) => ({ default: m.KitchenScreen }))
);
const CustomerDashboard = lazy(() =>
  import('../pages/customer/CustomerDashboard').then((m) => ({ default: m.CustomerDashboard }))
);

// Guest QR Table Ordering Module (Anonymous & Hidden)
const GuestMenuPage = lazy(() =>
  import('../pages/qr/GuestMenuPage').then((m) => ({ default: m.GuestMenuPage }))
);
const GuestOrderTrackingPage = lazy(() =>
  import('../pages/qr/GuestOrderTrackingPage').then((m) => ({ default: m.GuestOrderTrackingPage }))
);

import { useAuth } from '../context/AuthContext';
import queenLogo from '../assets/queen-logo.png';

const RouteLoading: React.FC = () => (
  <div className="h-screen w-screen flex flex-col items-center justify-center bg-[var(--color-background)]">
    <img src={queenLogo} alt="Queen's Palace" className="w-16 h-16 object-contain mb-4 animate-pulse drop-shadow-sm" />
    <div className="w-8 h-8 border-3 border-[var(--color-brand-red)] border-t-transparent rounded-full animate-spin mb-3" />
    <p className="text-[var(--text-xs)] font-semibold uppercase tracking-widest text-[var(--color-text-secondary)]">
      Queen's Palace Eatery
    </p>
  </div>
);

const DashboardRedirect: React.FC = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'super_admin' || user.role === 'admin') return <Navigate to="/admin/overview" replace />;
  if (user.role === 'cashier') return <Navigate to="/cashier/terminal" replace />;
  if (user.role === 'kitchen') return <Navigate to="/kitchen/dashboard" replace />;
  return <Navigate to="/customer/menu" replace />;
};

export const AppRouter: React.FC = () => {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        {/* Public Website */}
        <Route path="/" element={<Landing />} />
        <Route path="/menu" element={<MenuPage />} />

        {/* Guest QR Table Ordering (Anonymous & Hidden) */}
        <Route path="/q/:tableToken" element={<GuestMenuPage />} />
        <Route path="/q/track/:guestToken" element={<GuestOrderTrackingPage />} />

        {/* Authentication */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Universal Dashboard Gateway */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardRedirect />
            </ProtectedRoute>
          }
        />

        {/* Admin Portal */}
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* POS / Cashier Portal */}
        <Route
          path="/cashier/*"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'admin', 'cashier']}>
              <CashierPOS />
            </ProtectedRoute>
          }
        />
        <Route path="/pos/*" element={<Navigate to="/cashier/terminal" replace />} />
        <Route path="/pos" element={<Navigate to="/cashier/terminal" replace />} />

        {/* Kitchen Queue */}
        <Route
          path="/kitchen/*"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'admin', 'kitchen']}>
              <KitchenScreen />
            </ProtectedRoute>
          }
        />

        {/* Customer Portal */}
        <Route
          path="/customer/*"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <CustomerDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/my-orders" element={<Navigate to="/customer/orders" replace />} />
        <Route path="/my-orders/*" element={<Navigate to="/customer/orders" replace />} />

        {/* Direct Shortcuts for Top-Level Navigation */}
        <Route path="/overview" element={<Navigate to="/admin/overview" replace />} />
        <Route path="/staff" element={<Navigate to="/admin/staff" replace />} />
        <Route path="/tables" element={<Navigate to="/admin/tables" replace />} />
        <Route path="/reports" element={<Navigate to="/admin/reports" replace />} />
        <Route path="/inventory" element={<Navigate to="/admin/menu" replace />} />
        <Route path="/orders" element={<Navigate to="/admin/orders" replace />} />
        <Route path="/cms" element={<Navigate to="/admin/cms" replace />} />
        <Route path="/event-hall" element={<Navigate to="/admin/event-hall" replace />} />
        <Route path="/profile" element={<Navigate to="/admin/profile" replace />} />

        {/* 404 Catch-All */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};
