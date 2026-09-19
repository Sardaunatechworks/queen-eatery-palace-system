import React, { useState, useEffect, useMemo, useCallback } from "react";
import { apiClient } from "../../services/apiClient";
import { Order } from "../admin/OrdersView";
import { format, isToday } from "date-fns";
import { Search, Filter, Receipt, Clock, CheckCircle, XCircle, Timer, AlertCircle, TrendingUp, ShoppingBag, CreditCard, Box, Printer } from "lucide-react";
import { formatNaira } from "../../utils/format";
import { useUI } from "../../context/UIContext";
import { useVisibilityPolling } from "../../hooks/useVisibilityPolling";
import { cn } from "../../utils/cn";
import { ReceiptModal } from "../../components/ReceiptModal";

export const CashierTransactions: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<any>(null);
  const { showToast, setLoading: setGlobalLoading } = useUI();

  const fetchOrders = async () => {
    try {
      const response = await apiClient.get("/orders");
      if (response.success && response.data) {
        const mapped = response.data.map((order: any) => ({
          ...order,
          id: order.id,
          orderId: order.order_number,
          total: order.total_amount,
          deliveryType: order.order_type || 'takeaway',
          address: order.delivery_address,
          paymentStatus: order.payment_status,
          createdAt: {
            toDate: () => new Date(order.created_at.replace(/-/g, "/")),
            toMillis: () => new Date(order.created_at.replace(/-/g, "/")).getTime()
          }
        }));
        setOrders(mapped);
      }
    } catch (e: any) {
      showToast(e.message || "Failed to load transactions", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  useVisibilityPolling(fetchOrders, 10000);

  const eodReport = useMemo(() => {
    const todayOrders = orders.filter(o => o.createdAt?.toDate && isToday(o.createdAt.toDate()));
    
    return {
      totalSales: todayOrders.reduce((sum, o) => o.paymentStatus === 'paid' ? sum + o.total : sum, 0),
      orderCount: todayOrders.length,
      completedCount: todayOrders.filter(o => o.status === 'completed').length,
      pendingPayments: todayOrders.reduce((sum, o) => o.paymentStatus !== 'paid' ? sum + o.total : sum, 0),
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const matchesSearch = 
        (order.orderId?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
        String(order.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.customerName?.toLowerCase() || "").includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [orders, statusFilter, searchTerm]);

  const updateStatus = async (id: string | number, newStatus: string) => {
    setGlobalLoading(true);
    try {
      const response = await apiClient.patch(`/orders/${id}/status`, { status: newStatus });
      if (response.success) {
        showToast(`Status updated: ${newStatus}`, "success");
        fetchOrders();
      } else {
        showToast(response.message || "Failed to update status", "error");
      }
    } catch (error: any) {
      showToast(error.message || "Failed to update status", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  if (loading) return (
    <div className="h-64 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8 pb-10">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-green-50 text-green-600 rounded-xl">
              <TrendingUp size={20} />
            </div>
            <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full uppercase tracking-tight">Today</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Today's Sales</p>
            <h3 className="text-xl font-bold text-dark">{formatNaira(eodReport.totalSales)}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <ShoppingBag size={20} />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Orders</p>
            <h3 className="text-xl font-bold text-dark">{eodReport.orderCount}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
              <Box size={20} />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Completed Orders</p>
            <h3 className="text-xl font-bold text-dark">{eodReport.completedCount}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <CreditCard size={20} />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pending Payments</p>
            <h3 className="text-xl font-bold text-dark">{formatNaira(eodReport.pendingPayments)}</h3>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search Order ID, Table or Customer..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-xs font-semibold"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <select 
            className="pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-xs font-semibold appearance-none min-w-[140px]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="received">Received</option>
            <option value="preparing">Preparing</option>
            <option value="ready">Ready</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">
                <th className="px-6 py-4">Order ID</th>
                <th className="px-6 py-4">Time</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Items</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Payment</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-xs font-bold text-gray-600">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center opacity-40">
                     <Receipt className="mx-auto mb-2 text-gray-300" size={32} />
                     <p>No transactions found</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50/20 transition-all">
                    <td className="px-6 py-4 font-mono font-bold text-dark">{order.orderId || String(order.id).slice(0, 8)}</td>
                    <td className="px-6 py-4 font-normal text-gray-400">
                      {order.createdAt?.toDate ? format(order.createdAt.toDate(), "hh:mm a") : "N/A"}
                    </td>
                    <td className="px-6 py-4 text-dark">{order.customerName || "Counter Customer"}</td>
                    <td className="px-6 py-4">
                       <span className="text-[10px] font-bold bg-gray-50 border px-2.5 py-1 rounded-lg">
                         {order.items?.length || 0} items
                       </span>
                    </td>
                    <td className="px-6 py-4 text-primary font-bold">{formatNaira(order.total)}</td>
                    <td className="px-6 py-4">
                       <span className={cn(
                         "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded",
                         order.paymentStatus === 'paid' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
                       )}>
                         {order.paymentStatus}
                       </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                       <span className={cn(
                         "text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-xl border shadow-sm",
                         order.status === 'completed' ? 'bg-green-50 text-green-600 border-green-100' :
                         order.status === 'ready' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                         order.status === 'preparing' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                         order.status === 'cancelled' ? 'bg-red-50 text-red-600 border-red-100' :
                         'bg-gray-50 text-gray-400 border-gray-100'
                       )}>
                         {order.status}
                       </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedReceiptOrder(order)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-[10px] font-bold text-stone-700 hover:bg-[#8B1E1E] hover:text-white hover:border-[#8B1E1E] transition-all shadow-xs"
                            title="Print or reprint receipt for this transaction"
                          >
                             <Printer size={12} />
                             <span>Print</span>
                          </button>
                          <div className="relative group inline-block">
                             <button className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-gray-100 transition-all">
                                Status
                             </button>
                             <div className="absolute right-0 bottom-full mb-2 w-32 bg-white rounded-xl shadow-xl border border-gray-150 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none group-hover:pointer-events-auto">
                                {["received", "preparing", "ready", "completed", "cancelled"].map((s) => (
                                  <button 
                                    key={s}
                                    onClick={() => updateStatus(order.id, s)}
                                    className="w-full text-left px-3.5 py-2 text-[10px] font-bold text-gray-500 hover:bg-gray-50 hover:text-primary capitalize transition-colors"
                                  >
                                    {s}
                                  </button>
                                ))}
                             </div>
                          </div>
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedReceiptOrder && (
        <ReceiptModal
          isOpen={Boolean(selectedReceiptOrder)}
          mode="cashier"
          order={selectedReceiptOrder}
          onClose={() => setSelectedReceiptOrder(null)}
        />
      )}
    </div>
  );
};
