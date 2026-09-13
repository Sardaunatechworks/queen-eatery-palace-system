import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { Users, User, UtensilsCrossed, Receipt, BarChart3, LayoutDashboard, FileText, ShieldAlert, Calendar, QrCode, Boxes } from "lucide-react";
import { useAuth, UserPermissions } from "../../context/AuthContext";
import { ErrorBoundary } from "../../components/ui";

// Admin sub-pages (lazy loaded for optimal code splitting)
const AdminOverview = React.lazy(() => import("./AdminOverview").then(m => ({ default: m.AdminOverview })));
const StaffManagement = React.lazy(() => import("./StaffManagement").then(m => ({ default: m.StaffManagement })));
const MenuManagement = React.lazy(() => import("./MenuManagement").then(m => ({ default: m.MenuManagement })));
const InventoryManagement = React.lazy(() => import("./InventoryManagement").then(m => ({ default: m.InventoryManagement })));
const TableManagement = React.lazy(() => import("./TableManagement").then(m => ({ default: m.TableManagement })));
const OrdersView = React.lazy(() => import("./OrdersView").then(m => ({ default: m.OrdersView })));
const Reports = React.lazy(() => import("./Reports").then(m => ({ default: m.Reports })));
const CMSManagement = React.lazy(() => import("./CMSManagement").then(m => ({ default: m.CMSManagement })));
const EventHallManagement = React.lazy(() => import("./EventHallManagement").then(m => ({ default: m.EventHallManagement })));
const ProfileSettings = React.lazy(() => import("../shared/ProfileSettings").then(m => ({ default: m.ProfileSettings })));

const LoadingFallback = () => (
  <div className="h-64 w-full flex flex-col items-center justify-center">
    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
    <p className="text-xs font-black tracking-widest text-gray-400 uppercase animate-pulse">Loading Module...</p>
  </div>
);

const hasPermission = (profile: any, permissionKey: string | number) => {
  if (!profile) return false;
  if (profile.role === "super_admin" || profile.role === "admin") return true;
  if (profile.permissions) {
    if (Array.isArray(profile.permissions)) {
      return profile.permissions.includes(permissionKey);
    }
    return !!profile.permissions[permissionKey];
  }
  return false;
};

const AccessDenied = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-white/80 backdrop-blur-md border border-red-100 rounded-2xl p-8 max-w-md w-full text-center shadow-xl shadow-red-500/5 transition-all hover:shadow-red-500/10">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 animate-pulse">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-dark mb-2">Access Denied</h2>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          You do not have the required permissions to access this administrative module. Please contact your system administrator if you believe this is an error.
        </p>
        <button
          onClick={() => window.history.back()}
          className="w-full bg-dark text-white hover:bg-dark/90 text-sm font-semibold py-3 px-6 rounded-xl transition-all shadow-md active:scale-95"
        >
          Go Back
        </button>
      </div>
    </div>
  );
};

const PermissionRoute = ({ permissionKey, children }: { permissionKey: string | number; children: React.ReactNode }) => {
  const { profile } = useAuth();
  if (hasPermission(profile, permissionKey)) {
    return <>{children}</>;
  }
  return <AccessDenied />;
};

const AdminRootRedirect = () => {
  const { profile } = useAuth();
  if (!profile) return <Navigate to="/login" replace />;

  if (profile.role === "super_admin" || profile.role === "admin") {
    return <Navigate to="/admin/overview" replace />;
  }

  switch (profile.role) {
    case "cashier": return <Navigate to="/pos" replace />;
    case "kitchen": return <Navigate to="/kitchen" replace />;
    case "customer": return <Navigate to="/my-orders" replace />;
    default: return <Navigate to="/" replace />;
  }
};

const adminNavigation = [
  { name: "Overview", path: "/admin/overview", icon: LayoutDashboard, permission: "viewDashboard" as keyof UserPermissions },
  { name: "Staff Management", path: "/admin/staff", icon: Users, permission: "manageStaff" as keyof UserPermissions },
  { name: "Menu", path: "/admin/menu", icon: UtensilsCrossed, permission: "manageMenu" as keyof UserPermissions },
  { name: "Inventory", path: "/admin/inventory", icon: Boxes, permission: "manageMenu" as keyof UserPermissions },
  { name: "Tables & QR", path: "/admin/tables", icon: QrCode, permission: "manageOrders" as keyof UserPermissions },
  { name: "Orders", path: "/admin/orders", icon: Receipt, permission: "manageOrders" as keyof UserPermissions },
  { name: "Reports", path: "/admin/reports", icon: BarChart3, permission: "manageReports" as keyof UserPermissions },
  { name: "CMS Management", path: "/admin/cms", icon: FileText, permission: "manageCMS" as keyof UserPermissions },
  { name: "Event Hall", path: "/admin/event-hall", icon: Calendar, permission: "manageCMS" as keyof UserPermissions },
  { name: "Profile", path: "/admin/profile", icon: User, permission: "viewDashboard" as keyof UserPermissions },
];

export const AdminDashboard: React.FC = () => {
  const { profile } = useAuth();

  const filteredNavigation = adminNavigation.filter(item => 
    item.path === "/admin/profile" ? true : hasPermission(profile, item.permission)
  );

  return (
    <DashboardLayout navigation={filteredNavigation} title="Admin Portal">
      <ErrorBoundary title="Admin Portal Error">
        <React.Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<AdminRootRedirect />} />
            <Route path="/overview" element={<PermissionRoute permissionKey="viewDashboard"><AdminOverview /></PermissionRoute>} />
            <Route path="/staff" element={<PermissionRoute permissionKey="manageStaff"><StaffManagement /></PermissionRoute>} />
            <Route path="/menu" element={<PermissionRoute permissionKey="manageMenu"><MenuManagement /></PermissionRoute>} />
            <Route path="/inventory" element={<PermissionRoute permissionKey="manageMenu"><InventoryManagement /></PermissionRoute>} />
            <Route path="/tables" element={<PermissionRoute permissionKey="manageOrders"><TableManagement /></PermissionRoute>} />
            <Route path="/orders" element={<PermissionRoute permissionKey="manageOrders"><OrdersView /></PermissionRoute>} />
            <Route path="/reports" element={<PermissionRoute permissionKey="manageReports"><Reports /></PermissionRoute>} />
            <Route path="/cms" element={<PermissionRoute permissionKey="manageCMS"><CMSManagement /></PermissionRoute>} />
            <Route path="/event-hall" element={<PermissionRoute permissionKey="manageCMS"><EventHallManagement /></PermissionRoute>} />
            <Route path="/profile" element={<ProfileSettings />} />
          </Routes>
        </React.Suspense>
      </ErrorBoundary>
    </DashboardLayout>
  );
};
