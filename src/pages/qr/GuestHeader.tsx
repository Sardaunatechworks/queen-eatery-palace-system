import React from 'react';
import { Utensils, ShoppingBag, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface GuestHeaderProps {
  tableNumber: string;
  tableLabel?: string | null;
  itemCount: number;
  onOpenCart: () => void;
  activeOrderToken?: string | null;
}

export const GuestHeader: React.FC<GuestHeaderProps> = ({
  tableNumber,
  tableLabel,
  itemCount,
  onOpenCart,
  activeOrderToken,
}) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 bg-[#2D1414]/95 backdrop-blur-md border-b border-[#3D1E1E] text-white px-4 py-3 shadow-md">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
        {/* Left: Brand & Table Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8B1A1A] to-[#6B1111] border border-[#D4A017]/40 flex items-center justify-center shadow-inner flex-shrink-0">
            <Utensils className="w-5 h-5 text-[#D4A017]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-serif font-bold text-sm tracking-wide text-white truncate">
                Queen's Palace
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#D4A017]/20 border border-[#D4A017]/40 text-[#D4A017] font-bold text-xs tracking-wider uppercase">
                {tableNumber}
              </span>
            </div>
            <p className="text-xs text-[#BFA59A] truncate">
              {tableLabel ? `${tableLabel} • Dine-In` : 'Dine-In Guest Ordering'}
            </p>
          </div>
        </div>

        {/* Right: Active Order Link & Cart Button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeOrderToken && (
            <button
              onClick={() => navigate(`/q/track/${activeOrderToken}`)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#3D1E1E] hover:bg-[#4A2222] text-[#D4A017] text-xs font-semibold border border-[#D4A017]/30 transition-colors"
              title="Track Active Order"
            >
              <Clock className="w-3.5 h-3.5 animate-pulse" />
              <span className="hidden sm:inline">Active</span>
            </button>
          )}

          <button
            onClick={onOpenCart}
            className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[#8B1A1A] hover:bg-[#A52B2B] text-white transition-all shadow-sm active:scale-95"
            aria-label="View Order Cart"
          >
            <ShoppingBag className="w-5 h-5 text-white" />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#D4A017] text-[#1C1C1C] text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow">
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
