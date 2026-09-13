import React, { useState } from 'react';
import { X, Plus, Minus, Trash2, ShoppingBag, Clock, CreditCard, AlertCircle } from 'lucide-react';
import type { GuestMenuItem, GuestOrderSubmission } from '../../types';

export interface CartLineItem {
  item: GuestMenuItem;
  quantity: number;
  notes?: string;
}

interface GuestCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tableNumber: string;
  tableToken: string;
  cart: CartLineItem[];
  paymentPolicy?: 'customer_choice' | 'pay_first' | 'pay_after';
  onUpdateQuantity: (itemId: number, delta: number) => void;
  onUpdateNotes: (itemId: number, notes: string) => void;
  onRemoveItem: (itemId: number) => void;
  onClearCart: () => void;
  onSubmitOrder: (payload: GuestOrderSubmission) => Promise<void>;
  isSubmitting: boolean;
}

export const GuestCartDrawer: React.FC<GuestCartDrawerProps> = ({
  isOpen,
  onClose,
  tableNumber,
  tableToken,
  cart,
  paymentPolicy = 'customer_choice',
  onUpdateQuantity,
  onUpdateNotes,
  onRemoveItem,
  onSubmitOrder,
  isSubmitting,
}) => {
  const [guestName, setGuestName] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentTiming, setPaymentTiming] = useState<'after_meal' | 'before_meal'>(
    paymentPolicy === 'pay_first' ? 'before_meal' : 'after_meal'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const subtotal = cart.reduce((sum, item) => sum + item.item.price * item.quantity, 0);
  const total = subtotal; // ₦0 packaging for dine-in

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = guestName.trim();
    if (!trimmedName) {
      setErrorMsg('Please enter your name so our staff knows who to serve.');
      return;
    }

    if (cart.length === 0) {
      setErrorMsg('Your order cart is empty.');
      return;
    }

    // Generate unique idempotency key for this submission attempt
    const idempotencyToken = 'qr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

    try {
      await onSubmitOrder({
        table_token: tableToken,
        guest_name: trimmedName,
        notes: orderNotes.trim() || undefined,
        payment_timing: paymentPolicy === 'pay_first' ? 'before_meal' : paymentPolicy === 'pay_after' ? 'after_meal' : paymentTiming,
        items: cart.map((c) => ({
          menu_item_id: c.item.id,
          quantity: c.quantity,
          notes: c.notes?.trim() || undefined,
        })),
        idempotency_token: idempotencyToken,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to place order. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Drawer Header */}
          <div className="bg-[#2D1414] text-white p-4 border-b border-[#3D1E1E] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#8B1A1A] flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-[#D4A017]" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-base text-white">Your Table Order</h3>
                <div className="flex items-center gap-1.5 text-xs text-[#BFA59A]">
                  <span>Serving at</span>
                  <span className="font-bold text-[#D4A017] px-1.5 py-0.2 bg-[#3D1E1E] rounded">
                    {tableNumber}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#BFA59A] hover:text-white hover:bg-[#3D1E1E] transition-colors"
              aria-label="Close cart"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-red-700 text-xs animate-shake">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {cart.length === 0 ? (
              <div className="py-16 text-center text-gray-500">
                <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-gray-300 stroke-1" />
                <p className="font-medium text-sm">Your order is empty</p>
                <p className="text-xs text-gray-400 mt-1">
                  Add items from the menu to build your table order.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider pb-1 border-b border-gray-100">
                  <span>Selected Dishes ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
                  <span className="text-[#8B1A1A]">Dine-In</span>
                </div>

                {cart.map(({ item, quantity, notes }) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm text-[#1C1C1C] truncate">{item.name}</h4>
                        <p className="text-xs text-[#8B1A1A] font-bold">
                          ₦{Number(item.price).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 shadow-sm">
                        <button
                          onClick={() => onUpdateQuantity(item.id, -1)}
                          className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:bg-gray-100 active:scale-90"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-gray-800">
                          {quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(item.id, 1)}
                          className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:bg-gray-100 active:scale-90"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Add kitchen note (e.g. less spice)"
                        value={notes || ''}
                        onChange={(e) => onUpdateNotes(item.id, e.target.value)}
                        className="text-xs px-2 py-1 bg-white border border-gray-200 rounded-md text-gray-700 w-full focus:outline-none focus:border-[#8B1A1A]"
                      />
                      <button
                        onClick={() => onRemoveItem(item.id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <div className="pt-2 space-y-4">
                {/* Guest Information */}
                <div className="bg-[#FEF5F5] border border-[#F4C4C4] rounded-xl p-3.5 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#8B1A1A]">
                    Guest Details
                  </h4>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Your Name / Nickname <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Chief Adeleke, Blessing, or Table Lead"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#8B1A1A]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Order / Table Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Any general request for the server or cashier..."
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-[#8B1A1A] resize-none"
                    />
                  </div>
                </div>

                {/* Payment Timing Selection */}
                {paymentPolicy === 'customer_choice' && (
                  <div className="border border-gray-200 rounded-xl p-3.5 space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                      When would you like to pay?
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentTiming('after_meal')}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                          paymentTiming === 'after_meal'
                            ? 'bg-[#FEF5F5] border-[#8B1A1A] text-[#8B1A1A] ring-1 ring-[#8B1A1A]'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <Clock className="w-3.5 h-3.5 text-[#D4A017]" />
                          <span>Pay After Meal</span>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-snug">
                          Eat first, settle with Cash, Card/POS or Transfer.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentTiming('before_meal')}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                          paymentTiming === 'before_meal'
                            ? 'bg-[#FEF5F5] border-[#8B1A1A] text-[#8B1A1A] ring-1 ring-[#8B1A1A]'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <CreditCard className="w-3.5 h-3.5 text-[#8B1A1A]" />
                          <span>Pay Now</span>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-snug">
                          Pay immediately online before meal prep.
                        </p>
                      </button>
                    </div>
                  </div>
                )}

                {/* Dine-In Pricing Summary */}
                <div className="bg-gray-50 rounded-xl p-3.5 space-y-1.5 text-xs text-gray-600 border border-gray-100">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-semibold text-gray-800">
                      ₦{subtotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>Dine-In Packaging</span>
                    <span className="font-semibold">₦0 (Included)</span>
                  </div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-bold text-[#1C1C1C]">
                    <span>Total Bill</span>
                    <span className="text-[#8B1A1A] text-base">
                      ₦{total.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          {cart.length > 0 && (
            <div className="p-4 bg-white border-t border-gray-200 shadow-lg">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || cart.length === 0}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-[#8B1A1A] to-[#6B1111] hover:from-[#A52B2B] hover:to-[#8B1A1A] text-white font-bold text-sm rounded-xl shadow-md transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Sending to Cashier...</span>
                  </>
                ) : (
                  <>
                    <span>Send Order to Cashier • ₦{total.toLocaleString()}</span>
                  </>
                )}
              </button>
              <p className="text-center text-[11px] text-gray-400 mt-2">
                Orders are verified by the cashier before being sent to the kitchen.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
