import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { X, Printer, Download, Sparkles, RefreshCw, Utensils, ExternalLink } from 'lucide-react';
import type { RestaurantTable } from '../types';

interface TableQrCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: RestaurantTable | null;
  onRegenerateToken?: (tableId: number) => Promise<void>;
  isRegenerating?: boolean;
}

export const TableQrCardModal: React.FC<TableQrCardModalProps> = ({
  isOpen,
  onClose,
  table,
  onRegenerateToken,
  isRegenerating = false,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !table) return null;

  // Construct table URL
  const origin = window.location.origin;
  const tableUrl = `${origin}/q/${table.qr_code_token}`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPng = () => {
    const canvas = document.getElementById('table-qr-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const pngUrl = canvas.toDataURL('image/png');
    const downloadLink = document.createElement('a');
    downloadLink.href = pngUrl;
    downloadLink.download = `${table.table_number.replace(/\s+/g, '_')}_QR.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-200">
        {/* Modal Action Bar (Hidden in Print) */}
        <div className="bg-[#2D1414] text-white px-5 py-3.5 flex items-center justify-between border-b border-[#3D1E1E] print:hidden">
          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4 text-[#D4A017]" />
            <h3 className="font-serif font-bold text-sm text-white">
              Table QR Flyer & Stand Card
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#BFA59A] hover:text-white hover:bg-[#3D1E1E] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Royal Table Card Area */}
        <div className="p-6 bg-gray-50 flex justify-center print:p-0 print:bg-white">
          <div
            ref={printRef}
            id="printable-table-card"
            className="w-full max-w-sm bg-gradient-to-b from-[#2D1414] via-[#4A1E1E] to-[#2D1414] text-white rounded-3xl p-6 shadow-xl border-4 border-[#D4A017] text-center relative overflow-hidden print:shadow-none print:max-w-none print:w-full print:rounded-none"
          >
            {/* Corner Ornamental Accents */}
            <div className="absolute top-2 left-2 text-[#D4A017]/40 text-xs font-serif">✦</div>
            <div className="absolute top-2 right-2 text-[#D4A017]/40 text-xs font-serif">✦</div>
            <div className="absolute bottom-2 left-2 text-[#D4A017]/40 text-xs font-serif">✦</div>
            <div className="absolute bottom-2 right-2 text-[#D4A017]/40 text-xs font-serif">✦</div>

            {/* Brand Header */}
            <div className="space-y-1 mb-4">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#8B1A1A] border-2 border-[#D4A017] shadow-inner mb-1">
                <Utensils className="w-5 h-5 text-[#D4A017]" />
              </div>
              <h2 className="font-serif font-bold text-sm tracking-widest text-[#FFF7DF] uppercase">
                Queen's Palace
              </h2>
              <p className="text-[10px] tracking-wider text-[#D4A017] uppercase font-semibold">
                Eatery & Event Hall
              </p>
            </div>

            {/* Table Identification */}
            <div className="bg-[#8B1A1A]/90 border border-[#D4A017]/50 rounded-2xl py-2 px-4 mb-5 shadow-inner">
              <h1 className="font-serif font-black text-2xl tracking-wider text-white uppercase">
                {table.table_number}
              </h1>
              {table.label && (
                <p className="text-xs text-[#FFEDB3] font-medium mt-0.5">
                  {table.label}
                </p>
              )}
            </div>

            {/* QR Code Container */}
            <div className="bg-white p-4 rounded-2xl inline-block shadow-lg border-2 border-[#D4A017]/60 mb-4">
              <QRCodeCanvas
                id="table-qr-canvas"
                value={tableUrl}
                size={190}
                level="H"
                includeMargin={true}
              />
            </div>

            {/* Instructions */}
            <div className="space-y-1.5 text-xs text-[#E8D5CC] mb-4">
              <p className="font-bold text-[#D4A017] uppercase tracking-wide text-[11px] flex items-center justify-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Scan with your phone camera
              </p>
              <div className="flex items-center justify-center gap-2 text-[10px] text-gray-300 pt-1">
                <span>1. View Menu</span>
                <span>•</span>
                <span>2. Order Food</span>
                <span>•</span>
                <span>3. Settle at Leisure</span>
              </div>
            </div>

            {/* Token details for staff verification */}
            <div className="pt-3 border-t border-[#3D1E1E] text-[10px] text-[#BFA59A] flex items-center justify-between">
              <span>Token: <strong className="text-[#D4A017]">{table.qr_code_token}</strong></span>
              <span>Dine-In Self-Order</span>
            </div>
          </div>
        </div>

        {/* Modal Controls (Print, Download, Regenerate) */}
        <div className="p-4 bg-white border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="flex items-center gap-2">
            {onRegenerateToken && (
              <button
                onClick={() => onRegenerateToken(table.id)}
                disabled={isRegenerating}
                className="px-3 py-2 text-xs font-semibold text-gray-600 hover:text-[#8B1A1A] hover:bg-red-50 rounded-xl border border-gray-200 transition-colors flex items-center gap-1.5"
                title="Invalidates old QR and generates new token"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                <span>Reset Token</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open(tableUrl, '_blank')}
              className="px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors flex items-center gap-1.5"
              title="Open Guest Menu in New Tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Menu</span>
            </button>
            <button
              onClick={handleDownloadPng}
              className="px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PNG</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 text-xs font-bold text-white bg-[#8B1A1A] hover:bg-[#A52B2B] rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Flyer</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
