import React from "react";
import { X, CreditCard, ShieldCheck } from "lucide-react";
import { formatNaira } from "../utils/format";
import { Badge } from "./ui";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  amount: number;
  items: Array<{ name: string; quantity: number; price: number }>;
  isProcessing: boolean;
  packagingQuantity?: number;
  packagingUnitPrice?: number;
  packagingFee?: number;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  amount,
  items,
  isProcessing,
  packagingQuantity = 0,
  packagingUnitPrice = 300,
  packagingFee = 0,
}) => {
  if (!isOpen) return null;

  const totalItemsCount = items.reduce((acc, item) => acc + (item.quantity || 1), 0);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md bg-white rounded-xl border border-stone-200 shadow-xl overflow-hidden animate-scale-in flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-50 text-[#8B1E1E] flex items-center justify-center border border-red-100">
              <CreditCard size={16} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-stone-900 leading-tight">
                Review & Checkout
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">Complete your order payment</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Order Items Breakdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-stone-500 uppercase tracking-wider text-[10px]">
                Order Summary
              </span>
              <Badge variant="neutral" size="sm">
                {totalItemsCount} item{totalItemsCount === 1 ? "" : "s"}
              </Badge>
            </div>

            <div className="max-h-[160px] overflow-y-auto divide-y divide-stone-100 rounded-lg border border-stone-200 p-3 bg-stone-50/40">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span className="font-medium text-stone-900 truncate">{item.name}</span>
                    <span className="text-stone-400 text-[11px] font-mono shrink-0">
                      ×{item.quantity}
                    </span>
                  </div>
                  <span className="font-semibold text-stone-800 shrink-0">
                    {formatNaira(item.price * item.quantity)}
                  </span>
                </div>
              ))}

              {packagingFee > 0 && (
                <div className="flex items-center justify-between py-1.5 text-xs text-stone-700 bg-red-50/50 -mx-3 px-3 border-t border-stone-200/60 mt-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-[#8B1E1E]">Takeaway Packaging</span>
                    <span className="text-stone-400 text-[11px] font-mono shrink-0">
                      {packagingQuantity} × {formatNaira(packagingUnitPrice)}
                    </span>
                  </div>
                  <span className="font-bold text-[#8B1E1E] shrink-0">
                    {formatNaira(packagingFee)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Amount to Pay Box */}
          <div className="rounded-lg bg-stone-50 border border-stone-200 p-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-stone-500 uppercase tracking-wider text-[10px]">
                Total Amount Due
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                <ShieldCheck size={13} />
                <span>Verified</span>
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-bold text-stone-900 tracking-tight">
              {formatNaira(amount)}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-5 h-11 bg-stone-100 hover:bg-stone-200 active:bg-stone-300 text-stone-700 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={isProcessing}
              className="flex-1 h-11 bg-[#8B1E1E] hover:bg-[#701515] active:bg-[#591111] text-white rounded-lg text-xs font-semibold uppercase tracking-wider shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <CreditCard size={15} />
                  <span>Pay {formatNaira(amount)}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
