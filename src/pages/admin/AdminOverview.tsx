import React, { useState, useEffect, useCallback } from "react";
import { getAdminDashboard, getDashboardOverview, getSalesReport, getTransactionLedger } from "../../services/reportService";
import { getActiveOrders } from "../../services/orderService";
import type { DashboardOverviewData, SalesReportData, Transaction } from "../../types";
import { formatNaira } from "../../utils/format";
import { useVisibilityPolling } from "../../hooks/useVisibilityPolling";
import { StatCard, Badge } from "../../components/ui";
import { 
  ArrowRight,
  Package,
  Clock,
  UtensilsCrossed,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const AdminOverview: React.FC = () => {
  const [stats, setStats] = useState<DashboardOverviewData>({
    totalSales: 0,
    totalOrders: 0,
    totalCustomers: 0,
    activeOrders: 0,
    todaySales: 0,
    todayOrders: 0,
    lowStockCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState<{ date: string; sales: number }[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const fetchStats = useCallback(async () => {
    try {
      // 1 single unified summary endpoint replaces 4 waterfall requests
      const res = await getAdminDashboard();
      if (res.success && res.data) {
        const d = res.data;
        if (d.overview) setStats(d.overview);
        if (d.salesTrend) {
          setSalesData(d.salesTrend.map((t: any) => ({
            date: new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            sales: t.total_sales || 0,
          })));
        }
        if (d.activeOrders) setRecentOrders(d.activeOrders.slice(0, 6));
        if (d.transactions) setTransactions(d.transactions.slice(0, 5));
        return;
      }

      // Fallback in case of unexpected format
      const [overviewRes, salesRes, ordersRes, txRes] = await Promise.allSettled([
        getDashboardOverview(),
        getSalesReport({ period: 'week' }),
        getActiveOrders(),
        getTransactionLedger({ per_page: 5 }),
      ]);

      if (overviewRes.status === 'fulfilled' && overviewRes.value.success && overviewRes.value.data) {
        setStats(overviewRes.value.data);
      }
      if (salesRes.status === 'fulfilled' && salesRes.value.success && salesRes.value.data) {
        const trend = (salesRes.value.data as SalesReportData).sales_trend || [];
        setSalesData(trend.map((t: any) => ({
          date: new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          sales: t.total_sales || 0,
        })));
      }
      if (ordersRes.status === 'fulfilled') {
        const orders = Array.isArray(ordersRes.value) ? ordersRes.value : [];
        setRecentOrders(orders.slice(0, 6));
      }
      if (txRes.status === 'fulfilled' && txRes.value.success) {
        const txData = Array.isArray(txRes.value.data) ? txRes.value.data : [];
        setTransactions(txData.slice(0, 5));
      }
    } catch (error) {
      console.error("Failed to load overview stats", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useVisibilityPolling(fetchStats, 30000);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
      case 'paid':
        return <Badge variant="success" size="sm">Completed</Badge>;
      case 'preparing':
        return <Badge variant="info" size="sm">Preparing</Badge>;
      case 'ready':
        return <Badge variant="gold" size="sm">Ready</Badge>;
      case 'received':
      case 'pending':
        return <Badge variant="warning" size="sm">Pending</Badge>;
      case 'cancelled':
        return <Badge variant="error" size="sm">Cancelled</Badge>;
      default:
        return <Badge variant="default" size="sm">{status}</Badge>;
    }
  };

  if (loading) return (
    <div className="h-64 flex flex-col items-center justify-center gap-2">
      <div className="w-8 h-8 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin" />
      <span className="text-xs text-stone-500">Loading overview...</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ===== Pending Menu Approvals Alert Banner ===== */}
      {Boolean((stats.pendingMenuCount ?? stats.pending_menu_count ?? 0) > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-800 flex items-center justify-center shrink-0">
              <UtensilsCrossed size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-stone-900">
                  {(stats.pendingMenuCount ?? stats.pending_menu_count)} Dish Proposal{((stats.pendingMenuCount ?? stats.pending_menu_count) ?? 1) > 1 ? "s" : ""} Awaiting Review
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-stone-600 mt-0.5">
                Kitchen staff have proposed new dishes that require administrator review and approval before publishing to customers.
              </p>
            </div>
          </div>
          <Link
            to="/admin/menu?tab=pending"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors shadow-xs no-underline"
          >
            Review & Accept Proposals
            <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* ===== Metrics Row ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/admin/reports" className="no-underline block">
          <StatCard 
            label="Sales Today"
            value={formatNaira(stats.todaySales || stats.totalSales)}
            change={stats.todaySales ? `+${formatNaira(stats.todaySales)}` : undefined}
            trend="up"
            subtext="today"
          />
        </Link>
        <Link to="/admin/orders" className="no-underline block">
          <StatCard 
            label="Orders Today"
            value={(stats.todayOrders || stats.totalOrders).toString()}
            subtext={`${stats.totalOrders} all-time`}
          />
        </Link>
        <Link to="/admin/orders" className="no-underline block">
          <StatCard 
            label="Pending Orders"
            value={stats.activeOrders.toString()}
            subtext={stats.activeOrders > 0 ? "Needs preparation" : "Kitchen clear"}
            trend={stats.activeOrders > 0 ? "down" : "neutral"}
          />
        </Link>
        <Link to="/admin/menu" className="no-underline block">
          <StatCard 
            label="Low Stock Items"
            value={(stats.lowStockCount ?? 0).toString()}
            subtext={(stats.lowStockCount ?? 0) > 0 ? "Requires restock" : "Optimal"}
            trend={(stats.lowStockCount ?? 0) > 0 ? "down" : "neutral"}
          />
        </Link>
      </div>

      {/* ===== Sales Overview Chart + Recent Orders ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Sales Overview */}
        <div className="lg:col-span-3 bg-white rounded-lg border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-stone-900 leading-tight">Sales Overview</h2>
              <p className="text-xs text-stone-500 mt-0.5">7-day performance trend</p>
            </div>
            <Link to="/admin/reports" className="text-xs font-medium text-[#8B1E1E] hover:underline flex items-center gap-1 no-underline">
              Full Report <ArrowRight size={13} />
            </Link>
          </div>

          <div className="h-[220px]">
            {salesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B1E1E" stopOpacity={0.12}/>
                      <stop offset="95%" stopColor="#8B1E1E" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11, fill: '#78716C' }} 
                    axisLine={{ stroke: '#E7E5E4' }}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: '#78716C' }} 
                    axisLine={false} 
                    tickLine={false}
                    tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      background: '#fff', 
                      border: '1px solid #E7E5E4', 
                      borderRadius: '6px', 
                      fontSize: '12px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                    }} 
                    formatter={(value: number) => [formatNaira(value), 'Sales']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="sales" 
                    stroke="#8B1E1E" 
                    strokeWidth={1.5}
                    fill="url(#salesGradient)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-stone-400">
                No recent sales data recorded
              </div>
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-stone-200 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-stone-900 leading-tight">Recent Orders</h2>
              <Link to="/admin/orders" className="text-xs font-medium text-[#8B1E1E] hover:underline no-underline">
                View All
              </Link>
            </div>

            <div className="divide-y divide-stone-100">
              {recentOrders.length > 0 ? recentOrders.map((order, i) => (
                <div key={order.id || i} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-stone-800 truncate">
                      #{order.order_number || order.orderId || order.id}
                    </p>
                    <p className="text-[11px] text-stone-400 truncate">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-xs font-medium text-stone-900">
                      {formatNaira(order.total_amount || order.total || 0)}
                    </span>
                    {getStatusBadge(order.status)}
                  </div>
                </div>
              )) : (
                <p className="text-xs text-stone-400 py-8 text-center">No recent orders</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Low Stock Alert & Recent Transactions ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Low Stock Items Panel */}
        <div className="bg-white rounded-lg border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-stone-500" />
              <h2 className="text-base font-semibold text-stone-900 leading-tight">Stock Attention</h2>
            </div>
            <Link to="/admin/menu" className="text-xs font-medium text-[#8B1E1E] hover:underline flex items-center gap-1 no-underline">
              Manage Menu <ArrowRight size={13} />
            </Link>
          </div>

          {(stats.lowStockCount ?? 0) > 0 ? (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-900">
                  {stats.lowStockCount} items are at or below minimum threshold
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Adjust portions or reorder ingredients to maintain service.
                </p>
              </div>
              <Link 
                to="/admin/menu"
                className="px-3 py-1.5 bg-amber-600 text-white rounded-md text-xs font-medium hover:bg-amber-700 no-underline shrink-0"
              >
                Review Stock
              </Link>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-stone-400">
              All menu item portions are adequately stocked.
            </div>
          )}
        </div>

        {/* Recent Transactions Panel */}
        <div className="bg-white rounded-lg border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-stone-500" />
              <h2 className="text-base font-semibold text-stone-900 leading-tight">Recent Transactions</h2>
            </div>
            <Link to="/admin/reports" className="text-xs font-medium text-[#8B1E1E] hover:underline flex items-center gap-1 no-underline">
              Ledger <ArrowRight size={13} />
            </Link>
          </div>

          <div className="divide-y divide-stone-100">
            {transactions.length > 0 ? transactions.map((tx: any, i) => (
              <div key={tx.id || i} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <span className="font-medium text-stone-800 block">
                    {tx.reference || `TX-#${tx.id}`}
                  </span>
                  <span className="text-[11px] text-stone-400 capitalize">
                    {tx.payment_method === 'cash' ? 'Cash' : tx.payment_method === 'paystack' ? 'Paystack' : tx.payment_method || 'Payment'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-medium text-stone-900 block">
                    {formatNaira(tx.amount || 0)}
                  </span>
                  <span className={`text-[10px] uppercase font-medium ${tx.status === 'completed' ? 'text-emerald-700' : 'text-stone-400'}`}>
                    {tx.status}
                  </span>
                </div>
              </div>
            )) : (
              <p className="text-xs text-stone-400 py-6 text-center">No recent transactions</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
