import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  MapPin,
  Utensils,
  CheckCircle2,
  X,
  Store,
  Bike,
  Package,
  ArrowRight,
  Clock,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { MenuItem } from "../admin/MenuManagement";
import { usePaystackPayment } from "react-paystack";
import { formatNaira } from "../../utils/format";
import { resolveMediaUrl } from "../../utils/media";
import { useUI } from "../../context/UIContext";
import { ReceiptModal } from "../../components/ReceiptModal";
import { PaymentModal } from "../../components/PaymentModal";
import { getMenuItems } from "../../services/menuService";
import { createOrder, verifyPayment } from "../../services/orderService";
import { PageHeader, Badge } from "../../components/ui";
import { SearchInput, TextArea } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import {
  getTakeawayPackPrice,
  calculatePackagingQuantity,
  calculatePackagingFee,
  calculateGrandTotal,
} from "../../services/pricingService";

const MenuCard = React.memo(
  ({ item, onAdd }: { item: MenuItem; onAdd: (item: MenuItem) => void }) => {
    const stock = item.quantity_available ?? item.stockQuantity ?? 0;
    const isAvailable = item.status === "available" && stock > 0;

    return (
      <div
        className={`bg-white rounded-lg border overflow-hidden flex flex-col justify-between transition-colors shadow-xs ${
          isAvailable ? "border-stone-200 hover:border-stone-300" : "border-stone-200 opacity-60"
        }`}
      >
        <div>
          <div className="relative aspect-[4/3] bg-stone-100 border-b border-stone-100 overflow-hidden">
            <img
              src={resolveMediaUrl(item.image_path || item.image) || "/queen-logo.png"}
              alt={item.name}
              className="w-full h-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <div className="absolute top-2.5 right-2.5">
              <Badge variant="neutral" size="sm">
                {item.category_name || item.category || "Meal"}
              </Badge>
            </div>
            {!isAvailable && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="bg-red-600 text-white font-medium text-xs px-2.5 py-1 rounded-md shadow-xs">
                  Sold Out
                </span>
              </div>
            )}
          </div>
          <div className="p-3.5 space-y-2">
            <div>
              <h3 className="font-medium text-stone-900 text-xs leading-snug line-clamp-2">
                {item.name}
              </h3>
              <p className="text-xs font-semibold text-stone-900 mt-1">{formatNaira(item.price)}</p>
            </div>
            <div className="text-[11px] text-stone-500">
              {isAvailable ? `${stock} available` : "Unavailable"}
            </div>
          </div>
        </div>

        <div className="p-3.5 pt-0">
          <Button
            variant={isAvailable ? "primary" : "secondary"}
            size="sm"
            fullWidth
            disabled={!isAvailable}
            icon={<Plus size={14} />}
            onClick={() => isAvailable && onAdd(item)}
          >
            {isAvailable ? "Add to Order" : "Unavailable"}
          </Button>
        </div>
      </div>
    );
  }
);

