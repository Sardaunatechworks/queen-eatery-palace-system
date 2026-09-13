import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, User, MapPin, Mail, Phone, ShoppingBag, AlertCircle, CreditCard } from 'lucide-react';
import { formatNaira } from '../utils/format';
import { getOrder } from '../services/orderService';

interface Props {
  isOpen?: boolean;
  onClose: () => void;
  order: any | null;
  onConfirm?: (id: string, status: any) => void | Promise<void>;
  onAccept?: () => void | Promise<void>;
  onReject?: () => void | Promise<void>;
}

export const OrderAcceptanceModal: React.FC<Props> = ({
  isOpen,
  onClose,
  order,
  onConfirm,
  onAccept,
  onReject
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [orderDetails, setOrderDetails] = useState<any>(order);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    setOrderDetails(order);
    if (order?.id && (!order.items || order.items.length === 0)) {
      setLoadingDetails(true);
      getOrder(Number(order.id))
        .then((fullOrder) => {
          if (fullOrder) {
            setOrderDetails((prev: any) => ({ ...prev, ...fullOrder }));
          }
        })
        .catch((err) => {
          console.warn('Failed to load full order details in modal:', err);
        })
        .finally(() => {
          setLoadingDetails(false);
        });
    }
  }, [order]);

  // Modal is visible if isOpen is explicitly true, or defaulted to true when order is provided
  const visible = isOpen !== undefined ? isOpen : Boolean(order);

  if (!visible || !order) return null;

  const currentOrder = orderDetails || order;
  const orderNumber = currentOrder.orderId || currentOrder.order_number || `#${String(currentOrder.id).slice(0, 8)}`;
  const customerName = currentOrder.customerName || currentOrder.customer_name || 'Counter Customer';
  const customerPhone = currentOrder.customerPhone || currentOrder.customer_phone || currentOrder.phone || 'N/A';
  const customerEmail = currentOrder.customerEmail || currentOrder.customer_email || currentOrder.email || 'N/A';
  const deliveryType = currentOrder.deliveryType || currentOrder.order_type || 'takeaway';
  const deliveryAddress = currentOrder.address || currentOrder.delivery_address || '';
  const paymentStatus = currentOrder.paymentStatus || currentOrder.payment_status || 'pending';
  const paymentMethod = currentOrder.paymentMethod || currentOrder.payment_method || 'cash';
  const orderTotal = Number(currentOrder.total ?? currentOrder.total_amount ?? 0);
  const items = Array.isArray(currentOrder.items) ? currentOrder.items : [];

  const handleAcceptClick = async () => {
    setSubmitting(true);
    try {
      if (onAccept) {
        await onAccept();
      } else if (onConfirm) {
        await onConfirm(String(order.id), 'preparing');
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectClick = async () => {
    if (!window.confirm('Are you sure you want to reject this order and cancel it?')) {
      return;
    }
    setSubmitting(true);
    try {
      if (onReject) {
        await onReject();
      } else if (onConfirm) {
        await onConfirm(String(order.id), 'cancelled');
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border border-stone-200"
        >
          {/* Header */}
          <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/70">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                  {order.order_status || order.status || 'Pending Review'}
                </span>
                <span className="text-xs font-medium uppercase px-2 py-0.5 rounded bg-stone-200 text-stone-700">
                  {deliveryType}
                </span>
              </div>
              <h2 className="text-lg font-bold text-stone-900 tracking-tight mt-1">
                Order {orderNumber}
              </h2>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="p-1.5 bg-white hover:bg-stone-100 hover:text-stone-700 rounded-lg transition-colors text-stone-400 border border-stone-200 shadow-sm"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Table / Guest Information if QR table order */}
            {currentOrder.table_number ? (
              <div className="bg-[#FEF5F5] rounded-xl p-4 border border-[#F4C4C4] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#8B1A1A] text-white font-black text-sm tracking-wider shadow-xs border border-[#D4A017]/40">
                    <span className="text-[#D4A017]">✦</span>
                    <span>{currentOrder.table_number.toUpperCase()}</span>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#D4A017]/20 text-[#8B1A1A] border border-[#D4A017]/40 uppercase tracking-wider">
                    Dine-In Guest Order
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-medium">Guest Name</span>
                    <span className="font-semibold text-stone-900">{currentOrder.guest_name || customerName}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-medium">Payment Timing</span>
                    <span className="font-semibold text-stone-900 capitalize">
                      {currentOrder.payment_timing === 'before_meal' ? 'Pay Before Meal' : 'Pay After Meal'}
                    </span>
                  </div>
                  {currentOrder.notes && (
                    <div className="col-span-2">
                      <span className="text-stone-400 block text-[10px] uppercase font-medium">Guest Notes</span>
                      <p className="text-xs text-stone-800 italic bg-white p-2 rounded-md border border-stone-200 mt-0.5">
                        "{currentOrder.notes}"
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Regular Customer Information */
              <div className="bg-stone-50 rounded-xl p-4 border border-stone-200/70 space-y-2.5">
                <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                  <User size={13} /> Customer Information
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-medium">Customer Name</span>
                    <span className="font-semibold text-stone-800">{customerName}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-medium">Phone Number</span>
                    <span className="font-semibold text-stone-800 flex items-center gap-1">
                      <Phone size={11} className="text-stone-400" /> {customerPhone}
                    </span>
                  </div>
                  {customerEmail !== 'N/A' && (
                    <div className="col-span-2">
                      <span className="text-stone-400 block text-[10px] uppercase font-medium">Email</span>
                      <span className="font-semibold text-stone-800 flex items-center gap-1">
                        <Mail size={11} className="text-stone-400" /> {customerEmail}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Delivery Location if applicable */}
            {deliveryAddress && (
              <div className="bg-amber-50/60 rounded-xl p-4 border border-amber-200/70 space-y-1.5">
                <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin size={13} /> Delivery Address
                </h3>
                <p className="text-xs font-medium text-stone-800 leading-relaxed">
                  {deliveryAddress}
                </p>
              </div>
            )}

            {/* Order Items */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag size={13} /> Items Ordered ({items.length})
              </h3>
              <div className="bg-stone-50 rounded-xl border border-stone-200/70 divide-y divide-stone-100 overflow-hidden">
                {loadingDetails ? (
                  <div className="p-4 text-center text-xs text-stone-400 italic flex items-center justify-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
                    Loading items breakdown...
                  </div>
                ) : items.length === 0 ? (
                  <div className="p-4 text-center text-xs text-stone-400 italic">
                    Item details not included in list view. Total will be processed upon acceptance.
                  </div>
                ) : (
                  items.map((item: any, idx: number) => {
                    const itemName = item.item_name || item.name || 'Menu Item';
                    const itemQty = Number(item.quantity || 1);
                    const itemPrice = Number(item.unit_price ?? item.price ?? 0);
                    return (
                      <div key={idx} className="p-3 flex items-center justify-between bg-white text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded bg-stone-100 text-stone-800 font-bold flex items-center justify-center text-[11px]">
                            {itemQty}
                          </span>
                          <div>
                            <span className="font-medium text-stone-900 block">{itemName}</span>
                            {item.special_instructions && (
                              <span className="text-[10px] text-amber-700 italic block">
                                Note: {item.special_instructions}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-semibold text-stone-700">
                          {itemPrice > 0 ? formatNaira(itemPrice * itemQty) : '—'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Payment & Order Summary */}
            <div className="p-4 bg-stone-900 rounded-xl text-white flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider flex items-center gap-1">
                  <CreditCard size={11} /> {paymentMethod.toUpperCase()} • {paymentStatus.toUpperCase()}
                </span>
                <span className="text-xs text-stone-300">Total Payable</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-white">
                {formatNaira(orderTotal)}
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center gap-2.5">
            <button
              type="button"
              disabled={submitting}
              onClick={handleRejectClick}
              className="px-4 py-2.5 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Reject Order
            </button>
            <div className="flex-1" />
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Close
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleAcceptClick}
              className="px-5 py-2.5 rounded-lg bg-[#8B1E1E] text-white hover:bg-[#731919] text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle2 size={15} />
              )}
              Accept Order
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
