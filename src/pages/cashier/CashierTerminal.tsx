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
  Bell,
  ChefHat,
  Package,
  Volume2,
  VolumeX,
  Volume1,
} from "lucide-react";
import { MenuItem } from "../admin/MenuManagement";
import { formatNaira } from "../../utils/format";
import { useUI } from "../../context/UIContext";
import { ReceiptModal } from "../../components/ReceiptModal";
import { OrderAcceptanceModal } from "../../components/OrderAcceptanceModal";
import { format } from "date-fns";
import { getMenuItems } from "../../services/menuService";
import { getActiveOrders, updateOrderStatus, createOrder, acceptOrder, rejectOrder, normalizeOrder } from "../../services/orderService";
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
  const [activeTab, setActiveTab] = useState<"pos" | "incoming">("pos");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<{ item: MenuItem; quantity: number }[]>([]);
  const [incomingOrders, setIncomingOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "paystack">("cash");
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

  const { setLoading: setGlobalLoading, showToast } = useUI();
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
  }, []);

  const handleCashierSSE = useCallback(
    (orders: any[]) => {
      processIncomingOrders(orders);
    },
    [processIncomingOrders]
  );

  useSSE({
    endpoint: "/sse/orders",
    eventName: "orders_update",
    onMessage: handleCashierSSE,
    fallbackPoll: fetchIncomingOrders,
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

        {/* Right Tools: Audio volume & search */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
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
                      >
                        <Minus size={11} className="text-stone-700" />
                      </button>
                      <span className="text-xs font-semibold text-stone-900 w-5 text-center font-mono">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-6 h-6 bg-stone-100 border border-stone-200 rounded flex items-center justify-center hover:bg-stone-200 transition-colors"
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
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={`h-9 border rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    paymentMethod === "cash"
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  <Wallet size={13} /> Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("paystack")}
                  className={`h-9 border rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    paymentMethod === "paystack"
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  <CreditCard size={13} /> Card / Transfer
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
    </div>
  );
};