export const CustomerMenu: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<{ item: MenuItem; quantity: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliveryType, setDeliveryType] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState(profile?.address || "");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);

  const [showReceipt, setShowReceipt] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any>(null);
  const [paymentSuccessData, setPaymentSuccessData] = useState<{
    orderNumber: string;
    total: number;
    deliveryType: string;
    address?: string | null;
    itemCount: number;
  } | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [packUnitPrice, setPackUnitPrice] = useState<number>(300);

  const { setLoading: setGlobalLoading, showToast } = useUI();

  const categories = useMemo(() => {
    const rawCategories = menu
      .map((item) =>
        typeof item.category_name === "string"
          ? item.category_name.trim()
          : typeof item.category === "string"
          ? item.category.trim()
          : ""
      )
      .filter((cat): cat is string => cat.length > 0);
    const cats = Array.from(new Set(rawCategories));
    return ["All", ...cats];
  }, [menu]);

  const fetchMenu = async () => {
    try {
      const response = await getMenuItems({ per_page: 200 });
      if (response.items) {
        setMenu(response.items);
      }
    } catch (error) {
      console.error("Failed to load menu", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
    getTakeawayPackPrice().then((price) => setPackUnitPrice(price));
  }, []);

  const filteredMenu = useMemo(() => {
    return menu.filter((item) => {
      const cat = item.category_name || item.category || "";
      const matchesCategory = categoryFilter === "All" || cat === categoryFilter;
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const isApproved =
        (item.status as string) === "approved" ||
        item.approval_status === "approved" ||
        item.status === "available";
      return matchesCategory && matchesSearch && isApproved;
    });
  }, [menu, categoryFilter, searchTerm]);

  const addToCart = React.useCallback(
    (item: MenuItem) => {
      setCart((prev) => {
        const existing = prev.find((i) => i.item.id === item.id);
        const currentQty = existing ? existing.quantity : 0;
        const availableStock = item.quantity_available ?? item.stockQuantity ?? 0;

        if (currentQty >= availableStock) {
          showToast("Stock limit reached.", "error");
          return prev;
        }

        if (existing) {
          return prev.map((i) => (i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
        }
        return [...prev, { item, quantity: 1 }];
      });
      showToast(`${item.name} added to cart`, "info");
    },
    [showToast]
  );

  const updateQuantity = (id: string | number, delta: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.item.id === id) {
          const itemInMenu = menu.find((m) => m.id === id);
          const availableStock = itemInMenu
            ? itemInMenu.quantity_available ?? itemInMenu.stockQuantity ?? 0
            : 999;
          const newQ = i.quantity + delta;
          if (delta > 0 && newQ > availableStock) return i;
          return newQ > 0 ? { ...i, quantity: newQ } : i;
        }
        return i;
      })
    );
  };

  const removeFromCart = (id: string | number) => {
    setCart((prev) => prev.filter((i) => i.item.id !== id));
  };

  const foodSubtotal = cart.reduce((sum, i) => sum + i.item.price * i.quantity, 0);
  const packagingQuantity = calculatePackagingQuantity(cart);
  const packagingFee = calculatePackagingFee(packagingQuantity, packUnitPrice);
  const grandTotal = calculateGrandTotal(foodSubtotal, packagingFee);

  const config = {
    reference: new Date().getTime().toString(),
    email: profile?.email || "customer@example.com",
    amount: Math.round(grandTotal * 100),
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "",
  };

  const initializePayment = usePaystackPayment(config);

  const handleConfirmedPayment = async () => {
    setIsProcessing(true);
    setGlobalLoading(true);
    try {
      // 1. Create order on the backend
      const orderResult = await createOrder({
        items: cart.map((i) => ({ menu_item_id: i.item.id, quantity: i.quantity })),
        order_type: deliveryType as any,
        payment_method: "paystack",
        packaging_quantity: packagingQuantity,
        delivery_address: deliveryType === "delivery" ? address : "",
      });

      const orderId = orderResult.id;
      const orderNumber = orderResult.orderNumber;

      // 2. Launch Paystack Checkout
      initializePayment({
        onSuccess: async (response: any) => {
          try {
            // 3. Verify payment on backend
            const verifyRes = await verifyPayment({
              reference: response.reference,
              order_id: orderId,
            });

            if (verifyRes.payment_status === "paid") {
              setCompletedOrder({
                id: response.reference,
                orderId: orderNumber,
                customerName: profile?.name || "Customer",
                customerEmail: profile?.email || "N/A",
                customerPhone: profile?.phone || "N/A",
                items: cart.map((i) => ({
                  id: i.item.id,
                  name: i.item.name,
                  price: i.item.price,
                  quantity: i.quantity,
                })),
                subtotal: foodSubtotal,
                packaging_quantity: packagingQuantity,
                packaging_unit_price: packUnitPrice,
                packaging_fee: packagingFee,
                total: grandTotal,
                deliveryType,
                address: deliveryType === "delivery" ? address : null,
                paymentStatus: "paid",
                createdAt: new Date().toISOString(),
              });
              setPaymentSuccessData({
                orderNumber: orderNumber,
                total: grandTotal,
                deliveryType,
                address: deliveryType === "delivery" ? address : null,
                itemCount: cart.reduce((sum, i) => sum + i.quantity, 0),
              });
              setCart([]);
              setShowReceipt(false);
              setIsCartOpen(false);
              setIsPaymentModalOpen(false);
              showToast("Payment verified! Your order is waiting for restaurant confirmation.", "success");
              fetchMenu();
            } else {
              showToast("Payment verification failed", "error");
            }
          } catch (err: any) {
            showToast(err.message || "Verification failed.", "error");
          } finally {
            setIsProcessing(false);
            setGlobalLoading(false);
          }
        },
        onClose: () => {
          setIsProcessing(false);
          setGlobalLoading(false);
          showToast("Payment cancelled.", "info");
        },
      });
    } catch (err: any) {
      showToast(err.message || "Checkout failed", "error");
      setIsProcessing(false);
      setGlobalLoading(false);
    }
  };

  const handleCheckout = () => {
    if (cart.length === 0 || isProcessing) return;
    if (deliveryType === "delivery" && !address) {
      showToast("Delivery address is required.", "error");
      return;
    }
    setIsPaymentModalOpen(true);
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center bg-white rounded-lg border border-stone-200">
        <div className="w-7 h-7 border-2 border-[#8B1E1E] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-stone-500 font-medium">Loading restaurant catalog...</p>
      </div>
    );
  }

  const renderCartContent = (isModal = false) => {
    const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

    return (
      <div className="bg-white flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-50 text-[#8B1E1E] flex items-center justify-center border border-red-100 shrink-0">
              <ShoppingCart size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-stone-900 leading-tight">
                Your Order Tray
              </h2>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {totalItems} {totalItems === 1 ? "item" : "items"} selected
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-[11px] font-medium text-stone-400 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-stone-100 cursor-pointer"
                title="Clear tray"
              >
                Clear
              </button>
            )}
            {isModal && (
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                title="Close tray"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Cart Items List */}
        <div className="overflow-y-auto max-h-[280px] p-4 space-y-3 divide-y divide-stone-100">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 px-4">
              <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 mb-2 border border-stone-200">
                <ShoppingCart size={20} />
              </div>
              <p className="text-xs font-semibold text-stone-800">Your tray is empty</p>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Browse our menu and tap "Add to Order"
              </p>
            </div>
          ) : (
            cart.map((i, idx) => (
              <div
                key={i.item?.id ? `cart-${i.item.id}` : `cart-item-${idx}`}
                className="pt-3 first:pt-0 flex items-center gap-3"
              >
                {/* Dish image thumbnail */}
                <div className="w-12 h-12 rounded-lg bg-stone-100 border border-stone-200 overflow-hidden shrink-0">
                  <img
                    src={resolveMediaUrl(i.item.image_path || i.item.image) || "/queen-logo.png"}
                    alt={i.item.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                {/* Dish details */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-xs text-stone-900 truncate leading-snug">
                    {i.item.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-stone-500 font-mono">
                      {formatNaira(i.item.price)} each
                    </span>
                  </div>
                  <div className="text-xs font-bold text-[#8B1E1E] mt-0.5 font-mono">
                    {formatNaira(i.item.price * i.quantity)}
                  </div>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <div className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                    <button
                      type="button"
                      onClick={() => updateQuantity(i.item.id, -1)}
                      className="w-6 h-6 rounded-md hover:bg-white text-stone-600 hover:text-stone-900 flex items-center justify-center transition-colors cursor-pointer"
                      title="Decrease quantity"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="w-6 text-center text-xs font-semibold font-mono text-stone-900">
                      {i.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(i.item.id, 1)}
                      className="w-6 h-6 rounded-md hover:bg-white text-stone-600 hover:text-stone-900 flex items-center justify-center transition-colors cursor-pointer"
                      title="Increase quantity"
                    >
                      <Plus size={11} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFromCart(i.item.id)}
                    className="w-7 h-7 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                    title="Remove item"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Fulfillment & Checkout Footer */}
        <div className="p-4 border-t border-stone-200 space-y-3.5 bg-stone-50/60">
          {/* Fulfillment Toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-stone-500">
              <span>Fulfillment Method</span>
              <span className="text-[11px] font-medium text-emerald-700 normal-case">
                {deliveryType === "pickup" ? "Counter pickup" : "Local delivery"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-200/70 rounded-lg border border-stone-200">
              <button
                type="button"
                className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  deliveryType === "pickup"
                    ? "bg-white text-stone-900 shadow-xs font-semibold"
                    : "text-stone-600 hover:text-stone-900"
                }`}
                onClick={() => setDeliveryType("pickup")}
              >
                <Store size={13} />
                <span>Counter Pickup</span>
              </button>
              <button
                type="button"
                className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  deliveryType === "delivery"
                    ? "bg-white text-stone-900 shadow-xs font-semibold"
                    : "text-stone-600 hover:text-stone-900"
                }`}
                onClick={() => setDeliveryType("delivery")}
              >
                <Bike size={13} />
                <span>Doorstep Delivery</span>
              </button>
            </div>

            {deliveryType === "delivery" && (
              <div className="space-y-1.5 pt-1">
                <TextArea
                  placeholder="Enter delivery address in Dutse..."
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
                <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                  <MapPin size={12} className="text-[#8B1E1E] shrink-0" />
                  <span>Delivery fare settled upon arrival in Dutse</span>
                </div>
              </div>
            )}
          </div>

          {/* Pricing Breakdown */}
          <div className="pt-2 border-t border-stone-200 space-y-1.5 text-xs">
            <div className="flex justify-between text-stone-500">
              <span>Food Subtotal ({totalItems} {totalItems === 1 ? "item" : "items"})</span>
              <span className="font-semibold text-stone-800 font-mono">{formatNaira(foodSubtotal)}</span>
            </div>

            {/* Takeaway Packaging breakdown */}
            <div className="flex justify-between text-stone-600">
              <div className="flex items-center gap-1.5">
                <Package size={13} className="text-[#8B1E1E]" />
                <span>
                  Packaging ({packagingQuantity} × {formatNaira(packUnitPrice)})
                </span>
              </div>
              <span className="font-semibold text-stone-800 font-mono">
                {formatNaira(packagingFee)}
              </span>
            </div>

            <div className="flex justify-between text-stone-500 text-[11px]">
              <span>Delivery Fee</span>
              <span className="font-medium text-emerald-700">
                {deliveryType === "pickup" ? "Free (Pickup)" : "Paid on Arrival"}
              </span>
            </div>
            <div className="flex justify-between items-baseline pt-2 border-t border-stone-200">
              <span className="font-semibold text-stone-900 text-sm">Total Due</span>
              <span className="text-xl font-bold text-[#8B1E1E] font-mono tracking-tight">
                {formatNaira(grandTotal)}
              </span>
            </div>
          </div>

          {/* Checkout Button */}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={cart.length === 0 || isProcessing}
            loading={isProcessing}
            onClick={handleCheckout}
            icon={<ArrowRight size={15} />}
          >
            {isProcessing ? "Processing..." : `Proceed to Checkout • ${formatNaira(grandTotal)}`}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eatery Menu"
        description="Select fresh meals, soups, beverages, and desserts for counter pickup or local delivery in Dutse."
      />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Catalog Main Content */}
        <div className="flex-1 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="w-full sm:w-72">
              <SearchInput
                placeholder="Search delicacies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClear={() => setSearchTerm("")}
              />
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {categories.map((cat, idx) => (
                <button
                  key={`cat-${cat}-${idx}`}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                    categoryFilter === cat
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {filteredMenu.length === 0 ? (
            <div className="py-20 text-center border border-dashed border-stone-300 rounded-lg bg-white p-6">
              <Utensils size={36} className="mx-auto text-stone-300 mb-2" />
              <p className="text-stone-700 font-medium text-xs">
                {menu.length === 0
                  ? "Our kitchen is preparing the fresh daily menu. Please check back shortly!"
                  : "No matching dishes found"}
              </p>
              <p className="text-stone-400 text-[11px] mt-0.5">
                {menu.length === 0
                  ? "For special orders or inquiries, reach out on WhatsApp"
                  : "Try clearing your search or selecting a different category"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredMenu.map((item, idx) => (
                <MenuCard
                  key={item.id ? `menu-item-${item.id}` : `menu-card-${idx}`}
                  item={item}
                  onAdd={addToCart}
                />
              ))}
            </div>
          )}
        </div>

        {/* Desktop Sticky Cart Sidebar */}
        <div className="hidden lg:block w-[360px] shrink-0">
          <div className="sticky top-20 bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            {renderCartContent(false)}
          </div>
        </div>
      </div>

      {/* Floating Mobile Cart trigger */}
      {cart.length > 0 && !isCartOpen && (
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-6 right-6 z-40 lg:hidden bg-[#8B1E1E] text-white px-5 py-3 rounded-full shadow-lg font-medium text-xs flex items-center gap-2 hover:bg-[#701515] transition-colors cursor-pointer"
        >
          <ShoppingCart size={16} />
          <span>Checkout Tray ({cart.reduce((a, c) => a + c.quantity, 0)})</span>
        </button>
      )}

      {/* Responsive Cart Modal / Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsCartOpen(false)}
          />
          <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
            {renderCartContent(true)}
          </div>
        </div>
      )}

      <ReceiptModal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        order={completedOrder}
        mode="customer"
      />
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onConfirm={handleConfirmedPayment}
        amount={grandTotal}
        items={cart.map((i) => ({
          name: i.item.name,
          quantity: i.quantity,
          price: i.item.price,
        }))}
        packagingQuantity={packagingQuantity}
        packagingUnitPrice={packUnitPrice}
        packagingFee={packagingFee}
        isProcessing={isProcessing}
      />

      {/* Payment Successful / Waiting for Restaurant Confirmation Modal */}
      {paymentSuccessData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setPaymentSuccessData(null)}
          />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden animate-scale-in p-6 z-10">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-4 shadow-xs">
                <CheckCircle2 size={32} />
              </div>

              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 mb-2">
                <ShieldCheck size={12} />
                Payment Verified & Paid
              </span>

              <h2 className="text-xl font-bold text-stone-900 tracking-tight">
                Order Received!
              </h2>
              <p className="text-xs text-stone-600 mt-1 max-w-xs">
                Your payment has been confirmed and sent to our cashier desk for review & acceptance.
              </p>

              {/* Order Info Card */}
              <div className="w-full bg-stone-50 border border-stone-200 rounded-xl p-4 my-5 text-left space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500">Order Number</span>
                  <span className="font-mono font-bold text-stone-900">
                    #{paymentSuccessData.orderNumber}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500">Amount Paid</span>
                  <span className="font-bold text-stone-900">
                    {formatNaira(paymentSuccessData.total)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500">Fulfillment</span>
                  <span className="font-medium text-stone-800 capitalize">
                    {paymentSuccessData.deliveryType}
                  </span>
                </div>
                {paymentSuccessData.address && (
                  <div className="flex items-start justify-between text-xs pt-1 border-t border-stone-200">
                    <span className="text-stone-500 shrink-0">Address</span>
                    <span className="font-medium text-stone-800 text-right truncate max-w-[200px]">
                      {paymentSuccessData.address}
                    </span>
                  </div>
                )}

                {/* Live Status indicator */}
                <div className="mt-3 pt-3 border-t border-dashed border-stone-300 flex items-start gap-2.5 bg-amber-50/90 -mx-1 p-2.5 rounded-lg border border-amber-200/60">
                  <Clock size={16} className="text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                  <div className="text-left">
                    <p className="text-xs font-semibold text-amber-900">
                      Waiting for Restaurant Confirmation
                    </p>
                    <p className="text-[11px] text-amber-800/90 leading-relaxed mt-0.5">
                      The cashier has been notified. As soon as your order is confirmed, the kitchen will begin meal preparation.
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="w-full space-y-2">
                <Button
                  className="w-full justify-center bg-[#8B1E1E] hover:bg-[#701515] text-white py-2.5 flex items-center gap-2 text-sm font-semibold"
                  onClick={() => {
                    setPaymentSuccessData(null);
                    navigate("/customer/orders");
                  }}
                >
                  <span>Track Live Order</span>
                  <ArrowRight size={16} />
                </Button>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReceipt(true);
                    }}
                    className="flex-1 py-2 px-3 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Receipt size={14} />
                    <span>View Receipt</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentSuccessData(null)}
                    className="flex-1 py-2 px-3 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-600 text-xs font-medium flex items-center justify-center transition-colors cursor-pointer"
                  >
                    Back to Menu
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
