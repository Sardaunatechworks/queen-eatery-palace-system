import React, { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "../../layouts/DashboardLayout";
import { useSSE } from "../../hooks/useSSE";
import {
  ChefHat,
  CheckCircle,
  CheckCircle2,
  Clock,
  Timer,
  UtensilsCrossed,
  Bell,
  Package,
  User,
  Plus,
  X,
} from "lucide-react";
import { Order } from "../admin/OrdersView";
import { MenuItem, Category } from "../admin/MenuManagement";
import { format } from "date-fns";
import { useUI } from "../../context/UIContext";
import { ImageUpload } from "../../components/ImageUpload";
import { apiClient } from "../../services/apiClient";
import {
  getActiveOrders,
  updateOrderStatus as changeOrderStatus,
} from "../../services/orderService";
import {
  getMenuItems,
  getCategories,
  updateMenuItemStock,
  createMenuItem,
} from "../../services/menuService";
import { PageHeader, Badge } from "../../components/ui";
import { Input, TextArea, Select } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

const ProfileSettings = React.lazy(() =>
  import("../shared/ProfileSettings").then((m) => ({ default: m.ProfileSettings }))
);

const InventoryManagement = React.lazy(() =>
  import("../admin/InventoryManagement").then((m) => ({ default: m.InventoryManagement }))
);

const kitchenNavigation = [
  { name: "Kitchen Display", path: "/kitchen/dashboard", icon: ChefHat },
  { name: "Inventory", path: "/kitchen/inventory", icon: Package },
  { name: "Profile", path: "/kitchen/profile", icon: User },
];

const KitchenDashboardContent: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"orders" | "menu">("orders");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddCookedPlatesModal, setShowAddCookedPlatesModal] = useState(false);
  const [batchPlatesData, setBatchPlatesData] = useState({
    menuItemId: "",
    plates: "10",
  });
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    image: "",
    category_id: "",
    stockQuantity: "0",
  });
  const { showToast, setLoading: setGlobalLoading } = useUI();
  const knownAcceptedOrders = useRef<Set<string>>(new Set());
  const isFirstKitchenLoad = useRef(true);

  const playKitchenChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const now = ctx.currentTime;
      
      // High bell strike
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, now); // A5
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.6);

      // Second harmonic chime
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(1174.66, now + 0.15); // D6
      gain2.gain.setValueAtTime(0.5, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.9);
    } catch (err) {
      console.warn("Could not play kitchen chime", err);
    }
  }, []);

  const fetchKitchenData = async () => {
    try {
      // Single unified summary endpoint for instant kitchen display render
      const dashRes = await apiClient.get<any>('/kitchen/dashboard');
      if (dashRes.success && dashRes.data) {
        const active = (dashRes.data.orders || []).map((order: any) => ({
          ...order,
          id: order.id,
          orderId: order.order_number,
          total: order.total || order.total_amount,
          deliveryType: order.order_type || "takeaway",
          address: order.delivery_address,
          paymentStatus: order.payment_status,
          table_number: order.table_number,
          guest_name: order.guest_name,
          notes: order.notes,
          createdAt: {
            toDate: () => new Date((order.created_at || '').replace(/-/g, "/")),
            toMillis: () => new Date((order.created_at || '').replace(/-/g, "/")).getTime(),
          },
        }));
        active.sort((a: any, b: any) => a.createdAt.toMillis() - b.createdAt.toMillis());

        // Detect newly accepted orders for immediate kitchen alert
        let newlyAcceptedCount = 0;
        let latestAcceptedOrder: any = null;
        active.forEach((order: any) => {
          const isAccepted = order.order_status === "accepted" || order.order_status === "received" || order.status === "accepted" || order.status === "received";
          const key = String(order.id);
          if (isAccepted && !knownAcceptedOrders.current.has(key)) {
            knownAcceptedOrders.current.add(key);
            if (!isFirstKitchenLoad.current) {
              newlyAcceptedCount++;
              latestAcceptedOrder = order;
            }
          }
        });

        if (newlyAcceptedCount > 0 && latestAcceptedOrder) {
          playKitchenChime();
          const tableInfo = latestAcceptedOrder.table_number ? ` (Table ${latestAcceptedOrder.table_number.replace(/[^0-9]/g, '') || latestAcceptedOrder.table_number})` : '';
          showToast(`🔔 New Order Accepted: #${latestAcceptedOrder.orderId || latestAcceptedOrder.id}${tableInfo} is ready for kitchen preparation!`, "info");
        }

        isFirstKitchenLoad.current = false;
        setOrders(active);
        setCategories(dashRes.data.categories || []);
        setMenu(dashRes.data.menu || []);
        return;
      }

      // Fallback
      const [ordersList, menuRes, catsRes] = await Promise.all([
        getActiveOrders(),
        getMenuItems({ per_page: 200, status: "approved" }),
        getCategories(),
      ]);

      const active = ordersList
        .filter(
          (o: any) =>
            o.status === "received" || o.status === "preparing" || o.status === "accepted"
        )
        .map((order: any) => ({
          ...order,
          id: order.id,
          orderId: order.order_number,
          total: order.total_amount,
          deliveryType: order.order_type || "takeaway",
          address: order.delivery_address,
          paymentStatus: order.payment_status,
          table_number: order.table_number,
          guest_name: order.guest_name,
          notes: order.notes,
          createdAt: {
            toDate: () => new Date(order.created_at.replace(/-/g, "/")),
            toMillis: () => new Date(order.created_at.replace(/-/g, "/")).getTime(),
          },
        }));

      active.sort((a: any, b: any) => a.createdAt.toMillis() - b.createdAt.toMillis());

      let newlyAcceptedCount = 0;
      let latestAcceptedOrder: any = null;
      active.forEach((order: any) => {
        const isAccepted = order.status === "accepted" || order.status === "received";
        const key = String(order.id);
        if (isAccepted && !knownAcceptedOrders.current.has(key)) {
          knownAcceptedOrders.current.add(key);
          if (!isFirstKitchenLoad.current) {
            newlyAcceptedCount++;
            latestAcceptedOrder = order;
          }
        }
      });

      if (newlyAcceptedCount > 0 && latestAcceptedOrder) {
        playKitchenChime();
        const tableInfo = latestAcceptedOrder.table_number ? ` (Table ${latestAcceptedOrder.table_number.replace(/[^0-9]/g, '') || latestAcceptedOrder.table_number})` : '';
        showToast(`🔔 New Order Accepted: #${latestAcceptedOrder.orderId || latestAcceptedOrder.id}${tableInfo} is ready for kitchen preparation!`, "info");
      }

      isFirstKitchenLoad.current = false;
      setOrders(active);
      setMenu(menuRes.items || []);
      setCategories(catsRes || []);
    } catch (error: any) {
      console.error("Failed to load kitchen display data", error);
      showToast(error.message || "Failed to load kitchen queue", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKitchenData();
  }, []);

  // Real-time SSE updates for kitchen display queue
  useSSE({
    endpoint: "/sse/orders",
    eventName: "orders_update",
    onMessage: () => {
      fetchKitchenData();
    },
    fallbackPoll: fetchKitchenData,
    fallbackIntervalMs: 8000,
  });

  const handleStatusChange = async (orderId: string, nextStatus: string) => {
    try {
      await changeOrderStatus(Number(orderId), nextStatus as any);
      showToast(`Order status updated to ${nextStatus}`, "success");
      fetchKitchenData();
    } catch (error: any) {
      showToast(error.message || "Failed to update order status", "error");
    }
  };

  const handleStockUpdate = async (id: string, newStock: number) => {
    try {
      const originalItem = menu.find((m) => String(m.id) === String(id));
      if (!originalItem) return;

      const targetQuantity = Math.max(0, newStock);
      const currentStock = originalItem.quantity_available ?? originalItem.stockQuantity ?? 0;
      const diff = targetQuantity - currentStock;
      if (diff === 0) return;

      // Optimistically update local menu state so kitchen display responds instantaneously
      setMenu((prev) =>
        prev.map((item) =>
          String(item.id) === String(id)
            ? { ...item, quantity_available: targetQuantity, stockQuantity: targetQuantity }
            : item
        )
      );

      await updateMenuItemStock(Number(id), {
        quantity: Math.abs(diff),
        movement_type: diff > 0 ? "add" : "deduction",
        notes: diff > 0 ? `Kitchen added ${diff} plates` : `Kitchen deducted ${Math.abs(diff)} portions`,
      });

      showToast(`Stock for ${originalItem.name} updated to ${targetQuantity}`, "success");

      // Broadcast immediately to cashier POS and open windows
      try {
        const channel = new BroadcastChannel("qep_inventory_channel");
        channel.postMessage({
          type: "STOCK_UPDATED",
          itemId: Number(id),
          quantity: targetQuantity,
        });
        channel.close();
      } catch {}

      fetchKitchenData();
    } catch (error: any) {
      showToast(error.message || "Failed to update stock", "error");
      fetchKitchenData();
    }
  };

  const handleAddPlates = async (id: string, additionalPlates: number) => {
    if (additionalPlates <= 0) return;
    const originalItem = menu.find((m) => String(m.id) === String(id));
    if (!originalItem) return;

    const currentStock = originalItem.quantity_available ?? originalItem.stockQuantity ?? 0;
    const targetQuantity = currentStock + additionalPlates;

    // Optimistically update
    setMenu((prev) =>
      prev.map((item) =>
        String(item.id) === String(id)
          ? { ...item, quantity_available: targetQuantity, stockQuantity: targetQuantity }
          : item
      )
    );

    try {
      await updateMenuItemStock(Number(id), {
        quantity: additionalPlates,
        movement_type: "add",
        notes: `Kitchen cooked & added ${additionalPlates} plates`,
      });

      showToast(`Added ${additionalPlates} plates to ${originalItem.name}`, "success");

      try {
        const channel = new BroadcastChannel("qep_inventory_channel");
        channel.postMessage({
          type: "STOCK_UPDATED",
          itemId: Number(id),
          quantity: targetQuantity,
        });
        channel.close();
      } catch {}

      fetchKitchenData();
    } catch (error: any) {
      showToast(error.message || "Failed to add plates", "error");
      fetchKitchenData();
    }
  };

  const handleBatchAddCookedPlates = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemId = batchPlatesData.menuItemId;
    const count = parseInt(batchPlatesData.plates, 10);
    if (!itemId || isNaN(count) || count <= 0) {
      showToast("Please select a dish and enter a valid number of plates", "error");
      return;
    }
    await handleAddPlates(itemId, count);
    setShowAddCookedPlatesModal(false);
    setBatchPlatesData({ menuItemId: "", plates: "10" });
  };

  const handleProposeMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalLoading(true);
    try {
      await createMenuItem({
        name: formData.name,
        description: formData.description || undefined,
        price: Number(formData.price),
        image_path: formData.image || "/queen-logo.png",
        category_id: formData.category_id ? Number(formData.category_id) : null,
        quantity_available: Number(formData.stockQuantity) || 0,
      });

      showToast("Menu item proposed for admin approval", "success");
      setShowAddModal(false);
      setFormData({
        name: "",
        description: "",
        price: "",
        image: "",
        category_id: categories[0] ? String(categories[0].id) : "",
        stockQuantity: "0",
      });
      fetchKitchenData();
    } catch (error: any) {
      showToast(error.message || "Failed to propose item", "error");
    } finally {
      setGlobalLoading(false);
    }
  };

  useEffect(() => {
    if (categories.length > 0 && !formData.category_id) {
      setFormData((prev) => ({ ...prev, category_id: String(categories[0].id) }));
    }
  }, [categories]);

  const [statusFilter, setStatusFilter] = useState<"all" | "queued" | "preparing" | "ready">("all");

  const filteredOrders = orders.filter((o) => {
    const s = (o.status || o.order_status || "").toLowerCase();
    if (statusFilter === "all") return true;
    if (statusFilter === "queued") return s === "received" || s === "accepted" || s === "submitted" || s === "pending";
    if (statusFilter === "preparing") return s === "preparing";
    if (statusFilter === "ready") return s === "ready";
    return true;
  });

  const queuedCount = orders.filter((o) => {
    const s = (o.status || o.order_status || "").toLowerCase();
    return s === "received" || s === "accepted" || s === "submitted" || s === "pending";
  }).length;
  const preparingCount = orders.filter((o) => (o.status || o.order_status) === "preparing").length;
  const readyCount = orders.filter((o) => (o.status || o.order_status) === "ready").length;

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center bg-white rounded-lg border border-stone-200">
        <div className="w-7 h-7 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-stone-500 font-medium">Connecting to Kitchen Display Stream...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Tabs */}
      <PageHeader
        title="Kitchen Display System"
        description="Real-time order ticket queue, preparation status, and inventory portion control."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            {/* View switcher */}
            <div className="inline-flex p-0.5 rounded-lg bg-stone-100 border border-stone-200">
              <button
                type="button"
                onClick={() => setActiveTab("orders")}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === "orders"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <ChefHat size={14} /> Active Tickets ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("menu")}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === "menu"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <Package size={14} /> Kitchen Inventory
              </button>
            </div>

            {/* SSE Live status indicator */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              <span>Live KDS Stream</span>
            </div>

            {activeTab === "menu" && (
              <Button
                variant="primary"
                size="md"
                icon={<Plus size={15} />}
                onClick={() => setShowAddModal(true)}
              >
                Propose Item
              </Button>
            )}
          </div>
        }
      />

      {/* Orders View */}
      {activeTab === "orders" ? (
        <div className="space-y-4">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-stone-100 p-0.5 rounded-lg border border-stone-200 w-fit flex-wrap">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                statusFilter === "all"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              All ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("queued")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                statusFilter === "queued"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Queue ({queuedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("preparing")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                statusFilter === "preparing"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Preparing ({preparingCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("ready")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                statusFilter === "ready"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Ready for Handover ({readyCount})
            </button>
          </div>

          {/* Ticket Grid */}
          {filteredOrders.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center bg-white rounded-lg border border-dashed border-stone-300 text-center px-4">
              <UtensilsCrossed className="text-stone-300 mb-2" size={36} />
              <p className="text-sm font-medium text-stone-700">Kitchen is All Clear</p>
              <p className="text-xs text-stone-400 mt-0.5">
                No orders waiting for preparation in this view.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredOrders.map((order) => {
                const isNew = order.status === "received" || order.status === "accepted";
                return (
                  <div
                    key={order.id}
                    className={`bg-white rounded-lg border flex flex-col justify-between overflow-hidden shadow-xs transition-shadow hover:shadow-sm ${
                      isNew ? "border-amber-300 ring-1 ring-amber-200" : "border-stone-200"
                    }`}
                  >
                    {/* Ticket Header */}
                    <div
                      className={`p-3.5 border-b flex items-start justify-between gap-2 ${
                        isNew
                          ? "bg-amber-50/70 border-amber-200 text-amber-950"
                          : "bg-stone-50 border-stone-200 text-stone-900"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                          Ticket #{order.orderId || String(order.id).slice(0, 8)}
                        </div>

                        {order.table_number ? (
                          <div className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#8B1A1A] text-white font-black text-sm tracking-wider shadow-xs border border-[#D4A017]/40">
                            <span className="text-[#D4A017]">✦</span>
                            <span>TABLE {order.table_number.replace(/[^0-9]/g, '') || order.table_number}</span>
                          </div>
                        ) : (
                          <div className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-900 text-xs font-bold border border-blue-200">
                            <span>ONLINE ORDER ({order.deliveryType || "Pickup"})</span>
                          </div>
                        )}

                        {order.table_number && order.guest_name && (
                          <p className="text-[11px] text-stone-600 font-medium mt-1 truncate">
                            Guest: <strong className="text-stone-900">{order.guest_name}</strong>
                          </p>
                        )}

                        {!order.table_number && (order.customerName || order.customer_name) && (
                          <p className="text-[11px] text-stone-600 font-medium mt-1 truncate">
                            Customer: <strong className="text-stone-900">{order.customerName || order.customer_name}</strong>
                          </p>
                        )}
                        {order.notes && (
                          <p className="text-[11px] text-amber-800 font-medium mt-0.5 italic line-clamp-2">
                            "{order.notes}"
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <Badge
                          size="sm"
                          variant={
                            order.status === "ready"
                              ? "success"
                              : isNew
                              ? "warning"
                              : "info"
                          }
                        >
                          {order.status === "ready" ? (
                            <span className="flex items-center gap-1">
                              <CheckCircle size={11} /> Ready
                            </span>
                          ) : isNew ? (
                            <span className="flex items-center gap-1">
                              <Timer size={11} /> Queued
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <ChefHat size={11} /> Cooking
                            </span>
                          )}
                        </Badge>
                        <p className="text-[10px] text-stone-400 mt-1 flex items-center justify-end gap-1">
                          <Clock size={10} />
                          {order.createdAt?.toDate
                            ? format(order.createdAt.toDate(), "hh:mm a")
                            : "Just now"}
                        </p>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="p-3.5 flex-1 divide-y divide-stone-100 space-y-2">
                      {order.items?.map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="pt-2 first:pt-0 flex items-start justify-between gap-2"
                        >
                          <div className="flex-1">
                            <span className="font-semibold text-xs text-stone-900 leading-tight block">
                              {item.item_name}
                            </span>
                            {item.notes && (
                              <span className="text-[11px] text-amber-700 font-medium block mt-0.5 italic">
                                Note: {item.notes}
                              </span>
                            )}
                            {item.selected_options && (
                              <span className="text-[11px] text-stone-400 block mt-0.5">
                                {JSON.stringify(item.selected_options)}
                              </span>
                            )}
                          </div>
                          <span className="font-mono font-bold text-xs bg-stone-100 text-stone-800 px-2 py-0.5 rounded shrink-0">
                            ×{item.quantity}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Ticket Action Button */}
                    <div className="p-3 bg-stone-50 border-t border-stone-200">
                      {(order.status === "received" || order.status === "accepted" || order.status === "submitted" || order.status === "pending") && (
                        <Button
                          variant="primary"
                          size="md"
                          fullWidth
                          icon={<ChefHat size={14} />}
                          onClick={() => handleStatusChange(String(order.id), "preparing")}
                        >
                          Start Preparing
                        </Button>
                      )}
                      {order.status === "preparing" && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(String(order.id), "ready")}
                          className="w-full h-9 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                        >
                          <CheckCircle size={14} /> Mark as Ready
                        </button>
                      )}
                      {order.status === "ready" && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(String(order.id), "completed")}
                          className="w-full h-9 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                        >
                          <CheckCircle2 size={14} /> Handed Over / Completed
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Kitchen Inventory Portions Table */
        <div className="bg-white rounded-lg border border-stone-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 bg-stone-50 border-b border-stone-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Live Portion Stock</h3>
              <p className="text-xs text-stone-500">
                Adjust available portions or flag dishes as sold out in real-time (directly reflects to Cashier POS)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => setShowAddCookedPlatesModal(true)}
              >
                Add Cooked Plates
              </Button>
              <Badge variant="neutral" size="sm">
                {menu.length} Dishes
              </Badge>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/50 text-stone-500 font-medium">
                  <th className="py-3 px-4">Item</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-center">Portions Left</th>
                  <th className="py-3 px-4 text-center">Portion / Plates Management</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {menu.map((item) => {
                  const qty = item.quantity_available ?? item.stockQuantity ?? 0;
                  return (
                    <tr key={item.id} className="hover:bg-stone-50 transition-colors h-14">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={item.image || "/queen-logo.png"}
                            alt={item.name}
                            className="w-9 h-9 rounded-md object-cover border border-stone-200 bg-stone-100 shrink-0"
                          />
                          <div>
                            <span className="font-medium text-stone-900 block">{item.name}</span>
                            <span className="text-[11px] text-stone-500">₦{Number(item.price).toLocaleString()}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-4">
                        <span className="text-stone-600">{item.category}</span>
                      </td>

                      <td className="py-2.5 px-4 text-center">
                        <Badge
                          size="sm"
                          variant={qty === 0 ? "error" : qty < 10 ? "warning" : "success"}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                              qty === 0
                                ? "bg-red-500"
                                : qty < 10
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                            }`}
                          />
                          {qty === 0 ? "Sold Out" : `${qty} Portions`}
                        </Badge>
                      </td>

                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleStockUpdate(String(item.id), Math.max(0, qty - 1))}
                            disabled={qty <= 0}
                            className="w-7 h-7 rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors flex items-center justify-center font-medium disabled:opacity-40"
                            title="Deduct 1 portion"
                          >
                            -1
                          </button>
                          
                          <input
                            type="number"
                            min={0}
                            value={qty}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              handleStockUpdate(String(item.id), isNaN(val) ? 0 : val);
                            }}
                            className="w-14 h-7 text-center text-xs font-bold text-stone-900 font-mono bg-white border border-stone-300 rounded focus:outline-none focus:border-[#8B1E1E]"
                            title="Directly key-in plates left"
                          />

                          <button
                            type="button"
                            onClick={() => handleAddPlates(String(item.id), 1)}
                            className="w-7 h-7 rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors flex items-center justify-center font-medium"
                            title="Add 1 plate"
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddPlates(String(item.id), 5)}
                            className="px-2 h-7 rounded border border-stone-200 bg-stone-100 text-stone-800 hover:bg-stone-200 transition-colors flex items-center justify-center font-medium text-[11px]"
                            title="Add 5 plates"
                          >
                            +5
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddPlates(String(item.id), 10)}
                            className="px-2 h-7 rounded border border-stone-200 bg-stone-100 text-stone-800 hover:bg-stone-200 transition-colors flex items-center justify-center font-medium text-[11px]"
                            title="Add 10 plates"
                          >
                            +10
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddPlates(String(item.id), 20)}
                            className="px-2 h-7 rounded border border-stone-200 bg-stone-100 text-stone-800 hover:bg-stone-200 transition-colors flex items-center justify-center font-medium text-[11px]"
                            title="Add 20 plates"
                          >
                            +20
                          </button>
                          <div className="w-[1px] h-4 bg-stone-200 mx-0.5" />
                          <button
                            type="button"
                            onClick={() => handleStockUpdate(String(item.id), 0)}
                            disabled={qty === 0}
                            className="px-2.5 h-7 rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors text-[11px] font-medium disabled:opacity-40"
                            title="Mark as Sold Out immediately"
                          >
                            Sold Out
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Propose Dish Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-stone-200 shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-stone-900">Propose New Dish</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Items require manager approval before going live to customers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleProposeMenu} className="p-6 space-y-4">
              <Input
                label="Dish Name"
                placeholder="e.g. Traditional Goat Meat Pepper Soup"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Price (₦)"
                  type="number"
                  placeholder="0"
                  required
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                />
                <Input
                  label="Stock Portions"
                  type="number"
                  placeholder="0"
                  required
                  value={formData.stockQuantity}
                  onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                />
              </div>

              <Select
                label="Category"
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
              />

              <TextArea
                label="Description / Preparation Notes (Optional)"
                placeholder="e.g. Fresh catfish pepper soup prepared with local aromatic spices, served hot with boiled plantains."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />

              <div>
                <label className="text-xs font-medium text-stone-700 select-none block mb-1.5">
                  Dish Photograph
                </label>
                <ImageUpload
                  onUploadComplete={(url) => setFormData({ ...formData, image: url })}
                  folder="menu"
                />
              </div>

              <div className="p-4 bg-stone-50 -mx-6 -mb-6 mt-6 border-t border-stone-200 flex justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md">
                  Submit Dish
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Quick Add Cooked Plates Modal */}
      {showAddCookedPlatesModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-stone-200 shadow-xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-stone-900">Add Cooked Plates to Stock</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Directly adds portions of food ready for sale at the cashier counter.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCookedPlatesModal(false)}
                className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBatchAddCookedPlates} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-stone-700 block mb-1">
                  Select Food Dish
                </label>
                <select
                  required
                  value={batchPlatesData.menuItemId}
                  onChange={(e) => setBatchPlatesData({ ...batchPlatesData, menuItemId: e.target.value })}
                  className="w-full h-10 px-3 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 font-medium focus:outline-none focus:border-[#8B1E1E]"
                >
                  <option value="">-- Select Dish --</option>
                  {menu.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (Current: {m.quantity_available ?? m.stockQuantity ?? 0} plates)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-stone-700 block mb-1">
                  Plates Cooked & Prepared
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={batchPlatesData.plates}
                  onChange={(e) => setBatchPlatesData({ ...batchPlatesData, plates: e.target.value })}
                  placeholder="e.g. 25"
                  className="w-full h-10 px-3 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 font-mono font-bold focus:outline-none focus:border-[#8B1E1E]"
                />
              </div>

              <div className="flex gap-2 pt-1">
                {[5, 10, 15, 20, 30, 50].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBatchPlatesData({ ...batchPlatesData, plates: String(preset) })}
                    className="flex-1 py-1 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded text-xs font-mono font-semibold text-stone-700 transition-colors"
                  >
                    +{preset}
                  </button>
                ))}
              </div>

              <div className="p-4 bg-stone-50 -mx-6 -mb-6 mt-6 border-t border-stone-200 flex justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setShowAddCookedPlatesModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md">
                  Add to Live Counter
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const KitchenScreen: React.FC = () => {
  return (
    <DashboardLayout navigation={kitchenNavigation} title="Kitchen Portal">
      <Routes>
        <Route path="/" element={<Navigate to="dashboard" replace />} />
        <Route path="/dashboard" element={<KitchenDashboardContent />} />
        <Route
          path="/inventory"
          element={
            <React.Suspense
              fallback={
                <div className="py-20 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs text-stone-500 font-medium">Loading Inventory System...</p>
                </div>
              }
            >
              <InventoryManagement />
            </React.Suspense>
          }
        />
        <Route path="/profile" element={<ProfileSettings />} />
      </Routes>
    </DashboardLayout>
  );
};
