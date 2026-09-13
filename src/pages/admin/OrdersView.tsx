import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { formatNaira } from "../../utils/format";
import { useUI } from "../../context/UIContext";
import { useVisibilityPolling } from "../../hooks/useVisibilityPolling";
import { Receipt, Truck, ShoppingBag, Utensils, CheckCircle2, XCircle, CreditCard, Banknote } from "lucide-react";
import { OrderAcceptanceModal } from "../../components/OrderAcceptanceModal";
import { useAuth } from "../../context/AuthContext";
import type { Order } from "../../types";
import {
  getOrders,
  updateOrderStatus,
  deleteOrder,
  acceptOrder,
  rejectOrder,
  markOrderServed,
  recordOrderPayment,
} from "../../services/orderService";
import { PageHeader, SearchInput, Badge, ActionDropdown } from "../../components/ui";

// Re-export for compatibility with consumers
export type { Order };

export const OrdersView: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [sourceFilter, setSourceFilter] = useState<"all" | "online" | "pos" | "qr">("all");
  const [selectedPendingOrder, setSelectedPendingOrder] = useState<Order | null>(null);
  const { showToast, setLoading: setGlobalLoading } = useUI();
  const { profile } = useAuth();

  const canDelete = profile?.role === "super_admin" || profile?.role === "admin" || !!profile?.permissions?.manageReports;

  const fetchOrders = async () => {
    try {
      const result = await getOrders({ limit: 150 });
      setOrders(result.items || []);
    } catch (error: any) {
      showToast(error.message || "Error loading orders", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  useVisibilityPolling(fetchOrders, 12000);

  const handleDeleteOrder = async (id: number | string, orderId?: string) => {
    const displayId = orderId || String(id).slice(0, 8);
    if (!window.confirm(`Are you sure you want to permanently delete order ${displayId}? This action cannot be undone.`)) return;

    setGlobalLoading(true);
    try {
      await deleteOrder(Number(id));
      showToast(`Order ${displayId} deleted successfully`, "success");
      fetchOrders();
    } catch (error: any) {
      showToast(`Failed to delete order: ${error.message}`, "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleAccept = async (orderId: number) => {
    setGlobalLoading(true);
    try {
      await acceptOrder(orderId);
      showToast("Order accepted and sent to kitchen!", "success");
      fetchOrders();
    } catch (error: any) {
      showToast(error.message || "Failed to accept order", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleReject = async (orderId: number) => {
    const reason = prompt("Enter reason for rejection (optional):", "Item is currently sold out");
    if (reason === null) return;

    setGlobalLoading(true);
    try {
      await rejectOrder(orderId, reason || "Order could not be fulfilled.");
      showToast("Order rejected", "info");
      fetchOrders();
    } catch (error: any) {
      showToast(error.message || "Failed to reject order", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleServed = async (orderId: number) => {
    setGlobalLoading(true);
    try {
      await markOrderServed(orderId);
      showToast("Order marked as served to table!", "success");
      fetchOrders();
    } catch (error: any) {
      showToast(error.message || "Failed to mark order as served", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleRecordPayment = async (orderId: number) => {
    const method = prompt("Enter payment method: 'cash', 'pos', or 'transfer':", "cash");
    if (!method) return;
    const cleanMethod = method.toLowerCase().trim();
    if (!['cash', 'pos', 'transfer'].includes(cleanMethod)) {
      alert("Invalid payment method. Enter cash, pos, or transfer.");
      return;
    }

    setGlobalLoading(true);
    try {
      await recordOrderPayment(orderId, { payment_method: cleanMethod });
      showToast(`Payment recorded via ${cleanMethod.toUpperCase()}`, "success");
      fetchOrders();
    } catch (error: any) {
      showToast(error.message || "Failed to record payment", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const newOrdersCount = useMemo(() => {
    return orders.filter((o) => {
      const isOnline = o.source === "online_customer" || o.source === "customer";
      if (isOnline) {
        return (o.payment_status === "paid" || o.paymentStatus === "paid") && (o.order_status === "submitted" || o.order_status === "pending");
      }
      return o.order_status === "submitted" || o.status === "submitted";
    }).length;
  }, [orders]);

  const acceptedCount = useMemo(() => orders.filter((o) => (o.order_status || o.status) === "accepted").length, [orders]);
  const preparingCount = useMemo(() => orders.filter((o) => (o.order_status || o.status) === "preparing").length, [orders]);
  const readyCount = useMemo(() => orders.filter((o) => (o.order_status || o.status) === "ready").length, [orders]);
  const historyCount = useMemo(() => orders.filter((o) => ["completed", "cancelled", "rejected"].includes(o.order_status || o.status)).length, [orders]);
  const activeCount = useMemo(() => orders.filter((o) => {
    const s = o.order_status || o.status;
    const isOnline = o.source === "online_customer" || o.source === "customer";
    if (isOnline && (s === "submitted" || s === "pending")) {
      return o.payment_status === "paid" || o.paymentStatus === "paid";
    }
    return ["submitted", "accepted", "preparing", "ready", "served"].includes(s);
  }).length, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const displayId = order.orderId || String(order.id).slice(0, 8);
      const matchesSearch = displayId.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (order.customerName && order.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (order.table_number && order.table_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (order.guest_name && order.guest_name.toLowerCase().includes(searchTerm.toLowerCase()));

      let matchesSource = true;
      if (sourceFilter === "online") {
        matchesSource = order.source === "online_customer" || order.source === "customer";
      } else if (sourceFilter === "pos") {
        matchesSource = order.source === "cashier";
      } else if (sourceFilter === "qr") {
        matchesSource = order.source === "qr_guest" || Boolean(order.table_number);
      }

      let matchesStatus = true;
      const s = order.order_status || order.status;
      if (statusFilter === "active") {
        const isOnline = order.source === "online_customer" || order.source === "customer";
        if (isOnline && (s === "submitted" || s === "pending")) {
          matchesStatus = order.payment_status === "paid" || order.paymentStatus === "paid";
        } else {
          matchesStatus = ["submitted", "accepted", "preparing", "ready", "served"].includes(s);
        }
      } else if (statusFilter === "submitted") {
        const isOnline = order.source === "online_customer" || order.source === "customer";
        if (isOnline) {
          matchesStatus = (order.payment_status === "paid" || order.paymentStatus === "paid") && (s === "submitted" || s === "pending");
        } else {
          matchesStatus = s === "submitted";
        }
      } else if (statusFilter === "history") {
        matchesStatus = ["completed", "cancelled", "rejected"].includes(s);
      } else if (statusFilter !== "All") {
        matchesStatus = s === statusFilter;
      }

      return matchesSearch && matchesSource && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter, sourceFilter]);

  const updateStatus = async (id: number | string, newStatus: string) => {
    setGlobalLoading(true);
    try {
      await updateOrderStatus(Number(id), newStatus);
      showToast(`Order marked as ${newStatus}`, "success");
      fetchOrders();
    } catch (error: any) {
      showToast(error.message || "Failed to update status", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const renderStatusBadge = (status: Order["order_status"] | Order["status"]) => {
    switch (status) {
      case 'submitted': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">Needs Acceptance</span>;
      case 'accepted': return <Badge variant="info" size="sm">Accepted</Badge>;
      case 'preparing': return <Badge variant="info" size="sm">Preparing</Badge>;
      case 'ready': return <Badge variant="gold" size="sm">Ready</Badge>;
      case 'served': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">Served</span>;
      case 'completed': return <Badge variant="success" size="sm">Completed</Badge>;
      case 'rejected': return <Badge variant="error" size="sm">Rejected</Badge>;
      case 'cancelled': return <Badge variant="error" size="sm">Cancelled</Badge>;
      default: return <Badge variant="warning" size="sm">Pending</Badge>;
    }
  };

  const renderPaymentBadge = (status?: string) => {
    if (status === 'paid') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
        PAID
      </span>
    );
    if (status === 'failed') return <Badge variant="error" size="sm">Failed</Badge>;
    return <Badge variant="warning" size="sm">Unpaid</Badge>;
  };

  if (loading) return (
    <div className="h-64 flex flex-col items-center justify-center gap-2">
      <div className="w-8 h-8 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin" />
      <span className="text-xs text-stone-500">Loading orders...</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader 
        title="Orders Queue"
        description="Monitor, accept, and fulfill online, POS, and dine-in QR orders."
        badge={
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
              {orders.length} total
            </span>
            {newOrdersCount > 0 && (
              <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300 animate-pulse">
                {newOrdersCount} awaiting cashier review
              </span>
            )}
          </div>
        }
      />

      {/* Operational Workflow Tabs (Requirement 8 & 33) */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-stone-100/90 rounded-xl border border-stone-200">
        {[
          { id: "active", label: "Active Orders", count: activeCount },
          { id: "submitted", label: "New Orders", count: newOrdersCount, alert: newOrdersCount > 0 },
          { id: "accepted", label: "Accepted", count: acceptedCount },
          { id: "preparing", label: "Preparing", count: preparingCount },
          { id: "ready", label: "Ready", count: readyCount, gold: readyCount > 0 },
          { id: "history", label: "History", count: historyCount },
          { id: "All", label: "All Orders", count: orders.length },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              statusFilter === tab.id
                ? "bg-white text-stone-900 shadow-xs border border-stone-200"
                : "text-stone-600 hover:text-stone-900 hover:bg-white/50"
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                tab.alert
                  ? "bg-amber-200 text-amber-900 animate-pulse"
                  : tab.gold
                  ? "bg-[#D4A017] text-stone-900"
                  : statusFilter === tab.id
                  ? "bg-stone-100 text-stone-800"
                  : "bg-stone-200 text-stone-600"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filter / Search Bar & Source Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchInput 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClear={() => setSearchTerm("")}
            placeholder="Search by Order ID, Table, or customer name..."
          />
        </div>
        <div className="w-full sm:w-48">
          <select 
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as any)}
            className="w-full h-9 px-3 text-sm bg-white border border-stone-300 rounded-lg text-stone-800 focus:outline-none focus:border-[#8B1E1E] focus:ring-2 focus:ring-[#8B1E1E]/15"
          >
            <option value="all">All Sources</option>
            <option value="online">Online Orders</option>
            <option value="pos">Counter POS</option>
            <option value="qr">Dine-In QR</option>
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
        {/* Mobile View */}
        <div className="divide-y divide-stone-100 md:hidden">
          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-400">No orders found</div>
          ) : (
            filteredOrders.map(order => {
              const isSubmitted = order.order_status === "submitted";
              const isReady = order.order_status === "ready";
              const isUnpaid = order.payment_status !== "paid";

              return (
                <div key={order.id} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-stone-900 text-xs">
                        #{order.orderId || String(order.id).slice(0, 8)}
                      </span>
                      {order.table_number && (
                        <span className="px-2 py-0.5 rounded bg-[#8B1A1A] text-[#D4A017] font-black text-[10px] tracking-wider uppercase">
                          {order.table_number}
                        </span>
                      )}
                    </div>
                    {renderStatusBadge(order.order_status || order.status)}
                  </div>

                  <div className="flex items-center justify-between text-xs text-stone-600">
                    <span>
                      {order.items?.length || 0} items • {order.customerName}
                    </span>
                    <span className="font-semibold text-stone-900">{formatNaira(order.total)}</span>
                  </div>

                  {order.notes && (
                    <p className="text-[11px] text-amber-800 italic bg-amber-50/60 p-1.5 rounded">
                      Note: {order.notes}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs">
                    <div className="flex items-center gap-1.5">
                      {renderPaymentBadge(order.payment_status || order.paymentStatus)}
                      {order.payment_timing && (
                        <span className="text-[10px] text-stone-400">
                          ({order.payment_timing === 'before_meal' ? 'Pay First' : 'Pay After'})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {isSubmitted && (
                        <button
                          onClick={() => setSelectedPendingOrder(order)}
                          className="px-2.5 py-1 bg-[#8B1A1A] hover:bg-[#A52B2B] text-white text-xs font-bold rounded-lg shadow-xs"
                        >
                          Review & Accept
                        </button>
                      )}

                      <ActionDropdown 
                        items={[
                          ...(isSubmitted ? [
                            { label: 'Accept Order', onClick: () => handleAccept(order.id) },
                            { label: 'Reject Order', onClick: () => handleReject(order.id), danger: true },
                          ] : []),
                          {
                            label: 'Mark Preparing',
                            onClick: () => {
                              if (order.status === 'pending' || order.order_status === 'submitted') setSelectedPendingOrder(order);
                              else updateStatus(order.id, 'preparing');
                            }
                          },
                          { label: 'Mark Ready', onClick: () => updateStatus(order.id, 'ready') },
                          ...(isReady ? [{ label: 'Mark Served to Table', onClick: () => handleServed(order.id) }] : []),
                          { label: 'Mark Completed', onClick: () => updateStatus(order.id, 'completed') },
                          ...(isUnpaid ? [{ label: 'Record Cash/POS Payment', onClick: () => handleRecordPayment(order.id) }] : []),
                          { label: 'Cancel Order', onClick: () => updateStatus(order.id, 'cancelled'), danger: true },
                          ...(canDelete ? [{
                            label: 'Delete Order',
                            onClick: () => handleDeleteOrder(order.id, order.orderId),
                            danger: true
                          }] : [])
                        ]}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50/70 border-b border-stone-200 text-xs font-semibold text-stone-600">
                <th className="px-4 py-3">Order / Table</th>
                <th className="px-4 py-3">Customer / Guest</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Payment</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-stone-400">
                    <Receipt className="mx-auto text-stone-300 mb-2" size={28} />
                    <p>No orders match the selected filters</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => {
                  const isSubmitted = order.order_status === "submitted";
                  const isReady = order.order_status === "ready";
                  const isUnpaid = order.payment_status !== "paid";

                  return (
                    <tr key={order.id} className={`hover:bg-stone-50/60 transition-colors ${isSubmitted ? 'bg-amber-50/30' : ''}`}>
                      {/* Order ID & Table Badge */}
                      <td className="px-4 py-3 font-mono font-semibold text-stone-900">
                        <div className="flex items-center gap-2">
                          <span>#{order.orderId || String(order.id).slice(0, 8)}</span>
                          {order.table_number && (
                            <span className="px-2 py-0.5 rounded bg-[#8B1A1A] text-[#D4A017] font-black text-[10px] tracking-wider uppercase">
                              {order.table_number}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Customer / Guest */}
                      <td className="px-4 py-3 text-stone-800">
                        <div className="font-semibold">
                          {order.guest_name || order.customerName || 'Counter Customer'}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {order.source === 'online_customer' || order.source === 'customer' ? (
                            <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 text-[10px] font-bold border border-blue-200">
                              Online ({order.deliveryType || 'Pickup'})
                            </span>
                          ) : order.source === 'qr_guest' ? (
                            <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 text-[10px] font-bold border border-amber-200">
                              Dine-In QR
                            </span>
                          ) : (
                            <span className="text-[10px] text-stone-400">Counter POS</span>
                          )}
                        </div>
                      </td>

                      {/* Date & Time */}
                      <td className="px-4 py-3 text-stone-600">
                        <div>
                          {order.createdAt?.toDate ? format(order.createdAt.toDate(), "MMM d, yyyy") : "—"}
                        </div>
                        <div className="text-[11px] text-stone-400">
                          {order.createdAt?.toDate ? format(order.createdAt.toDate(), "h:mm aa") : ""}
                        </div>
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3 font-semibold text-stone-900">
                        {formatNaira(order.total)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        {renderStatusBadge(order.order_status || order.status)}
                      </td>

                      {/* Payment */}
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex flex-col items-center">
                          {renderPaymentBadge(order.payment_status || order.paymentStatus)}
                          {order.payment_timing && (
                            <span className="text-[10px] text-stone-400 mt-0.5">
                              {order.payment_timing === 'before_meal' ? 'Pay First' : 'Pay After'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isSubmitted && (
                            <button
                              onClick={() => setSelectedPendingOrder(order)}
                              className="px-2 py-1 bg-[#8B1A1A] hover:bg-[#A52B2B] text-white text-[11px] font-bold rounded-lg shadow-xs"
                            >
                              Review
                            </button>
                          )}

                          <ActionDropdown 
                            items={[
                              ...(isSubmitted ? [
                                { label: 'Accept Order (To Kitchen)', onClick: () => handleAccept(order.id) },
                                { label: 'Reject Order', onClick: () => handleReject(order.id), danger: true },
                              ] : []),
                              {
                                label: 'Mark Preparing',
                                onClick: () => {
                                  if (order.status === 'pending' || order.order_status === 'submitted') setSelectedPendingOrder(order);
                                  else updateStatus(order.id, 'preparing');
                                }
                              },
                              { label: 'Mark Ready', onClick: () => updateStatus(order.id, 'ready') },
                              ...(isReady ? [{ label: 'Mark Served to Table', onClick: () => handleServed(order.id) }] : []),
                              { label: 'Mark Completed', onClick: () => updateStatus(order.id, 'completed') },
                              ...(isUnpaid ? [{ label: 'Record Cash/POS Payment', onClick: () => handleRecordPayment(order.id) }] : []),
                              { label: 'Cancel Order', onClick: () => updateStatus(order.id, 'cancelled'), danger: true },
                              ...(canDelete ? [{
                                label: 'Delete Order',
                                onClick: () => handleDeleteOrder(order.id, order.orderId),
                                danger: true
                              }] : [])
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPendingOrder && (
        <OrderAcceptanceModal 
          order={selectedPendingOrder} 
          onAccept={async () => {
             await handleAccept(selectedPendingOrder.id);
             setSelectedPendingOrder(null);
          }}
          onReject={async () => {
             await handleReject(selectedPendingOrder.id);
             setSelectedPendingOrder(null);
          }}
          onClose={() => setSelectedPendingOrder(null)}
        />
      )}
    </div>
  );
};
