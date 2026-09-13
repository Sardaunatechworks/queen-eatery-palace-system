import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  ChefHat,
  Bell,
  UtensilsCrossed,
  Sparkles,
  AlertTriangle,
  XCircle,
  CreditCard,
  Banknote,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { trackGuestOrder, cancelGuestOrder } from '../../services/qrGuestService';
import type { GuestTrackOrder } from '../../types';

export const GuestOrderTrackingPage: React.FC = () => {
  const { guestToken } = useParams<{ guestToken: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<GuestTrackOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // SEO & robots protection
  useEffect(() => {
    document.title = "Track Dine-In Order | Queen's Palace";
    let metaTag = document.querySelector('meta[name="robots"]');
    if (!metaTag) {
      metaTag = document.createElement('meta');
      metaTag.setAttribute('name', 'robots');
      document.head.appendChild(metaTag);
    }
    metaTag.setAttribute('content', 'noindex, nofollow');
  }, []);

  // Poll order status
  const loadOrder = async (showLoadingState = false) => {
    if (!guestToken) return;
    if (showLoadingState) setIsRefreshing(true);

    try {
      const data = await trackGuestOrder(guestToken);
      setOrder(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load order status');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrder();
    // Poll every 6 seconds while on this tracking page
    const interval = setInterval(() => {
      loadOrder(false);
    }, 6000);

    return () => clearInterval(interval);
  }, [guestToken]);

  const handleCancelOrder = async () => {
    if (!guestToken || !window.confirm('Are you sure you want to cancel this order?')) return;
    setIsCancelling(true);
    try {
      await cancelGuestOrder(guestToken);
      await loadOrder(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to cancel order');
    } finally {
      setIsCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-3 border-[#8B1A1A] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-serif text-[#8B1A1A] font-bold text-base tracking-wide">
          Locating Order...
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 mb-4 shadow-sm">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="font-serif font-bold text-xl text-[#1C1C1C] mb-2">Order Not Found</h2>
        <p className="text-sm text-gray-600 max-w-sm mb-6">
          {error || 'The requested order could not be located or has expired.'}
        </p>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-[#8B1A1A] text-white text-xs font-bold rounded-xl shadow-xs hover:bg-[#A52B2B]"
        >
          Return to Table
        </button>
      </div>
    );
  }

  // Steps definition for progress stepper
  const steps = [
    { key: 'submitted', label: 'Order Sent', sublabel: 'Cashier verifying', icon: Clock },
    { key: 'accepted', label: 'Accepted', sublabel: 'Sent to Kitchen', icon: CheckCircle2 },
    { key: 'preparing', label: 'Preparing', sublabel: 'Chefs cooking', icon: ChefHat },
    { key: 'ready', label: 'Ready', sublabel: 'Plated & ringing', icon: Bell },
    { key: 'served', label: 'Served', sublabel: 'At your table', icon: UtensilsCrossed },
    { key: 'completed', label: 'Completed', sublabel: 'Settled', icon: Sparkles },
  ];

  const statusOrder = ['submitted', 'accepted', 'preparing', 'ready', 'served', 'completed'];
  const currentStepIndex = statusOrder.indexOf(order.order_status);
  const isRejected = order.order_status === 'rejected';
  const isCancelled = order.order_status === 'cancelled';

  return (
    <div className="min-h-screen bg-[#F9F9F9] flex flex-col pb-16">
      {/* Top Bar */}
      <div className="bg-[#2D1414] text-white px-4 py-3 border-b border-[#3D1E1E] sticky top-0 z-20 shadow-md">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="p-1 rounded-lg text-[#BFA59A] hover:text-white hover:bg-[#3D1E1E] transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-sm text-white">
                  Order #{order.order_number}
                </span>
                <span className="px-2 py-0.2 rounded bg-[#D4A017] text-[#1C1C1C] text-[11px] font-black uppercase">
                  {order.table_number}
                </span>
              </div>
              <p className="text-[11px] text-[#BFA59A]">Guest: {order.guest_name}</p>
            </div>
          </div>

          <button
            onClick={() => loadOrder(true)}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-[#3D1E1E] hover:bg-[#4A2222] text-[#D4A017] transition-colors"
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <main className="max-w-xl mx-auto w-full px-4 pt-4 space-y-4 flex-1">
        {/* Status Alert Banner */}
        {isRejected ? (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 shadow-sm space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-sm text-red-700">
              <XCircle className="w-5 h-5" />
              <span>Order Could Not Be Accepted</span>
            </div>
            <p className="text-xs text-red-600">
              Reason: {order.rejection_reason || 'Item is temporarily unavailable.'}
            </p>
            <p className="text-[11px] text-gray-500 pt-1">
              Please speak with our staff or place another order from the menu.
            </p>
          </div>
        ) : isCancelled ? (
          <div className="p-4 rounded-2xl bg-gray-100 border border-gray-300 text-gray-700 shadow-sm flex items-center gap-3">
            <XCircle className="w-6 h-6 text-gray-500" />
            <div>
              <h4 className="font-bold text-sm">Order Cancelled</h4>
              <p className="text-xs text-gray-500">This order has been cancelled.</p>
            </div>
          </div>
        ) : (
          /* Live Progress Stepper Card */
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Live Kitchen Flow
                </span>
                <h3 className="font-serif font-bold text-base text-[#1C1C1C]">
                  {order.order_status === 'submitted' && 'Waiting for Cashier Acceptance'}
                  {order.order_status === 'accepted' && 'Accepted! Moving to Kitchen'}
                  {order.order_status === 'preparing' && 'Chefs are Cooking'}
                  {order.order_status === 'ready' && 'Your Meal is Ready!'}
                  {order.order_status === 'served' && 'Served at Your Table'}
                  {order.order_status === 'completed' && 'Order Completed'}
                </h3>
              </div>
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
            </div>

            {/* Stepper Timeline */}
            <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
              {steps.map((step, idx) => {
                const Icon = step.icon;
                const isPassed = currentStepIndex > idx;
                const isCurrent = currentStepIndex === idx;

                return (
                  <div key={step.key} className="relative flex items-start gap-3">
                    <div
                      className={`absolute -left-6 top-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        isPassed
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : isCurrent
                          ? 'bg-[#8B1A1A] text-[#D4A017] ring-4 ring-[#FEF5F5] shadow-sm'
                          : 'bg-gray-100 text-gray-400 border border-gray-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-bold leading-tight ${
                          isCurrent
                            ? 'text-[#8B1A1A] text-sm'
                            : isPassed
                            ? 'text-gray-800'
                            : 'text-gray-400'
                        }`}
                      >
                        {step.label}
                      </p>
                      <p className="text-[11px] text-gray-500">{step.sublabel}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Payment Timing Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#FEF5F5] border border-[#F4C4C4] flex items-center justify-center text-[#8B1A1A]">
                {order.payment_timing === 'before_meal' ? (
                  <CreditCard className="w-4 h-4" />
                ) : (
                  <Banknote className="w-4 h-4 text-[#D4A017]" />
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-[#1C1C1C]">
                  {order.payment_timing === 'before_meal'
                    ? 'Pay Now (Pre-Paid)'
                    : 'Pay After Meal (Post-Paid)'}
                </p>
                <p className="text-[11px] text-gray-500">
                  {order.payment_timing === 'before_meal'
                    ? 'Payment recorded prior to kitchen preparation.'
                    : 'Please settle with Cash, Card/POS or Transfer after eating.'}
                </p>
              </div>
            </div>

            <span
              className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                order.payment_status === 'paid'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}
            >
              {order.payment_status}
            </span>
          </div>
        </div>

        {/* Ordered Items Summary */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 pb-2 border-b border-gray-100">
            Order Summary ({order.items.length} {order.items.length === 1 ? 'item' : 'items'})
          </h4>

          <div className="divide-y divide-gray-100">
            {order.items.map((item, i) => (
              <div key={i} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-800">
                    <span className="text-[#8B1A1A] font-black mr-1">{item.quantity}x</span>
                    {item.item_name}
                  </p>
                  {item.notes && (
                    <p className="text-[11px] text-gray-500 italic mt-0.5">
                      Note: {item.notes}
                    </p>
                  )}
                </div>
                <span className="text-xs font-bold text-gray-800 whitespace-nowrap">
                  ₦{Number(item.subtotal).toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-gray-100 space-y-1 text-xs text-gray-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-semibold text-gray-800">
                ₦{Number(order.subtotal).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-emerald-700">
              <span>Dine-In Packaging</span>
              <span className="font-semibold">₦0 (Included)</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-[#1C1C1C] pt-2 border-t border-gray-200">
              <span>Total Bill</span>
              <span className="text-[#8B1A1A] text-base">
                ₦{Number(order.total).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          {order.can_cancel && order.order_status === 'submitted' && (
            <button
              onClick={handleCancelOrder}
              disabled={isCancelling}
              className="w-full py-2.5 px-4 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling Order...' : 'Cancel Order'}
            </button>
          )}

          <button
            onClick={() => navigate(-1)}
            className="w-full py-3 px-4 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs rounded-xl shadow-xs transition-colors"
          >
            ← Back to Table Menu
          </button>
        </div>
      </main>
    </div>
  );
};
