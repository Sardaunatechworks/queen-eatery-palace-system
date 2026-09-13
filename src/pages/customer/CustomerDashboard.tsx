import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { Utensils, Clock, User } from "lucide-react";

// Customer sub-pages (lazy-loaded for fast dashboard initialization)
const CustomerMenu = React.lazy(() => import("./CustomerMenu").then(m => ({ default: m.CustomerMenu })));
const CustomerOrders = React.lazy(() => import("./CustomerOrders").then(m => ({ default: m.CustomerOrders })));
const ProfileSettings = React.lazy(() => import("../shared/ProfileSettings").then(m => ({ default: m.ProfileSettings })));

const LoadingFallback = () => (
  <div className="h-64 w-full flex flex-col items-center justify-center">
    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
    <p className="text-xs font-black tracking-widest text-gray-400 uppercase animate-pulse">Loading Menu...</p>
  </div>
);

const customerNavigation = [
  { name: "Menu", path: "/customer/menu", icon: Utensils },
  { name: "My Orders", path: "/customer/orders", icon: Clock },
  { name: "Profile", path: "/customer/profile", icon: User },
];

export const CustomerDashboard: React.FC = () => {
  return (
    <DashboardLayout navigation={customerNavigation} title="Dashboard">
      <React.Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/customer/menu" replace />} />
          <Route path="/menu" element={<CustomerMenu />} />
          <Route path="/orders" element={<CustomerOrders />} />
          <Route path="/profile" element={<ProfileSettings />} />
        </Routes>
      </React.Suspense>
    </DashboardLayout>
  );
};
