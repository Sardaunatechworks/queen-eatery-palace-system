import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { Calculator, Receipt, User, ShoppingBag } from "lucide-react";

// Cashier sub-pages (lazy-loaded for fast dashboard initialization)
const CashierTerminal = React.lazy(() => import("./CashierTerminal").then(m => ({ default: m.CashierTerminal })));
const CashierTransactions = React.lazy(() => import("./CashierTransactions").then(m => ({ default: m.CashierTransactions })));
const OrdersView = React.lazy(() => import("../admin/OrdersView").then(m => ({ default: m.OrdersView })));
const ProfileSettings = React.lazy(() => import("../shared/ProfileSettings").then(m => ({ default: m.ProfileSettings })));

const LoadingFallback = () => (
  <div className="h-64 w-full flex flex-col items-center justify-center">
    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
    <p className="text-xs font-black tracking-widest text-gray-400 uppercase animate-pulse">Loading Terminal...</p>
  </div>
);

const cashierNavigation = [
  { name: "POS Terminal", path: "/cashier/terminal", icon: Calculator },
  { name: "Orders", path: "/cashier/orders", icon: ShoppingBag },
  { name: "Transactions", path: "/cashier/transactions", icon: Receipt },
  { name: "Profile", path: "/cashier/profile", icon: User },
];

export const CashierPOS: React.FC = () => {
  return (
    <DashboardLayout navigation={cashierNavigation} title="Cashier Portal">
      <React.Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="terminal" replace />} />
          <Route path="/terminal" element={<CashierTerminal />} />
          <Route path="/orders" element={<OrdersView />} />
          <Route path="/transactions" element={<CashierTransactions />} />
          <Route path="/profile" element={<ProfileSettings />} />
        </Routes>
      </React.Suspense>
    </DashboardLayout>
  );
};
