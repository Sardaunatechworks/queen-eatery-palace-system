import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiClient } from "../services/apiClient";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import { useSSE } from "../hooks/useSSE";
import { OrderAcceptanceModal } from "./OrderAcceptanceModal";
import { Order } from "../pages/admin/OrdersView";

export const GlobalOrderNotifier: React.FC = () => {
  const { profile } = useAuth();
  const { showToast, setLoading: setGlobalLoading } = useUI();
  const knownOrders = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);
  const [pendingOrdersQueue, setPendingOrdersQueue] = useState<Order[]>([]);

  const processOrders = useCallback((ordersList: any[]) => {
    let hasNewOrder = false;
    const currentPending: Order[] = [];

    ordersList.forEach(order => {
      currentPending.push({
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
      } as Order);

      const orderKey = String(order.id);
      if (!knownOrders.current.has(orderKey)) {
        knownOrders.current.add(orderKey);
        if (!isFirstLoad.current) {
          hasNewOrder = true;
        }
      }
    });

    currentPending.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
    setPendingOrdersQueue(currentPending);

    if (hasNewOrder) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          if (audioCtx.state === "suspended") {
            audioCtx.resume();
          }
          const now = audioCtx.currentTime;
          const osc1 = audioCtx.createOscillator();
          const gain1 = audioCtx.createGain();
          osc1.type = "sine";
          osc1.frequency.setValueAtTime(587.33, now);
          gain1.gain.setValueAtTime(0.35, now);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc1.connect(gain1);
          gain1.connect(audioCtx.destination);
          osc1.start(now);
          osc1.stop(now + 0.22);

          const osc2 = audioCtx.createOscillator();
          const gain2 = audioCtx.createGain();
          osc2.type = "sine";
          osc2.frequency.setValueAtTime(880, now + 0.12);
          gain2.gain.setValueAtTime(0.45, now + 0.12);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
          osc2.connect(gain2);
          gain2.connect(audioCtx.destination);
          osc2.start(now + 0.12);
          osc2.stop(now + 0.55);
        }
      } catch (e) {
        console.warn("Audio play failed", e);
      }

      showToast("New Incoming Order!", "success");
    }

    isFirstLoad.current = false;
  }, [showToast]);

  const isKitchen = profile?.role === "kitchen";
  const isCashierOrAdmin = profile?.role === "cashier" || profile?.role === "admin" || profile?.role === "super_admin";

  const isIncomingOrder = (o: any) => {
    // Orders placed directly by cashier at the POS counter are counter sales, NOT incoming alerts for cashier!
    if (o.source === "cashier") {
      return false;
    }

    // Online customer orders MUST be paid and verified before cashier receives them!
    const isOnline = o.source === "customer" || o.source === "online_customer";
    if (isOnline && o.payment_status !== "paid" && o.paymentStatus !== "paid") {
      return false;
    }
    const s = (o.order_status || o.status || "").toLowerCase();
    return s === "submitted" || s === "pending" || s === "received";
  };

  // Listen for orders created directly by cashier in this or other tabs to prevent self-alerting
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        channel = new BroadcastChannel("qep_orders_channel");
        channel.onmessage = (event) => {
          if (event.data?.type === "ORDER_CREATED_BY_CASHIER" && event.data?.orderId) {
            knownOrders.current.add(String(event.data.orderId));
          }
        };
      }
    } catch {}
    return () => {
      channel?.close();
    };
  }, []);

  const fetchPendingOrders = useCallback(async () => {
    try {
      if (isCashierOrAdmin) {
        const response = await apiClient.get<any>("/orders/pending");
        if (response && response.data) {
          const received = response.data.filter(isIncomingOrder);
          processOrders(received);
        }
      } else if (isKitchen) {
        const response = await apiClient.get<any>("/orders/active");
        if (response && response.data) {
          const accepted = response.data.filter((o: any) => {
            const s = (o.order_status || o.status || "").toLowerCase();
            return s === "accepted" || s === "received";
          });
          processOrders(accepted);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [processOrders, isCashierOrAdmin, isKitchen]);

  const handleOrdersSSE = useCallback((ordersList: any[]) => {
    if (Array.isArray(ordersList)) {
      if (isCashierOrAdmin) {
        const received = ordersList.filter(isIncomingOrder);
        processOrders(received);
      } else if (isKitchen) {
        const accepted = ordersList.filter((o: any) => {
          const s = (o.order_status || o.status || "").toLowerCase();
          return s === "accepted" || s === "received";
        });
        processOrders(accepted);
      }
    }
  }, [processOrders, isCashierOrAdmin, isKitchen]);

  useSSE({
    endpoint: "/sse/orders",
    eventName: "orders_update",
    onMessage: handleOrdersSSE,
    fallbackPoll: fetchPendingOrders,
    fallbackIntervalMs: 10000,
    enabled: !!profile && (isCashierOrAdmin || isKitchen)
  });

  const handleConfirmOrder = async (id: number | string, newStatus: string) => {
    setGlobalLoading(true);
    try {
      let response: any;
      if (newStatus === "accepted") {
        response = await apiClient.post(`/orders/${id}/accept`, {});
      } else if (newStatus === "cancelled" || newStatus === "rejected") {
        response = await apiClient.post(`/orders/${id}/reject`, { reason: "Declined by staff" });
      } else {
        response = await apiClient.patch(`/orders/${id}/status`, { status: newStatus });
      }

      if (response.success) {
        showToast(response.message || `Order status updated to ${newStatus}`, "success");
        setPendingOrdersQueue(prev => prev.filter(o => String(o.id) !== String(id)));
      } else {
        showToast(response.message || "Failed to update status", "error");
      }
    } catch (error: any) {
      showToast(error.message || "Failed to update status", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleCloseModal = () => {
    if (pendingOrdersQueue.length > 0) {
       setPendingOrdersQueue(prev => prev.slice(1));
    }
  };

  if (profile?.role !== "cashier" || pendingOrdersQueue.length === 0) return null;

  const currentOrder = pendingOrdersQueue[0];

  return (
    <OrderAcceptanceModal 
      order={currentOrder}
      onAccept={async () => {
         await handleConfirmOrder(currentOrder.id, 'accepted');
      }}
      onReject={async () => {
         if (window.confirm("Reject this order?")) {
            await handleConfirmOrder(currentOrder.id, 'rejected');
         }
      }}
      onClose={handleCloseModal}
    />
  );
};
