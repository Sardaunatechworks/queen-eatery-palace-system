import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { useSSE } from "../../hooks/useSSE";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  UtensilsCrossed,
  CheckCircle2,
  Wallet,
  CreditCard,
  ArrowRightLeft,
  Bell,
  ChefHat,
  Package,
  Volume2,
  VolumeX,
  Volume1,
  Printer,
  Search,
  X,
} from "lucide-react";
import { MenuItem } from "../admin/MenuManagement";
import { formatNaira } from "../../utils/format";
import { useUI } from "../../context/UIContext";
import { ReceiptModal } from "../../components/ReceiptModal";
import { OrderAcceptanceModal } from "../../components/OrderAcceptanceModal";
import { format } from "date-fns";
import { getMenuItems } from "../../services/menuService";
import { getOrders, getActiveOrders, updateOrderStatus, createOrder, acceptOrder, rejectOrder, normalizeOrder } from "../../services/orderService";
import { SearchInput } from "../../components/ui/Input";
import { Badge } from "../../components/ui";
import { Button } from "../../components/ui/Button";
import {
  getTakeawayPackPrice,
  calculatePackagingFee,
  calculateGrandTotal,
} from "../../services/pricingService";

export const CashierTerminal: React.FC = () => {
  const { profile } = useAuth();
  const { setLoading: setGlobalLoading, showToast } = useUI();
  const [activeTab, setActiveTab] = useState<"pos" | "incoming">("pos");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<{ item: MenuItem; quantity: number }[]>([]);
  const [incomingOrders, setIncomingOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "pos" | "transfer">("cash");
  const [selectedPendingOrder, setSelectedPendingOrder] = useState<any>(null);
  const [packUnitPrice, setPackUnitPrice] = useState<number>(300);
  const [packagingQty, setPackagingQty] = useState<number>(0);

  // Notification & Audio States
  const [unreadCount, setUnreadCount] = useState(0);
  const [volume, setVolume] = useState(() => Number(localStorage.getItem("notiVolume") || 0.5));
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("notiMuted") === "true");
  const isFirstLoad = useRef(true);

  // Receipt State
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any>(null);

  // Unlimited Reprint State
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [pastOrders, setPastOrders] = useState<any[]>([]);
  const [loadingPastOrders, setLoadingPastOrders] = useState(false);
  const [reprintSearchTerm, setReprintSearchTerm] = useState("");
  const [reprintFilter, setReprintFilter] = useState<"all" | "today" | "paid">("all");
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<any>(null);

  const fetchPastOrders = useCallback(async () => {
    setLoadingPastOrders(true);
    try {
      const res = await getOrders({ limit: 100 });
      setPastOrders(res.items || []);
    } catch (err: any) {
      showToast(err.message || "Failed to load past orders for reprint", "error");
    } finally {
      setLoadingPastOrders(false);
    }
  }, [showToast]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const categories = ["All", "Meals", "Drinks", "Desserts"];

  // Focus search bar on '/' keypress
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Sync Audio Settings
  useEffect(() => {
    localStorage.setItem("notiVolume", volume.toString());
    localStorage.setItem("notiMuted", isMuted.toString());
  }, [volume, isMuted]);

  // Load configured takeaway pack price
  useEffect(() => {
    getTakeawayPackPrice().then((price) => setPackUnitPrice(price));
  }, []);

  // Initialize alerted order IDs from sessionStorage to prevent re-alerting on page reload
  const alertedOrderIds = useRef<Set<string>>(
    new Set(JSON.parse(sessionStorage.getItem("qep_cashier_alerted_orders") || "[]"))
  );

  // Professional 2-tone restaurant POS harmonic chime (D5 -> A5)
  const playPosChime = useCallback(() => {
    if (isMuted || volume === 0) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const now = ctx.currentTime;
      // Note 1: 587.33 Hz (D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(volume * 0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.22);

      // Note 2: 880 Hz (A5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880, now + 0.12);
      gain2.gain.setValueAtTime(volume * 0.45, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.55);
    } catch (e) {
      console.warn("Chime failed:", e);
    }
  }, [volume, isMuted]);

  const playBeep = React.useCallback(
    (type: "success" | "error" = "success") => {
      if (type === "success") {
        playPosChime();
        return;
      }
      if (isMuted || volume === 0) return;
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch (e) {
        console.warn("Beep failed:", e);
      }
    },
    [volume, isMuted, playPosChime]
  );

  const fetchMenu = async () => {
    try {
      const response = await getMenuItems({ per_page: 200 });
      if (response.items) {
        setMenu(response.items);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const isAwaitingCashier = (o: any) => {
    // Orders placed directly by cashier at the POS counter are already confirmed and accepted, never incoming
    if (o.source === "cashier") {
      return false;
    }
    // Online customer orders MUST be paid and verified before cashier receives them!
    const isOnline = o.source === "online_customer" || o.source === "customer";
    if (isOnline && o.payment_status !== "paid" && o.paymentStatus !== "paid") {
      return false;
    }
    const s = (o.order_status || o.status || "").toLowerCase();
    return s === "submitted" || s === "pending" || s === "received";
  };

  const processIncomingOrders = useCallback(
    (orders: any[]) => {
      const normalized = Array.isArray(orders) ? orders.map(normalizeOrder) : [];
      const awaiting = normalized.filter(isAwaitingCashier);

      // Find new orders that were not previously alerted
      const newlyArrived = awaiting.filter(
        (o) => !alertedOrderIds.current.has(String(o.id))
      );

      if (isFirstLoad.current) {
        // Initial load: silently record existing orders so page refresh/login does not trigger audio
        awaiting.forEach((o) => alertedOrderIds.current.add(String(o.id)));
        sessionStorage.setItem(
          "qep_cashier_alerted_orders",
          JSON.stringify(Array.from(alertedOrderIds.current))
        );
        if (activeTab !== "incoming") {
          setUnreadCount(awaiting.length);
        }
        isFirstLoad.current = false;
      } else if (newlyArrived.length > 0) {
        // Play chime ONCE for newly arrived verified orders
        newlyArrived.forEach((o) => alertedOrderIds.current.add(String(o.id)));
        sessionStorage.setItem(
          "qep_cashier_alerted_orders",
          JSON.stringify(Array.from(alertedOrderIds.current))
        );
        playPosChime();

        const latest = newlyArrived[0];
        const isOnline = latest.source === "online_customer" || latest.source === "customer";
        showToast(
          isOnline
            ? `New Online Order: #${latest.order_number} (${formatNaira(latest.total_amount ?? latest.total)}) • PAID`
            : `New Table Order: ${latest.table_number || ""} #${latest.order_number}`,
          "success"
        );

        if (activeTab !== "incoming") {
          setUnreadCount((count) => count + newlyArrived.length);
        }
      }

      setIncomingOrders(awaiting);
    },
    [playPosChime, activeTab, showToast]
  );

  const fetchIncomingOrders = async () => {
    try {
      const orders = await getActiveOrders();
      processIncomingOrders(orders);
    } catch (e) {
      console.error("Failed to load incoming orders:", e);
    }
  };

  useEffect(() => {
    fetchMenu();

    // Listen to real-time inventory updates from Kitchen or Admin across tabs
    try {
      const invChannel = new BroadcastChannel("qep_inventory_channel");
      invChannel.onmessage = (event) => {
        if (event.data?.type === "STOCK_UPDATED" || event.data?.type === "MENU_UPDATED") {
          fetchMenu();
        }
      };
      return () => {
        invChannel.close();
      };
    } catch {}
  }, []);

  const handleCashierSSE = useCallback(
    (orders: any[]) => {
      processIncomingOrders(orders);
      fetchMenu();
    },
    [processIncomingOrders]
  );

  const handleFallbackPoll = useCallback(() => {
    fetchIncomingOrders();
    fetchMenu();
  }, []);

  useSSE({
    endpoint: "/sse/orders",
    eventName: "orders_update",
    onMessage: handleCashierSSE,
    fallbackPoll: handleFallbackPoll,
    fallbackIntervalMs: 8000,
  });

  const filteredMenu = useMemo(() => {
    return menu.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory =
        activeCategory === "All" ||
        item.category === activeCategory ||
        item.category_name === activeCategory;
      const isApproved = (item.status as string) === "approved" || item.approval_status === "approved" || item.status === "available";
      return matchesSearch && matchesCategory && isApproved;
    });
  }, [menu, searchTerm, activeCategory]);

  const addToCart = React.useCallback(
    (item: MenuItem) => {
      setCart((prev) => {
        const existing = prev.find((i) => i.item.id === item.id);
        if (existing) {
          return prev.map((i) => (i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
        }
        return [...prev, { item, quantity: 1 }];
      });
      showToast(`${item.name} added`, "info");
    },
    [showToast]
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();

      const availableItems = filteredMenu.filter((item) => (item.quantity_available ?? item.stockQuantity ?? 0) > 0);

      if (availableItems.length > 0) {
        const exactMatch = availableItems.find(
          (item) => item.name.toLowerCase() === searchTerm.trim().toLowerCase()
        );
        const topMatch = exactMatch || availableItems[0];

        addToCart(topMatch);
        setSearchTerm("");
      } else if (filteredMenu.length > 0) {
        showToast("Dishes matching search are sold out!", "error");
      }
    }
  };

  const updateQuantity = (id: string | number, delta: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.item.id === id) {
          const newQ = i.quantity + delta;
          return newQ > 0 ? { ...i, quantity: newQ } : i;
        }
        return i;
      })
    );
  };

  const setExactQuantity = (id: string | number, qty: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.item.id === id) {
          return { ...i, quantity: Math.max(1, qty) };
        }
        return i;
      })
    );
  };

  const removeFromCart = (id: string | number) => {
    const item = cart.find((i) => i.item.id === id);
    setCart((prev) => prev.filter((i) => i.item.id !== id));
    if (item) showToast(`${item.item.name} removed`, "info");
  };

  const subtotal = cart.reduce((sum, i) => sum + i.item.price * i.quantity, 0);
  const packagingFee = calculatePackagingFee(packagingQty, packUnitPrice);
  const grandTotal = calculateGrandTotal(subtotal, packagingFee);

  const handleUpdateStatus = async (id: number | string, newStatus: string) => {
    try {
      await updateOrderStatus(Number(id), newStatus);
      showToast(`Order marked as ${newStatus}`, "success");
      setIncomingOrders((prev) => prev.filter((o) => String(o.id) !== String(id)));
      fetchIncomingOrders();
    } catch (error: any) {
      showToast(error.message || "Failed to update status", "error");
      throw error;
    }
  };

  const handleConfirmOrder = async () => {
    if (cart.length === 0) return;

    setGlobalLoading(true);
    try {
      const result = await createOrder({
        items: cart.map((i) => ({ menu_item_id: i.item.id, quantity: i.quantity })),
        order_type: "takeaway",
        payment_method: paymentMethod,
        packaging_quantity: packagingQty,
        source: "cashier",
      });

      // Suppress incoming alert chime on this terminal and notify across tabs/windows
      if (result.id) {
        alertedOrderIds.current.add(String(result.id));
        sessionStorage.setItem(
          "qep_cashier_alerted_orders",
          JSON.stringify(Array.from(alertedOrderIds.current))
        );
        try {
          const channel = new BroadcastChannel("qep_orders_channel");
          channel.postMessage({
            type: "CASHIER_ORDER_CREATED",
            orderId: result.id,
            orderNumber: result.orderNumber,
          });
          channel.close();
        } catch {
          // ignore BroadcastChannel errors in unsupported environments
        }
      }

      setCompletedOrder({
        id: result.id,
        orderId: result.orderNumber,
        cashierName: profile?.name || "Queen's Staff",
        customerName: "Counter Customer",
        items: cart.map((i) => ({
          id: i.item.id,
          name: i.item.name,
          price: i.item.price,
          quantity: i.quantity,
        })),
        subtotal,
        packaging_quantity: packagingQty,
        packaging_unit_price: packUnitPrice,
        packaging_fee: packagingFee,
        total: grandTotal,
        paymentMethod,
        createdAt: new Date(),
      });
      setCart([]);
      setPackagingQty(0);
      setShowReceipt(true);
      showToast(`Order ${result.orderNumber} confirmed successfully!`, "success");
      fetchMenu();
    } catch (err: any) {
      showToast(err.message || "Failed to process order", "error");
      console.error(err);
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleSwitchTab = (tab: "pos" | "incoming") => {
    setActiveTab(tab);
    if (tab === "incoming") setUnreadCount(0);
  };

  const filteredPastOrders = useMemo(() => {
    return pastOrders.filter((order) => {
      if (reprintFilter === "today") {
        let d: Date;
        if (order.createdAt?.toDate) {
          d = order.createdAt.toDate();
        } else if (order.created_at) {
          d = new Date(String(order.created_at).replace(/-/g, "/"));
        } else {
          d = new Date();
        }
        const today = new Date();
        if (
          d.getDate() !== today.getDate() ||
          d.getMonth() !== today.getMonth() ||
          d.getFullYear() !== today.getFullYear()
        ) {
          return false;
        }
      } else if (reprintFilter === "paid") {
        const pStatus = (order.payment_status || order.paymentStatus || "").toLowerCase();
        if (pStatus !== "paid") return false;
      }

      if (!reprintSearchTerm.trim()) return true;
      const term = reprintSearchTerm.toLowerCase();
      const orderNum = (order.order_number || order.orderId || order.orderNumber || "").toLowerCase();
      const cust = (order.customer_name || order.customerName || order.guest_name || "").toLowerCase();
      const table = (order.table_number || "").toLowerCase();
      return orderNum.includes(term) || cust.includes(term) || table.includes(term);
    });
  }, [pastOrders, reprintFilter, reprintSearchTerm]);

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center bg-white rounded-lg border border-stone-200">
        <div className="w-7 h-7 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-stone-500 font-medium">Initializing POS Terminal...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-8rem)] min-h-[580px]">
      {/* Terminal Top Control Bar */}
      <div className="bg-white px-4 py-2.5 rounded-lg border border-stone-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Tab switch */}
        <div className="inline-flex p-0.5 rounded-lg bg-stone-100 border border-stone-200 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => handleSwitchTab("pos")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === "pos"
                ? "bg-white text-stone-900 shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <ShoppingCart size={14} /> POS Register
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab("incoming")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-colors relative ${
              activeTab === "incoming"
                ? "bg-white text-stone-900 shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <Bell size={14} /> Incoming Orders
            {unreadCount > 0 && (
              <span className="h-4 px-1.5 rounded-full bg-red-600 text-white font-semibold text-[10px] inline-flex items-center justify-center ml-1">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Right Tools: Reprint Receipts, Audio volume & search */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
          {/* Reprint Receipts Action Button */}
          <button
            type="button"
            onClick={() => {
              setShowReprintModal(true);
              fetchPastOrders();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 text-xs font-semibold shadow-xs transition-colors"
            title="Search and reprint any previous customer receipt at any time"
          >
            <Printer size={14} className="text-[#8B1E1E]" />
            <span>Reprint Receipts</span>
          </button>

          {/* Audio Beeper Control */}
          <div className="flex items-center gap-2 bg-stone-50 px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs">
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="text-stone-600 hover:text-stone-900 transition-colors"
              title={isMuted ? "Unmute alert tones" : "Mute alert tones"}
            >
              {isMuted || volume === 0 ? (
                <VolumeX size={14} className="text-red-600" />
              ) : volume < 0.5 ? (
                <Volume1 size={14} />
              ) : (
                <Volume2 size={14} />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                if (isMuted) setIsMuted(false);
              }}
              className="w-16 h-1 bg-stone-200 rounded appearance-none cursor-pointer accent-[#8B1E1E]"
            />
          </div>

          {activeTab === "pos" && (
            <div className="w-48 sm:w-64">
              <SearchInput
                ref={searchInputRef}
                placeholder="Search dish (Press /)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClear={() => setSearchTerm("")}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
          )}
        </div>
      </div>

      {activeTab === "pos" ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
          {/* Menu Catalog (Left Column) */}
          <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">
            {/* Category pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar shrink-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                    activeCategory === cat
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Menu Grid */}
            <div className="flex-1 overflow-y-auto pr-1 min-h-0">
              {filteredMenu.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center bg-white rounded-lg border border-dashed border-stone-300 p-8 text-center">
                  <UtensilsCrossed className="text-stone-300 mb-2" size={36} />
                  <p className="text-xs font-medium text-stone-500">No dishes available in this filter</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredMenu.map((item) => {
                    const stock = item.quantity_available ?? item.stockQuantity ?? 0;
                    const isOutOfStock = stock <= 0;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => !isOutOfStock && addToCart(item)}
                        disabled={isOutOfStock}
                        className={`bg-white p-3.5 rounded-lg border text-left flex flex-col justify-between h-32 transition-all group shadow-xs ${
                          isOutOfStock
                            ? "opacity-50 cursor-not-allowed border-stone-200"
                            : "border-stone-200 hover:border-stone-400 hover:shadow-xs active:scale-[0.99]"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1.5 mb-1">
                            <span className="text-[10px] font-medium text-stone-500 uppercase tracking-wider truncate">
                              {item.category_name || item.category || "Meal"}
                            </span>
                            <Badge
                              size="sm"
                              variant={isOutOfStock ? "error" : stock <= 5 ? "warning" : "default"}
                            >
                              {isOutOfStock ? "Out of stock" : `${stock} left`}
                            </Badge>
                          </div>
                          <h4 className="font-medium text-stone-900 text-xs line-clamp-2 group-hover:text-[#8B1E1E] transition-colors">
                            {item.name}
                          </h4>
                        </div>

                        <div className="flex justify-between items-center w-full pt-2 border-t border-stone-100 mt-auto">
                          <span className="font-semibold text-stone-900 text-sm">
                            {formatNaira(item.price)}
                          </span>
                          {!isOutOfStock && (
                            <span className="w-6 h-6 rounded-md bg-stone-100 group-hover:bg-[#8B1E1E] group-hover:text-white text-stone-600 flex items-center justify-center transition-colors">
                              <Plus size={14} />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* POS Cart Sidebar (Right Column) */}
          <div className="bg-white rounded-lg border border-stone-200 shadow-xs flex flex-col justify-between overflow-hidden h-full min-h-0">
            {/* Cart Header */}
            <div className="p-3.5 border-b border-stone-200 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart size={16} className="text-[#8B1E1E]" />
                <h3 className="font-semibold text-stone-900 text-sm">Order Summary</h3>
              </div>
              <Badge variant="neutral" size="sm">
                {cart.reduce((s, i) => s + i.quantity, 0)} Items
              </Badge>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-2 min-h-0 divide-y divide-stone-100">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-12 text-center">
                  <ShoppingCart size={32} className="text-stone-300 mb-2" />
                  <p className="text-xs font-medium text-stone-500">Cart is empty</p>
                  <p className="text-[11px] text-stone-400 mt-0.5">Click items on the left to add</p>
                </div>
              ) : (
                cart.map(({ item, quantity }) => (
                  <div key={item.id} className="pt-2 first:pt-0 flex items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <h5 className="font-medium text-xs text-stone-900 truncate">{item.name}</h5>
                      <p className="text-xs font-semibold text-stone-600 mt-0.5">
                        {formatNaira(item.price * quantity)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-6 h-6 bg-stone-100 border border-stone-200 rounded flex items-center justify-center hover:bg-stone-200 transition-colors"
                        title="Decrease quantity"
                      >
                        <Minus size={11} className="text-stone-700" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={quantity === 0 ? "" : quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setExactQuantity(item.id, isNaN(val) ? 1 : val);
                        }}
                        className="w-10 h-6 text-center text-xs font-semibold text-stone-900 font-mono bg-white border border-stone-300 rounded focus:outline-none focus:border-[#8B1E1E]"
                        title="Enter item quantity"
                      />
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-6 h-6 bg-stone-100 border border-stone-200 rounded flex items-center justify-center hover:bg-stone-200 transition-colors"
                        title="Increase quantity"
                      >
                        <Plus size={11} className="text-stone-700" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        className="w-6 h-6 text-stone-400 hover:text-red-600 rounded flex items-center justify-center transition-colors ml-1"
                        title="Remove item"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart Settlement Details */}
            <div className="p-3.5 border-t border-stone-200 bg-stone-50/70 space-y-2.5 shrink-0">
              <div className="flex justify-between items-center text-xs text-stone-500">
                <span>Food Subtotal</span>
                <span className="font-mono">{formatNaira(subtotal)}</span>
              </div>

              {/* Takeaway Packs Quantity Control */}
              <div className="p-2.5 bg-stone-100/90 rounded-lg border border-stone-200/90 space-y-1.5">
                <div className="flex justify-between items-center text-xs font-medium text-stone-700">
                  <div className="flex items-center gap-1.5">
                    <Package size={13} className="text-[#8B1E1E]" />
                    <span>Takeaway Packs</span>
                  </div>
                  <span className="text-[11px] text-stone-500 font-mono">
                    {formatNaira(packUnitPrice)}/pack
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={packagingQty <= 0}
                      onClick={() => setPackagingQty((prev) => Math.max(0, prev - 1))}
                      className="w-6 h-6 bg-white border border-stone-300 rounded flex items-center justify-center hover:bg-stone-50 disabled:opacity-40 transition-colors shadow-2xs"
                      title="Decrease takeaway packs"
                    >
                      <Minus size={11} className="text-stone-700" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={packagingQty}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setPackagingQty(isNaN(val) || val < 0 ? 0 : val);
                      }}
                      className="w-12 h-6 text-center text-xs font-bold bg-white border border-stone-300 rounded font-mono focus:outline-none focus:border-[#8B1E1E]"
                    />
                    <button
                      type="button"
                      onClick={() => setPackagingQty((prev) => prev + 1)}
                      className="w-6 h-6 bg-white border border-stone-300 rounded flex items-center justify-center hover:bg-stone-50 transition-colors shadow-2xs"
                      title="Increase takeaway packs"
                    >
                      <Plus size={11} className="text-stone-700" />
                    </button>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold text-stone-900 font-mono">
                      {formatNaira(packagingFee)}
                    </span>
                    {packagingQty === 0 && (
                      <span className="block text-[10px] text-stone-400 font-normal">₦0</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Grand Total Due */}
              <div className="flex justify-between items-baseline text-sm font-semibold text-stone-900 border-t border-stone-200 pt-2">
                <span>Total Due</span>
                <span className="text-base font-bold text-[#8B1E1E] font-mono">{formatNaira(grandTotal)}</span>
              </div>

              {/* Payment Method Switcher */}
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={`h-9 border rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    paymentMethod === "cash"
                      ? "bg-stone-900 text-white border-stone-900 shadow-xs"
                      : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  <Wallet size={13} /> Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("pos")}
                  className={`h-9 border rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    paymentMethod === "pos"
                      ? "bg-stone-900 text-white border-stone-900 shadow-xs"
                      : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  <CreditCard size={13} /> POS
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("transfer")}
                  className={`h-9 border rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    paymentMethod === "transfer"
                      ? "bg-stone-900 text-white border-stone-900 shadow-xs"
                      : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  <ArrowRightLeft size={13} /> Transfer
                </button>
              </div>

              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={cart.length === 0}
                onClick={handleConfirmOrder}
                icon={<CheckCircle2 size={15} />}
              >
                Place & Print Receipt
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Incoming orders tab */
        <div className="flex-1 bg-white rounded-lg border border-stone-200 p-5 overflow-y-auto min-h-0 shadow-xs">
          {incomingOrders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-16 text-center">
              <ChefHat className="text-stone-300 mb-2" size={40} />
              <p className="text-sm font-medium text-stone-700">No incoming orders awaiting cashier review</p>
              <p className="text-xs text-stone-400 mt-0.5">New online or QR orders will appear here in real time.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {incomingOrders.map((order) => {
                const isOnline = order.source === "online_customer" || order.source === "customer";
                const isPaid = order.payment_status === "paid" || order.paymentStatus === "paid";

                return (
                  <div
                    key={order.id}
                    className={`p-4 rounded-lg border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors ${
                      isOnline ? "bg-sky-50/40 border-sky-200 hover:border-sky-300" : "bg-stone-50 border-stone-200 hover:border-stone-300"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-stone-900 text-sm">
                          {order.orderNumber || order.order_number}
                        </span>

                        {isOnline ? (
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-[10px] font-extrabold uppercase tracking-wide border border-blue-200">
                            Online Order
                          </span>
                        ) : order.source === "qr_guest" ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-extrabold uppercase tracking-wide border border-amber-200">
                            Dine-In QR
                          </span>
                        ) : (
                          <Badge size="sm" variant="warning">
                            {order.order_type || "POS"}
                          </Badge>
                        )}

                        {order.table_number && (
                          <span className="px-2 py-0.5 rounded bg-[#8B1A1A] text-white text-[11px] font-black tracking-wider shadow-xs border border-[#D4A017]/40">
                            ✦ {order.table_number.toUpperCase()}
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 text-[10px] font-bold uppercase border border-stone-200">
                          {order.order_type === "delivery" ? "Delivery" : order.order_type === "walk_in" ? "Walk-In" : "Pickup"}
                        </span>

                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                            <CheckCircle2 size={10} className="text-emerald-700" />
                            PAID
                          </span>
                        ) : order.payment_timing === "after_meal" ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                            Pay After Meal
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700">
                            Unpaid
                          </span>
                        )}

                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                          Needs Review
                        </span>
                      </div>

                      <p className="text-xs text-stone-500">
                        Placed: {format(new Date(order.created_at || new Date()), "hh:mm a")} • Customer:{" "}
                        <strong className="text-stone-800">{order.customer_name || order.customerName || "Customer"}</strong>
                        {order.customerPhone && <span className="text-stone-400 font-mono ml-1">({order.customerPhone})</span>}
                      </p>

                      <div className="flex flex-wrap gap-1 pt-1">
                        {order.items?.map((item: any) => (
                          <span
                            key={item.id}
                            className="text-[11px] font-medium bg-white text-stone-700 border border-stone-200 px-2 py-0.5 rounded"
                          >
                            {item.item_name || item.name} ×{item.quantity}
                          </span>
                        ))}
                        {order.packaging_fee > 0 && (
                          <span className="text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded">
                            Takeaway Packs ({order.packaging_quantity} × {formatNaira(order.packaging_unit_price || 300)})
                          </span>
                        )}
                      </div>

                      {order.address && (
                        <p className="text-[11px] text-stone-600 italic">
                          Delivery: {order.address}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-200">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] uppercase font-medium text-stone-400 block">Total Due</span>
                        <span className="font-bold text-stone-900 text-sm font-mono">
                          {formatNaira(order.total_amount ?? order.total)}
                        </span>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setSelectedPendingOrder(order)}
                      >
                        Review & Accept
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Receipts */}
      {showReceipt && completedOrder && (
        <ReceiptModal
          isOpen={showReceipt}
          mode="cashier"
          order={completedOrder}
          onClose={() => {
            setShowReceipt(false);
            setCompletedOrder(null);
          }}
        />
      )}

      {/* Incoming Order processing review */}
      {selectedPendingOrder && (
        <OrderAcceptanceModal
          isOpen={Boolean(selectedPendingOrder)}
          order={selectedPendingOrder}
          onAccept={async () => {
            try {
              await acceptOrder(Number(selectedPendingOrder.id));
              showToast(`Order accepted and sent to Kitchen!`, "success");
              setSelectedPendingOrder(null);
              fetchIncomingOrders();
            } catch (err: any) {
              showToast(err.message || "Failed to accept order", "error");
            }
          }}
          onReject={async () => {
            try {
              await rejectOrder(Number(selectedPendingOrder.id), 'Declined by cashier');
              showToast(`Order rejected and inventory restored.`, "info");
              setSelectedPendingOrder(null);
              fetchIncomingOrders();
            } catch (err: any) {
              showToast(err.message || "Failed to reject order", "error");
            }
          }}
          onClose={() => setSelectedPendingOrder(null)}
        />
      )}

      {/* Unlimited Past Orders Reprint Modal */}
      {showReprintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 max-w-4xl w-full flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50/70 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#8B1E1E]/10 flex items-center justify-center text-[#8B1E1E]">
                  <Printer size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Reprint Past Receipts</h3>
                  <p className="text-xs text-stone-500">
                    Search and reprint customer receipts for any past order at any time without limit.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReprintModal(false)}
                className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-lg transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter & Search Controls */}
            <div className="p-4 border-b border-stone-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white">
              {/* Search bar */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={15} />
                <input
                  type="text"
                  placeholder="Search by order #, customer, table..."
                  value={reprintSearchTerm}
                  onChange={(e) => setReprintSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#8B1E1E] focus:border-[#8B1E1E]"
                />
                {reprintSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setReprintSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Quick Filter buttons */}
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <div className="inline-flex p-0.5 rounded-lg bg-stone-100 border border-stone-200 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setReprintFilter("all")}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      reprintFilter === "all"
                        ? "bg-white text-stone-900 shadow-xs font-semibold"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    All Orders
                  </button>
                  <button
                    type="button"
                    onClick={() => setReprintFilter("today")}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      reprintFilter === "today"
                        ? "bg-white text-stone-900 shadow-xs font-semibold"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setReprintFilter("paid")}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      reprintFilter === "paid"
                        ? "bg-white text-stone-900 shadow-xs font-semibold"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    Paid
                  </button>
                </div>
                <button
                  type="button"
                  onClick={fetchPastOrders}
                  className="p-2 border border-stone-200 bg-stone-50 hover:bg-stone-100 rounded-lg text-stone-600 text-xs font-medium transition-colors"
                  title="Refresh orders list"
                >
                  Refresh
                </button>
              </div>
            </div>

            {/* Orders List / Table */}
            <div className="flex-1 overflow-y-auto min-h-[300px]">
              {loadingPastOrders ? (
                <div className="py-20 flex flex-col items-center justify-center">
                  <div className="w-7 h-7 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-xs text-stone-500 font-medium">Loading orders history...</p>
                </div>
              ) : filteredPastOrders.length === 0 ? (
                <div className="py-16 text-center text-stone-400">
                  <Printer size={36} className="mx-auto mb-2 text-stone-300" />
                  <p className="text-xs font-semibold text-stone-600">No matching orders found</p>
                  <p className="text-[11px] text-stone-400 mt-1">Try adjusting your search query or filter criteria.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-stone-50 border-b border-stone-200 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    <tr>
                      <th className="px-4 py-2.5">Order #</th>
                      <th className="px-4 py-2.5">Date & Time</th>
                      <th className="px-4 py-2.5">Customer / Table</th>
                      <th className="px-4 py-2.5">Items</th>
                      <th className="px-4 py-2.5">Amount</th>
                      <th className="px-4 py-2.5">Payment</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {filteredPastOrders.map((ord: any) => {
                      let dateStr = "—";
                      try {
                        const d = ord.createdAt?.toDate ? ord.createdAt.toDate() : new Date(String(ord.created_at || ord.createdAt).replace(/-/g, "/"));
                        dateStr = format(d, "MMM d, h:mm a");
                      } catch {
                        dateStr = String(ord.created_at || "");
                      }

                      const orderIdDisplay = ord.order_number || ord.orderNumber || ord.orderId || `#${ord.id}`;
                      const customerDisplay = ord.customer_name || ord.customerName || ord.guest_name || (ord.table_number ? `Table ${ord.table_number}` : "Counter Customer");
                      const itemsCount = ord.items?.length || 0;
                      const totalVal = Number(ord.total ?? ord.total_amount ?? 0);
                      const isPaid = (ord.payment_status || ord.paymentStatus) === "paid";
                      const pMethod = ord.payment_method || ord.paymentMethod || "cash";

                      return (
                        <tr key={ord.id} className="hover:bg-stone-50/80 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-stone-900">
                            {orderIdDisplay}
                          </td>
                          <td className="px-4 py-3 text-stone-500 whitespace-nowrap">
                            {dateStr}
                          </td>
                          <td className="px-4 py-3 font-medium text-stone-800">
                            <div>{customerDisplay}</div>
                            {ord.table_number && (
                              <span className="text-[10px] text-stone-400">Table {ord.table_number}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-stone-500">
                            <span className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-[11px] font-medium">
                              {itemsCount} {itemsCount === 1 ? "item" : "items"}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-stone-900 font-mono whitespace-nowrap">
                            {formatNaira(totalVal)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                isPaid
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {isPaid ? "Paid" : "Unpaid"} • {pMethod}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedReceiptOrder(ord)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#8B1E1E] hover:bg-[#721818] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                              title="Print or view receipt for this order"
                            >
                              <Printer size={13} />
                              <span>Reprint</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500 rounded-b-2xl">
              <span>Showing {filteredPastOrders.length} order{filteredPastOrders.length === 1 ? "" : "s"}</span>
              <button
                type="button"
                onClick={() => setShowReprintModal(false)}
                className="px-4 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Past Order Receipt Modal */}
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
