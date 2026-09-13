import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  Minus,
  Utensils,
  AlertCircle,
  Clock,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';
import { getGuestMenu, submitGuestOrder } from '../../services/qrGuestService';
import type { GuestMenuResponse, GuestMenuItem, GuestOrderSubmission } from '../../types';
import { GuestHeader } from './GuestHeader';
import { GuestCartDrawer, CartLineItem } from './GuestCartDrawer';

export const GuestMenuPage: React.FC = () => {
  const { tableToken } = useParams<{ tableToken: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuData, setMenuData] = useState<GuestMenuResponse | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartLineItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active tracked order if previously placed in this session
  const [activeOrderToken, setActiveOrderToken] = useState<string | null>(null);

  // Invalidate web crawlers and set page title
  useEffect(() => {
    document.title = "Dine-In Table Menu | Queen's Palace";
    let metaTag = document.querySelector('meta[name="robots"]');
    if (!metaTag) {
      metaTag = document.createElement('meta');
      metaTag.setAttribute('name', 'robots');
      document.head.appendChild(metaTag);
    }
    metaTag.setAttribute('content', 'noindex, nofollow');

    const savedToken = sessionStorage.getItem('qep_active_guest_token');
    if (savedToken) {
      setActiveOrderToken(savedToken);
    }
  }, []);

  // Fetch Menu for Table
  useEffect(() => {
    if (!tableToken || tableToken.startsWith(':') || tableToken === 'token' || tableToken === 'tableToken') {
      setError('Please scan a valid table QR code from your table stand, or launch a table link from the Admin Table Management portal.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getGuestMenu(tableToken)
      .then((data) => {
        if (!isMounted) return;
        setMenuData(data);
        if (!data.table.ordering_enabled) {
          setError('Ordering is currently disabled for this table. Please contact our restaurant staff.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || 'Invalid or disabled table QR code.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [tableToken]);

  // Cart operations
  const handleAddToCart = (item: GuestMenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (itemId: number, delta: number) => {
    setCart((prev) => {
      return prev
        .map((c) => {
          if (c.item.id === itemId) {
            const nextQty = c.quantity + delta;
            return nextQty > 0 ? { ...c, quantity: nextQty } : null;
          }
          return c;
        })
        .filter(Boolean) as CartLineItem[];
    });
  };

  const handleUpdateNotes = (itemId: number, notes: string) => {
    setCart((prev) =>
      prev.map((c) => (c.item.id === itemId ? { ...c, notes } : c))
    );
  };

  const handleRemoveItem = (itemId: number) => {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Submit table order
  const handleSubmitOrder = async (payload: GuestOrderSubmission) => {
    setIsSubmitting(true);
    try {
      const res = await submitGuestOrder(payload);
      // Save active order token in session
      sessionStorage.setItem('qep_active_guest_token', res.guest_access_token);
      setCart([]);
      setIsCartOpen(false);
      navigate(`/q/track/${res.guest_access_token}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter menu items
  const filteredItems = useMemo(() => {
    if (!menuData?.menu) return [];
    let items = menuData.menu;

    if (selectedCategory !== 'all') {
      items = items.filter((item) => item.category_id === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q))
      );
    }

    return items;
  }, [menuData, selectedCategory, searchQuery]);

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartAmount = cart.reduce((sum, item) => sum + item.item.price * item.quantity, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-3 border-[#8B1A1A] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-serif text-[#8B1A1A] font-bold text-base tracking-wide">
          Connecting to Table...
        </p>
        <p className="text-xs text-gray-500 mt-1">Queen's Palace Eatery & Event Hall</p>
      </div>
    );
  }

  if (error || !menuData) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 mb-4 shadow-sm">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="font-serif font-bold text-xl text-[#1C1C1C] mb-2">
          Table Service Notice
        </h2>
        <p className="text-sm text-gray-600 max-w-sm mb-6 leading-relaxed">
          {error || 'Unable to access the table ordering menu. Please confirm the table QR code.'}
        </p>
        <div className="p-4 rounded-xl bg-white border border-gray-200 text-xs text-gray-500 max-w-sm w-full text-left space-y-1.5 shadow-sm">
          <p className="font-bold text-gray-700 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#D4A017]" />
            What should I do?
          </p>
          <p>• Please wave or call one of our friendly floor servers.</p>
          <p>• Our staff can assist you directly with table ordering or POS service.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9] flex flex-col pb-28">
      {/* Table & Brand Header */}
      <GuestHeader
        tableNumber={menuData.table.table_number}
        tableLabel={menuData.table.label}
        itemCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        activeOrderToken={activeOrderToken}
      />

      <main className="max-w-3xl mx-auto w-full px-4 pt-4 flex-1">
        {/* Welcome Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-[#2D1414] via-[#4A1E1E] to-[#6B1111] p-4 text-white shadow-md mb-4 border border-[#D4A017]/20 relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-full bg-[#D4A017] text-[#1C1C1C] text-[10px] font-black uppercase tracking-wider">
                Dine-In Table Service
              </span>
              <span className="text-xs text-[#D4A017] font-semibold">
                No Packaging Fees
              </span>
            </div>
            <h1 className="font-serif font-bold text-lg sm:text-xl text-white">
              Welcome to {menuData.table.table_number}
            </h1>
            <p className="text-xs text-[#E8D5CC] mt-0.5 max-w-lg">
              Select dishes, customize notes, and place your order directly. Settle your bill comfortably before or after your meal.
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search our delicious menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 focus:outline-none focus:border-[#8B1A1A] shadow-xs"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none mb-4">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-[#8B1A1A] text-white shadow-xs'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            All Dishes ({menuData.menu.length})
          </button>
          {menuData.categories.map((cat) => {
            const count = menuData.menu.filter((m) => m.category_id === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${
                  selectedCategory === cat.id
                    ? 'bg-[#8B1A1A] text-white shadow-xs'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Menu Grid */}
        {filteredItems.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-gray-200 p-8 shadow-xs">
            <Utensils className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="font-semibold text-sm text-gray-700">No dishes found</p>
            <p className="text-xs text-gray-400 mt-1">Try another search or filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredItems.map((dish) => {
              const inCart = cart.find((c) => c.item.id === dish.id);
              return (
                <div
                  key={dish.id}
                  className="bg-white rounded-2xl border border-gray-200/80 p-3 shadow-xs hover:shadow-md transition-all flex gap-3 relative group"
                >
                  {/* Dish Thumbnail */}
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-gray-100 border border-gray-200 flex-shrink-0 overflow-hidden relative">
                    {dish.image_url ? (
                      <img
                        src={dish.image_url}
                        alt={dish.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                        <Utensils className="w-6 h-6 stroke-1" />
                        <span className="text-[9px] uppercase font-bold mt-1 text-gray-300">
                          Royal Plate
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Dish Content */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <h3 className="font-bold text-xs sm:text-sm text-[#1C1C1C] leading-snug line-clamp-1">
                          {dish.name}
                        </h3>
                      </div>
                      {dish.description && (
                        <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5 leading-relaxed">
                          {dish.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100">
                      <span className="font-extrabold text-xs sm:text-sm text-[#8B1A1A]">
                        ₦{Number(dish.price).toLocaleString()}
                      </span>

                      {inCart ? (
                        <div className="flex items-center gap-1.5 bg-[#FEF5F5] border border-[#F4C4C4] rounded-lg p-0.5">
                          <button
                            onClick={() => handleUpdateQuantity(dish.id, -1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-[#8B1A1A] hover:bg-white active:scale-90"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-5 text-center text-xs font-black text-[#8B1A1A]">
                            {inCart.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateQuantity(dish.id, 1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-[#8B1A1A] hover:bg-white active:scale-90"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAddToCart(dish)}
                          className="px-3 py-1.5 rounded-lg bg-[#8B1A1A] hover:bg-[#A52B2B] text-white text-xs font-bold transition-transform active:scale-95 flex items-center gap-1 shadow-xs"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-4 inset-x-0 z-30 px-4">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => setIsCartOpen(true)}
              className="w-full bg-gradient-to-r from-[#8B1A1A] via-[#A52B2B] to-[#6B1111] text-white p-3.5 rounded-2xl shadow-xl border border-[#D4A017]/30 flex items-center justify-between hover:opacity-95 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4 text-[#D4A017]" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold leading-tight">
                    {totalCartCount} {totalCartCount === 1 ? 'dish' : 'dishes'} added
                  </p>
                  <p className="text-[11px] text-[#FFEDB3]">
                    Table {menuData.table.table_number} • Dine-In
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base">
                  ₦{totalCartAmount.toLocaleString()}
                </span>
                <span className="text-xs bg-[#D4A017] text-[#1C1C1C] px-2.5 py-1 rounded-lg font-bold shadow-xs">
                  Review Order →
                </span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Slide-Up Cart Drawer */}
      <GuestCartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        tableNumber={menuData.table.table_number}
        tableToken={tableToken!}
        cart={cart}
        paymentPolicy={menuData.settings?.payment_policy}
        onUpdateQuantity={handleUpdateQuantity}
        onUpdateNotes={handleUpdateNotes}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        onSubmitOrder={handleSubmitOrder}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
