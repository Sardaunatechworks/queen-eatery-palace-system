import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { Order } from "../admin/OrdersView";
import { format } from "date-fns";
import { Clock, MapPin, Package, Receipt, CheckCircle2, Timer } from "lucide-react";
import { formatNaira } from "../../utils/format";
import { useUI } from "../../context/UIContext";
import { ReceiptModal } from "../../components/ReceiptModal";
import { getMyOrders } from "../../services/orderService";
import { PageHeader, Badge } from "../../components/ui";
import { Button } from "../../components/ui/Button";
import { Link } from "react-router-dom";

export const CustomerOrders: React.FC = () => {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const { showToast } = useUI();

  const fetchMyOrders = async () => {
    try {
      const response = await getMyOrders({ limit: 50 });
      setOrders(response.items);
    } catch (error: any) {
      showToast(error.message || "Failed to load orders", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!profile) return;
    fetchMyOrders();
    const interval = setInterval(fetchMyOrders, 10000);
    return () => clearInterval(interval);
  }, [profile]);

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center bg-white rounded-lg border border-stone-200">
        <div className="w-7 h-7 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-stone-500 font-medium">Loading your orders...</p>
      </div>
    );
  }

  const getBadgeVariant = (status: Order["status"]) => {
    switch (status) {
      case "completed":
      case "served":
        return "success";
      case "ready":
        return "gold" as any;
      case "preparing":
        return "warning";
      case "accepted":
        return "info";
      case "cancelled":
      case "rejected":
        return "error";
      default:
        return "default";
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Your Orders"
        description="Track live kitchen preparation, delivery progress, and digital receipts."
        badge={
          <Badge variant="neutral" size="sm">
            {orders.length} Order{orders.length === 1 ? "" : "s"}
          </Badge>
        }
      />

      {orders.length === 0 ? (
        <div className="bg-white rounded-lg p-16 text-center border border-dashed border-stone-300">
          <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-3 text-stone-400">
            <Receipt size={24} />
          </div>
          <h3 className="text-sm font-semibold text-stone-900 mb-1">No orders yet</h3>
          <p className="text-xs text-stone-500 max-w-xs mx-auto mb-4">
            Explore our menu and place your first meal order.
          </p>
          <Link to="/customer/menu">
            <Button variant="primary" size="sm">
              Explore Menu
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-lg shadow-xs border border-stone-200 overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-4 bg-stone-50 border-b border-stone-200 flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white rounded-md flex items-center justify-center text-stone-700 border border-stone-200 shrink-0">
                    <Receipt size={18} />
                  </div>
                  <div>
                    <div className="text-[11px] text-stone-400 flex items-center gap-1">
                      <Clock size={11} />
                      <span>
                        {order.createdAt?.toDate
                          ? format(order.createdAt.toDate(), "dd MMM yyyy, hh:mm a")
                          : "Recently"}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-stone-900 font-mono">
                      Order #{order.orderId || String(order.id).slice(0, 8)}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-medium text-stone-400 block">
                      Total
                    </span>
                    <span className="text-sm font-bold text-stone-900">
                      {formatNaira(order.total)}
                    </span>
                  </div>
                  <Badge size="sm" variant={getBadgeVariant(order.status)}>
                    {order.status}
                  </Badge>
                </div>
              </div>

              {/* Progress Flow */}
              <div className="p-5 space-y-5">
                <div className="relative py-2">
                  <div className="absolute top-1/2 left-0 w-full h-1 bg-stone-100 -translate-y-1/2 rounded-full" />
                  <div
                    className="absolute top-1/2 left-0 h-1 bg-[#8B1E1E] -translate-y-1/2 rounded-full transition-all duration-300"
                    style={{
                      width:
                        order.status === "completed" || order.status === "served"
                          ? "100%"
                          : order.status === "ready"
                          ? "75%"
                          : order.status === "preparing"
                          ? "50%"
                          : order.status === "accepted"
                          ? "25%"
                          : "0%",
                    }}
                  />

                  <div className="relative flex justify-between">
                    {[
                      { id: "submitted", label: "Received", icon: Receipt },
                      { id: "accepted", label: "Confirmed", icon: CheckCircle2 },
                      { id: "preparing", label: "Cooking", icon: Timer },
                      { id: "ready", label: "Ready", icon: Package },
                      { id: "completed", label: "Completed", icon: CheckCircle2 },
                    ].map((step) => {
                      const StepIcon = step.icon;
                      const orderStatus = order.order_status || order.status;
                      const statusMap: Record<string, number> = {
                        pending: 0,
                        submitted: 0,
                        received: 0,
                        accepted: 1,
                        preparing: 2,
                        ready: 3,
                        served: 4,
                        completed: 4,
                      };
                      const stepIndices: Record<string, number> = {
                        submitted: 0,
                        accepted: 1,
                        preparing: 2,
                        ready: 3,
                        completed: 4,
                      };
                      const currentRank = statusMap[orderStatus] ?? 0;
                      const targetRank = stepIndices[step.id] ?? 0;
                      const isDone = currentRank >= targetRank && orderStatus !== "cancelled" && orderStatus !== "rejected";

                      return (
                        <div key={step.id} className="flex flex-col items-center gap-1">
                          <div
                            className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                              isDone
                                ? "bg-[#8B1E1E] text-white border-[#8B1E1E]"
                                : "bg-white text-stone-300 border-stone-200"
                            }`}
                          >
                            <StepIcon size={11} />
                          </div>
                          <span
                            className={`text-[10px] font-medium ${
                              isDone ? "text-stone-900" : "text-stone-400"
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Items & Fulfillment Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3 border-t border-stone-100 text-xs">
                  <div>
                    <h4 className="font-semibold text-stone-500 uppercase tracking-wider text-[10px] mb-2">
                      Dishes in Order
                    </h4>
                    <div className="divide-y divide-stone-100">
                      {order.items?.map((item: any) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-center py-1.5 first:pt-0"
                        >
                          <div>
                            <span className="font-medium text-stone-800">{item.item_name}</span>
                            <span className="text-stone-400 text-[11px] ml-1.5">
                              ×{item.quantity}
                            </span>
                          </div>
                          <span className="font-medium text-stone-700">
                            {formatNaira((item.unit_price || 0) * item.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold text-stone-500 uppercase tracking-wider text-[10px] mb-2">
                        Fulfillment Method
                      </h4>
                      <div className="flex items-start gap-2 bg-stone-50 p-2.5 rounded-lg border border-stone-200 text-stone-700">
                        {order.deliveryType === "delivery" ? (
                          <>
                            <MapPin size={14} className="text-stone-400 shrink-0 mt-0.5" />
                            <span className="leading-snug">
                              {order.address || "Dutse Delivery Address"}
                            </span>
                          </>
                        ) : (
                          <>
                            <Package size={14} className="text-stone-400 shrink-0 mt-0.5" />
                            <span>In-store Counter Pickup</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Receipt size={13} />}
                        onClick={() => {
                          setSelectedOrder(order);
                          setShowReceipt(true);
                        }}
                      >
                        Digital Receipt
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showReceipt && selectedOrder && (
        <ReceiptModal
          isOpen={showReceipt}
          mode="customer"
          order={selectedOrder}
          onClose={() => {
            setShowReceipt(false);
            setSelectedOrder(null);
          }}
        />
      )}
    </div>
  );
};
