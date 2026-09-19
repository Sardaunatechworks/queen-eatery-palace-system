import React, { useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Printer,
  X,
  CheckCircle2,
  MapPin,
  Receipt,
  Share2,
  Phone,
  QrCode,
  Download,
  Copy,
  MessageCircle,
  FileText,
  Image as ImageIcon,
  Check,
  ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { formatNaira } from '../utils/format';
import { toPng, toBlob } from 'html-to-image';
import { jsPDF } from 'jspdf';
import queenLogo from '../assets/queen-logo.png';

interface ReceiptModalProps {
  isOpen?: boolean;
  onClose: () => void;
  order: any; // Order data
  mode?: 'cashier' | 'customer';
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen = true,
  onClose,
  order,
  mode = 'customer',
}) => {
  const receiptPaperRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  if (!isOpen || !order) return null;

  // Order Calculations
  const orderRef = order.orderId || order.order_number || (order.id ? String(order.id).slice(0, 8) : 'QEP-00000');
  const foodSubtotal = Number(
    order.subtotal ??
      (order.items?.reduce(
        (s: number, i: any) => s + Number(i.unit_price ?? i.price ?? 0) * Number(i.quantity ?? 1),
        0
      ) ?? 0)
  );
  const packagingFee = Number(order.packaging_fee ?? 0);
  const packagingQty = Number(order.packaging_quantity ?? 0);
  const packagingUnitPrice = Number(
    order.packaging_unit_price ?? (packagingQty > 0 ? packagingFee / packagingQty : 0)
  );
  const grandTotal = Number(order.total ?? order.total_amount ?? foodSubtotal + packagingFee);

  const formattedDate = (() => {
    try {
      if (order.createdAt?.toDate) {
        return format(order.createdAt.toDate(), 'dd/MM/yyyy h:mm a');
      }
      const dateVal = order.created_at || order.createdAt;
      const date = dateVal ? new Date(typeof dateVal === 'string' ? dateVal.replace(/-/g, '/') : dateVal) : new Date();
      return isNaN(date.getTime())
        ? format(new Date(), 'dd/MM/yyyy h:mm a')
        : format(date, 'dd/MM/yyyy h:mm a');
    } catch {
      return format(new Date(), 'dd/MM/yyyy h:mm a');
    }
  })();

  const staffName = order.cashierName || order.cashier_name || 'Palace Attendant';
  const paymentMode = order.paymentMethod || order.payment_method || 'Direct';

  // Generate plain text receipt for WhatsApp and Clipboard
  const generateReceiptText = () => {
    const itemsLines =
      order.items
        ?.map(
          (i: any) =>
            `• ${i.quantity || 1}x ${i.name || i.item_name || 'Item'} — ${formatNaira(Number(i.unit_price ?? i.price ?? 0) * Number(i.quantity ?? 1))}`
        )
        .join('\n') || '• 1x Palace Order';

    return `👑 *THE QUEEN'S PALACE EATERY & EVENT HALL*
Official Customer Receipt
━━━━━━━━━━━━━━━━━━━━
🧾 *Order Ref:* #${orderRef}
📅 *Date:* ${formattedDate}
👤 *Attendant:* ${staffName}
💳 *Payment:* ${paymentMode.toUpperCase()} (PAID)
━━━━━━━━━━━━━━━━━━━━
🛒 *ORDERED ITEMS:*
${itemsLines}
━━━━━━━━━━━━━━━━━━━━
💵 *Food Subtotal:* ${formatNaira(foodSubtotal)}
${packagingFee > 0 ? `📦 *Takeaway Packs (${packagingQty}x):* ${formatNaira(packagingFee)}\n` : ''}💰 *TOTAL PAID:* ${formatNaira(grandTotal)}
━━━━━━━━━━━━━━━━━━━━
${order.deliveryType === 'delivery' && order.address ? `📍 *Delivery Address:* ${order.address}\n━━━━━━━━━━━━━━━━━━━━\n` : ''}📍 *Address:* Behind Dutse Emir's House, Opposite Glo Office, Dutse
📞 *Call:* 0915 529 0102 | WhatsApp: +234 813 554 9195
✨ *Thank you for dining with royalty!*`;
  };

  // High-Resolution Receipt Canvas Capture via html-to-image (supports oklab/oklch & modern CSS)
  const captureReceiptPng = async (): Promise<string | null> => {
    if (!receiptPaperRef.current) return null;
    const element = receiptPaperRef.current;

    const dataUrl = await toPng(element, {
      quality: 0.98,
      pixelRatio: 2.5, // Crisp 300 DPI-equivalent
      backgroundColor: '#FFFFFF',
      cacheBust: false,
    });

    return dataUrl;
  };

  // Save as High-Res PNG Image
  const handleSaveImage = async () => {
    setIsSaving(true);
    setSaveMenuOpen(false);
    try {
      const dataUrl = await captureReceiptPng();
      if (!dataUrl) throw new Error('Receipt render failed');

      const link = document.createElement('a');
      link.download = `QueenPalace-Receipt-${orderRef}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Receipt saved as Image!');
    } catch (err) {
      console.error('Save image failed:', err);
      showToast('Failed to save receipt image');
    } finally {
      setIsSaving(false);
    }
  };

  // Save as 80mm POS Thermal Receipt PDF
  const handleSavePDF = async () => {
    setIsSaving(true);
    setSaveMenuOpen(false);
    try {
      const dataUrl = await captureReceiptPng();
      if (!dataUrl) throw new Error('Receipt render failed');

      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve, reject) => {
        img.onload = () => resolve(true);
        img.onerror = reject;
      });

      const imgWidthMm = 80; // Standard 80mm thermal receipt width
      const imgHeightMm = (img.height * imgWidthMm) / img.width;

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [imgWidthMm, Math.max(imgHeightMm + 6, 120)],
      });

      pdf.addImage(dataUrl, 'PNG', 0, 3, imgWidthMm, imgHeightMm);
      pdf.save(`QueenPalace-Receipt-${orderRef}.pdf`);
      showToast('Receipt saved as PDF!');
    } catch (err) {
      console.error('Save PDF failed:', err);
      showToast('Failed to save receipt PDF');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Thermal Print via dedicated popup window ────────────────────────────
  // This is the ONLY correct approach for thermal receipts in a React SPA.
  // window.print() on the main window prints the ENTIRE app DOM (sidebar,
  // navbar, POS terminal etc.). A dedicated popup window contains ONLY the
  // receipt document, giving fully deterministic output on every printer.
  const isPrinting = useRef(false);

  const generateThermalPrintHtml = useCallback((): string => {
    const packagingLine =
      packagingFee > 0 && packagingQty > 0
        ? `<tr>
            <td>Takeaway Packs (${packagingQty}x @ ${formatNaira(packagingFee / packagingQty)}):</td>
            <td class="amount">${formatNaira(packagingFee)}</td>
           </tr>`
        : '';

    const deliveryLine =
      order.delivery_fee && Number(order.delivery_fee) > 0
        ? `<tr>
            <td>Delivery Fee:</td>
            <td class="amount">${formatNaira(Number(order.delivery_fee))}</td>
           </tr>`
        : '';

    const discountLine =
      order.discount && Number(order.discount) > 0
        ? `<tr>
            <td>Discount:</td>
            <td class="amount">-${formatNaira(Number(order.discount))}</td>
           </tr>`
        : '';

    const tableInfo =
      order.tableNumber || order.table_number
        ? `<div class="table-banner">TABLE ${String(order.tableNumber ?? order.table_number).padStart(2, '0')}</div>`
        : '';

    const guestInfo =
      order.customerName || order.customer_name
        ? `<p><strong>Guest:</strong> ${order.customerName ?? order.customer_name}</p>`
        : '';

    const deliveryAddress =
      order.deliveryType === 'delivery' && order.address
        ? `<div class="section">
            <p class="label">DELIVERY ADDRESS:</p>
            <p class="wrap">${order.address}</p>
           </div>`
        : '';

    const orderType = order.tableNumber || order.table_number
      ? 'Dine-In (QR Order)'
      : order.deliveryType === 'delivery'
        ? 'Delivery'
        : 'Pickup / Counter Sale';

    const itemRows = (order.items ?? []).map((item: any) => {
      const unitPrice = Number(item.unit_price ?? item.price ?? 0);
      const qty = Number(item.quantity ?? 1);
      const lineTotal = unitPrice * qty;
      return `<tr>
        <td class="item-name">${item.name ?? item.item_name ?? 'Order Item'}</td>
        <td class="item-qty">${qty}&nbsp;&times;&nbsp;${formatNaira(unitPrice)}</td>
        <td class="amount">${formatNaira(lineTotal)}</td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=80mm">
  <title>Queen's Palace Receipt #${orderRef}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 1.5mm 2mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      color: #000000 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      width: 72mm;
      max-width: 72mm;
      margin: 0 auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Courier New', sans-serif;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.35;
      color: #000000 !important;
      background: #ffffff !important;
      -webkit-text-stroke: 0.25px #000000;
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: antialiased;
    }
    .receipt {
      width: 72mm;
      padding: 1.5mm 0;
    }
    .center { text-align: center; }
    .right  { text-align: right; }
    .bold   { font-weight: 800; }
    .label  { font-weight: 800; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.02em; }
    .wrap   { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
    .dashed { border-top: 1.5px dashed #000000; margin: 2.5mm 0; }
    .section { margin: 2mm 0; }

    /* Restaurant header - High Impact */
    .header { text-align: center; margin-bottom: 2.5mm; }
    .header h1 { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.8mm; line-height: 1.15; }
    .header h2 { font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 0.8mm; }
    .header p  { font-size: 10px; font-weight: 600; line-height: 1.3; }

    /* Table banner for QR dine-in */
    .table-banner {
      font-size: 22px;
      font-weight: 900;
      text-align: center;
      border: 2.5px solid #000000;
      padding: 2mm;
      margin: 2.5mm 0;
      letter-spacing: 0.08em;
    }

    /* Meta rows */
    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
      margin: 1.2mm 0;
    }

    /* Items table */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 2mm 0;
    }
    thead th {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      border-bottom: 1.5px solid #000000;
      padding-bottom: 1.2mm;
      text-align: left;
    }
    thead th.amount { text-align: right; }
    tbody tr { page-break-inside: avoid; }
    tbody td {
      vertical-align: top;
      padding: 1.4mm 0;
      font-size: 11.5px;
      font-weight: 600;
    }
    .item-name {
      font-size: 12px;
      font-weight: 800;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
      max-width: 36mm;
    }
    .item-qty {
      white-space: nowrap;
      padding: 0 1.5mm;
      font-size: 11px;
      font-weight: 600;
    }
    .amount {
      text-align: right;
      white-space: nowrap;
      font-weight: 800;
      font-size: 12px;
    }

    /* Totals */
    .totals-table td { padding: 1mm 0; font-size: 11.5px; font-weight: 700; }
    .grand-total td  {
      font-size: 15px;
      font-weight: 900;
      border-top: 2px solid #000000;
      border-bottom: 2px solid #000000;
      padding: 2.2mm 0;
    }

    /* Footer */
    .footer { text-align: center; font-size: 10.5px; font-weight: 600; margin-top: 3mm; }
    .footer p { margin: 0.8mm 0; }
    .footer .tagline { font-style: italic; font-weight: 700; }
    .footer .notice { font-size: 9.5px; font-weight: 900; letter-spacing: 0.06em; margin-top: 2mm; }
  </style>
</head>
<body>
<div class="receipt">

  <div class="header">
    <h1>QUEEN'S PALACE</h1>
    <h2>EATERY &amp; EVENT HALL</h2>
    <p>Behind Dutse Emir's House, Opp. Glo Office, Dutse</p>
    <p>0915 529 0102 &nbsp;|&nbsp; WhatsApp: +234 813 554 9195</p>
  </div>

  ${tableInfo}

  <div class="dashed"></div>

  <div class="section">
    <div class="meta-row"><span class="label">Order Ref:</span><span><strong>#${orderRef}</strong></span></div>
    <div class="meta-row"><span class="label">Type:</span><span>${orderType}</span></div>
    <div class="meta-row"><span class="label">Date:</span><span>${formattedDate}</span></div>
    <div class="meta-row"><span class="label">Staff:</span><span>${staffName}</span></div>
    <div class="meta-row"><span class="label">Payment:</span><span>${paymentMode.toUpperCase()}</span></div>
    ${guestInfo ? `<div class="meta-row">${guestInfo}</div>` : ''}
  </div>

  <div class="dashed"></div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>Qty&times;Price</th>
        <th class="amount">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="dashed"></div>

  <table class="totals-table">
    <tbody>
      <tr>
        <td>Food Subtotal:</td>
        <td class="amount">${formatNaira(foodSubtotal)}</td>
      </tr>
      ${packagingLine}
      ${deliveryLine}
      ${discountLine}
    </tbody>
  </table>

  <table>
    <tbody class="grand-total">
      <tr>
        <td class="bold">TOTAL PAID:</td>
        <td class="amount bold">${formatNaira(grandTotal)}</td>
      </tr>
    </tbody>
  </table>

  ${deliveryAddress}

  <div class="dashed"></div>

  <div class="footer">
    <p class="bold">Thank you for your patronage.</p>
    <p class="tagline">Royal Taste, Splendid Hospitality</p>
    <p class="notice">*** OFFICIAL RECEIPT ***</p>
  </div>

</div>
</body>
</html>`;
  }, [
    orderRef, formattedDate, staffName, paymentMode,
    foodSubtotal, packagingFee, packagingQty, grandTotal,
    order,
  ]);

  const handlePrint = useCallback(() => {
    // Guard: prevent double-click / concurrent prints
    if (isPrinting.current) return;
    isPrinting.current = true;

    setSaveMenuOpen(false);
    setShareMenuOpen(false);

    try {
      const printHtml = generateThermalPrintHtml();

      // Open a blank popup window — the receipt DOM lives entirely in this
      // new window, completely isolated from the React app DOM.
      const printWin = window.open('', '_blank', 'width=400,height=600,scrollbars=yes');
      if (!printWin) {
        // Popup was blocked — fall back to alert
        alert('Popup blocked. Please allow popups for this site to print receipts.');
        isPrinting.current = false;
        return;
      }

      printWin.document.open();
      printWin.document.write(printHtml);
      printWin.document.close();

      let hasTriggered = false;
      const triggerPrint = () => {
        if (hasTriggered) return;
        hasTriggered = true;
        try {
          printWin.focus();
          printWin.print();
        } catch (_) {
          /* ignore */
        }
        printWin.addEventListener('afterprint', () => {
          try { printWin.close(); } catch (_) {}
        });
        setTimeout(() => {
          try { printWin.close(); } catch (_) {}
        }, 60_000);
        isPrinting.current = false;
      };

      // Trigger print as soon as ready
      printWin.onload = triggerPrint;
      setTimeout(triggerPrint, 400);

    } catch (err) {
      console.error('Print failed:', err);
      isPrinting.current = false;
    }
  }, [generateThermalPrintHtml]);

  // 1-Click WhatsApp Share
  const handleShareWhatsApp = () => {
    setShareMenuOpen(false);
    const text = generateReceiptText();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Copy Receipt Text to Clipboard
  const handleCopyDetails = async () => {
    setShareMenuOpen(false);
    try {
      await navigator.clipboard.writeText(generateReceiptText());
      showToast('Receipt details copied to clipboard!');
    } catch {
      showToast('Could not copy to clipboard');
    }
  };

  // Web Share API (Files + Text)
  const handleNativeShare = async () => {
    setShareMenuOpen(false);
    const text = generateReceiptText();

    if (navigator.share) {
      try {
        setIsSaving(true);
        if (receiptPaperRef.current) {
          const blob = await toBlob(receiptPaperRef.current, {
            quality: 0.95,
            pixelRatio: 2,
            backgroundColor: '#FFFFFF',
          });
          if (blob) {
            const file = new File([blob], `QueenPalace-Receipt-${orderRef}.png`, {
              type: 'image/png',
            });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({
                title: "The Queen's Palace Receipt",
                text: text,
                files: [file],
              });
              return;
            }
          }
        }
        await navigator.share({
          title: "The Queen's Palace Receipt",
          text: text,
        });
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          handleCopyDetails();
        }
      } finally {
        setIsSaving(false);
      }
    } else {
      handleCopyDetails();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm print:p-0 print:bg-white print:static thermal-receipt-portal">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="bg-[#FBFBFA] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[94vh] border border-[#E5E7EB] print:shadow-none print:rounded-none print:max-w-none print:h-auto print:overflow-visible print:border-none thermal-receipt-card relative"
      >
        {/* Toast Alert */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-[#1C1C1C] text-white px-4 py-2 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2 border border-stone-700"
            >
              <Check size={14} className="text-emerald-400" />
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal Header (Screen Only) */}
        <div className="px-5 py-3.5 bg-white border-b border-[#E5E7EB] flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#FDF2F2] flex items-center justify-center text-[#8B1A1A]">
              <Receipt size={17} />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-stone-900 leading-tight">
                Official Royal Receipt
              </h2>
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                <CheckCircle2 size={10} /> Paid & Confirmed
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-400 hover:text-stone-700"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Receipt Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar print:overflow-visible print:p-0 print:m-0 bg-[#F5F5F4]">
          {/* ========================================================================= */}
          {/* SCREEN RECEIPT PAPER (Rendered and Captured via html-to-image)            */}
          {/* ========================================================================= */}
          <div
            ref={receiptPaperRef}
            data-receipt-paper
            className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#E5E7EB] space-y-4 text-stone-800 print:hidden"
          >
            {/* Header: Logo, Restaurant Name, Address & Contact */}
            <div className="text-center space-y-2 pb-1">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto border-2 border-[#FCD34D] shadow-sm overflow-hidden p-1.5">
                <img
                  src={queenLogo}
                  alt="Queen's Palace Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-black text-stone-900 tracking-tight uppercase leading-tight">
                  The Queen's Palace
                </h1>
                <p className="text-xs font-extrabold text-[#8B1A1A] tracking-wider uppercase">
                  Eatery and Event Hall
                </p>
              </div>
              <div className="space-y-0.5 text-[10px] text-stone-500 font-medium">
                <p className="flex items-center justify-center gap-1">
                  <MapPin size={11} className="text-[#8B1A1A] shrink-0" />
                  Behind Dutse Emir's House, Opposite Glo Office, Dutse
                </p>
                <p className="flex items-center justify-center gap-1">
                  <Phone size={11} className="text-[#8B1A1A] shrink-0" />
                  0915 529 0102 • WhatsApp: +234 813 554 9195
                </p>
              </div>
            </div>

            {/* Receipt Metadata Grid */}
            <div className="border-y border-dashed border-[#D1D5DB] py-3 grid grid-cols-2 gap-y-2.5 text-xs">
              <div className="space-y-0.5">
                <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">
                  Order Reference
                </p>
                <p className="font-extrabold text-stone-900 text-xs sm:text-sm">#{orderRef}</p>
              </div>
              <div className="text-right space-y-0.5">
                <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">
                  Transaction Date
                </p>
                <p className="font-semibold text-stone-800 text-[11px] sm:text-xs">
                  {formattedDate}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">
                  Palace Staff
                </p>
                <p className="font-semibold text-stone-700 text-xs">{staffName}</p>
              </div>
              <div className="text-right space-y-0.5">
                <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">
                  Payment Mode
                </p>
                <span className="inline-block bg-[#ECFDF5] text-[#047857] px-2 py-0.5 rounded-md font-extrabold text-[10px] uppercase border border-[#A7F3D0]">
                  {paymentMode}
                </span>
              </div>
            </div>

            {/* Items Table */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-[10px] font-black text-stone-400 uppercase tracking-wider border-b border-[#F3F4F6] pb-1.5">
                <span>Description</span>
                <span>Amount</span>
              </div>
              <div className="space-y-2.5">
                {order.items?.map((item: any, idx: number) => {
                  const unitPrice = Number(item.unit_price ?? item.price ?? 0);
                  const qty = Number(item.quantity ?? 1);
                  return (
                    <div key={idx} className="flex justify-between items-start text-xs sm:text-[13px]">
                      <div className="flex-1 pr-3">
                        <p className="font-bold text-stone-900 leading-snug">{item.name || item.item_name || 'Order Item'}</p>
                        <p className="text-[10px] text-stone-400 font-medium mt-0.5">
                          {qty} × {formatNaira(unitPrice)}
                        </p>
                      </div>
                      <p className="font-bold text-stone-900 tabular-nums">
                        {formatNaira(unitPrice * qty)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Financial Summary & Grand Total */}
            <div className="space-y-2 border-t border-[#E5E7EB] pt-3">
              <div className="flex justify-between items-center text-xs text-stone-600 font-medium">
                <span>Food Subtotal</span>
                <span className="font-semibold text-stone-900 tabular-nums">
                  {formatNaira(foodSubtotal)}
                </span>
              </div>

              {packagingFee > 0 && packagingQty > 0 && (
                <div className="flex justify-between items-center text-xs text-stone-700">
                  <div>
                    <span className="font-semibold">Takeaway Packs</span>
                    <span className="text-[10px] text-stone-400 ml-1">
                      ({packagingQty} × {formatNaira(packagingUnitPrice)})
                    </span>
                  </div>
                  <span className="font-semibold text-stone-900 tabular-nums">
                    {formatNaira(packagingFee)}
                  </span>
                </div>
              )}

              {/* Total Paid Card */}
              <div className="bg-gradient-to-r from-[#8B1A1A] to-[#6E1111] text-white p-3.5 rounded-xl flex justify-between items-center shadow-md mt-2">
                <div>
                  <span className="text-[10px] font-bold text-[#FDE68A] uppercase tracking-wider block">
                    Total Paid
                  </span>
                  <span className="text-[10px] text-[#F3F4F6] font-medium">
                    {order.paymentMethod || 'Direct Payment'}
                  </span>
                </div>
                <span className="text-xl sm:text-2xl font-black text-[#FDE68A] tracking-tight tabular-nums">
                  {formatNaira(grandTotal)}
                </span>
              </div>
            </div>

            {/* Fulfillment Mode */}
            <div className="pt-1 text-center space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F3F4F6] border border-[#E5E7EB] rounded-full text-[10px] font-bold text-stone-600 uppercase tracking-wide">
                {order.deliveryType === 'delivery' ? (
                  <>
                    <MapPin size={11} className="text-[#8B1A1A]" /> Delivery Order
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={11} className="text-emerald-600" /> Counter Sale / Pick-up
                  </>
                )}
              </div>
              {order.deliveryType === 'delivery' && order.address && (
                <p className="text-[11px] text-stone-500 font-medium leading-tight px-3">
                  {order.address}
                </p>
              )}
            </div>

            {/* Receipt Footer */}
            <div className="pt-3 border-t border-dashed border-[#D1D5DB] text-center space-y-2 pb-1">
              <div className="flex flex-col items-center gap-1 opacity-40">
                <QrCode size={34} className="text-stone-600" strokeWidth={1.5} />
                <p className="text-[8px] font-bold uppercase tracking-widest text-stone-500">
                  Scan for Feedback & Rewards
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-extrabold text-stone-800 uppercase tracking-widest">
                  Thank You for Dining With Us
                </p>
                <p className="text-[9px] text-stone-400 italic">
                  Royal Taste, Splendid Hospitality
                </p>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* PRINT ONLY VIEW (Optimized for 80mm/58mm Thermal Printers)               */}
          {/* ========================================================================= */}
          <div className="hidden print:block text-black font-mono text-[10px] leading-tight space-y-2">
            {/* Header Branding */}
            <div className="text-center space-y-1">
              <img
                src={queenLogo}
                alt="Queen's Palace Logo"
                className="print-logo-img mx-auto w-12 h-12 object-contain"
              />
              <h1 className="text-[11px] font-bold uppercase tracking-wide leading-tight">
                QUEEN'S PALACE EATERY & EVENT HALL
              </h1>
              <p className="text-[8px]">Behind Dutse Emir's House, Opposite Glo Office</p>
              <p className="text-[8px]">0915 529 0102 | WhatsApp: +234 813 554 9195</p>
            </div>

            {/* Receipt Metadata */}
            <div className="border-y border-dashed border-black py-1 space-y-0.5 text-[9px]">
              <div className="flex justify-between flex-wrap gap-x-2">
                <span>ORDER: #{orderRef}</span>
                <span className="font-bold">TYPE: {order.deliveryType?.toUpperCase() || 'PICKUP'}</span>
              </div>
              <div className="flex justify-between flex-wrap gap-x-2">
                <span>DATE: {formattedDate}</span>
              </div>
              <div className="flex justify-between flex-wrap gap-x-2">
                <span>STAFF: {staffName.toUpperCase()}</span>
                <span>MODE: {paymentMode.toUpperCase()}</span>
              </div>
            </div>

            {/* Table Header */}
            <div className="border-b border-dashed border-black pb-0.5 flex justify-between uppercase text-[9px] font-bold">
              <span>Item Description</span>
              <span>Amount</span>
            </div>

            {/* Ordered Items List */}
            <div className="space-y-1">
              {order.items?.map((item: any, idx: number) => (
                <div key={idx} className="space-y-0.5">
                  <div className="font-bold uppercase leading-tight break-words">
                    {item.name}
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span>
                      {item.quantity} x {formatNaira(Number(item.price ?? 0))}
                    </span>
                    <span>
                      {formatNaira(Number(item.price ?? 0) * Number(item.quantity ?? 1))}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals Section */}
            <div className="border-t border-dashed border-black pt-1 space-y-0.5">
              <div className="flex justify-between text-[9px]">
                <span>Food Subtotal:</span>
                <span>{formatNaira(foodSubtotal)}</span>
              </div>

              {packagingFee > 0 && packagingQty > 0 && (
                <div className="flex justify-between text-[9px]">
                  <span>Takeaway Packs ({packagingQty}x):</span>
                  <span>{formatNaira(packagingFee)}</span>
                </div>
              )}

              <div className="flex justify-between font-bold text-[11px] border-t border-dashed border-black pt-1 mt-0.5">
                <span>TOTAL PAID:</span>
                <span>{formatNaira(grandTotal)}</span>
              </div>
            </div>

            {/* Delivery Address if applicable */}
            {order.deliveryType === 'delivery' && order.address && (
              <div className="border-t border-dashed border-black pt-1 text-[9px]">
                <span className="font-bold uppercase">DELIVERY ADDRESS:</span>
                <p className="leading-tight mt-0.5 break-words">{order.address}</p>
              </div>
            )}

            {/* Print Footer */}
            <div className="border-t border-dashed border-black pt-1 text-center text-[9px] space-y-0.5">
              <p className="font-bold italic">Thank you for your patronage.</p>
              <p className="text-[8px]">Royal Taste, Splendid Hospitality</p>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ACTION BAR (Screen Only)                                                  */}
        {/* ========================================================================= */}
        <div className="p-3.5 sm:p-4 bg-white border-t border-[#E5E7EB] flex flex-wrap gap-2 items-center justify-between print:hidden">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="px-3.5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 active:scale-95"
          >
            Close
          </button>

          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {/* Direct Print Button */}
            <button
              onClick={handlePrint}
              title="Print Thermal Receipt"
              className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold active:scale-95"
            >
              <Printer size={16} />
              <span className="hidden sm:inline">Print</span>
            </button>

            {/* 1-Click WhatsApp Share Button */}
            <button
              onClick={handleShareWhatsApp}
              title="Share Receipt on WhatsApp"
              className="px-3 py-2.5 bg-[#059669] hover:bg-[#047857] text-white rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <MessageCircle size={16} />
              <span>WhatsApp</span>
            </button>

            {/* Share Popover Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setShareMenuOpen(!shareMenuOpen);
                  setSaveMenuOpen(false);
                }}
                title="Share Options"
                className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition-all flex items-center gap-1 text-xs font-bold active:scale-95"
              >
                <Share2 size={16} />
                <ChevronDown size={12} />
              </button>

              <AnimatePresence>
                {shareMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 bottom-full mb-2 w-48 bg-white rounded-2xl shadow-xl border border-[#E5E7EB] py-1.5 z-50 text-stone-800"
                  >
                    <button
                      onClick={handleShareWhatsApp}
                      className="w-full px-3.5 py-2.5 hover:bg-stone-50 text-left text-xs font-semibold flex items-center gap-2.5 text-emerald-700"
                    >
                      <MessageCircle size={15} />
                      Share via WhatsApp
                    </button>
                    <button
                      onClick={handleCopyDetails}
                      className="w-full px-3.5 py-2.5 hover:bg-stone-50 text-left text-xs font-semibold flex items-center gap-2.5 text-stone-700"
                    >
                      <Copy size={15} />
                      Copy Receipt Details
                    </button>
                    {navigator.share && (
                      <button
                        onClick={handleNativeShare}
                        className="w-full px-3.5 py-2.5 hover:bg-stone-50 text-left text-xs font-semibold flex items-center gap-2.5 text-stone-700"
                      >
                        <Share2 size={15} />
                        More Share Options...
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Save / Download Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setSaveMenuOpen(!saveMenuOpen);
                  setShareMenuOpen(false);
                }}
                disabled={isSaving}
                className="px-3.5 py-2.5 bg-[#8B1A1A] hover:bg-[#721515] text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-70"
              >
                {isSaving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download size={15} />
                )}
                <span>{isSaving ? 'Processing...' : 'Save'}</span>
                <ChevronDown size={12} />
              </button>

              <AnimatePresence>
                {saveMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 bottom-full mb-2 w-52 bg-white rounded-2xl shadow-xl border border-[#E5E7EB] py-1.5 z-50 text-stone-800"
                  >
                    <button
                      onClick={handleSaveImage}
                      className="w-full px-3.5 py-2.5 hover:bg-stone-50 text-left text-xs font-semibold flex items-center gap-2.5 text-stone-800"
                    >
                      <ImageIcon size={15} className="text-[#8B1A1A]" />
                      <div>
                        <p className="font-bold">Save as Image (PNG)</p>
                        <p className="text-[10px] text-stone-400 font-normal">
                          High-res image for photo gallery
                        </p>
                      </div>
                    </button>
                    <div className="border-t border-stone-100 my-1" />
                    <button
                      onClick={handleSavePDF}
                      className="w-full px-3.5 py-2.5 hover:bg-stone-50 text-left text-xs font-semibold flex items-center gap-2.5 text-stone-800"
                    >
                      <FileText size={15} className="text-[#8B1A1A]" />
                      <div>
                        <p className="font-bold">Save as PDF</p>
                        <p className="text-[10px] text-stone-400 font-normal">
                          80mm thermal receipt document
                        </p>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};
