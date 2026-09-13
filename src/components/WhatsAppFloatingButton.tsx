import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Send, MessageCircle, Clock, Sparkles } from 'lucide-react';
import { getCMSContent } from '../services/cmsService';
import queenLogo from '../assets/queen-logo.png';

/**
 * Normalizes phone number into international WhatsApp wa.me format (digits only).
 * Default fallback to Queen's Palace official business line.
 */
function cleanPhoneNumber(phone?: string): string {
  if (!phone) return '2348135549195';
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '234' + cleaned.slice(1);
  }
  if (!cleaned.startsWith('234') && cleaned.length === 10) {
    cleaned = '234' + cleaned;
  }
  return cleaned || '2348135549195';
}

export const WhatsAppFloatingButton: React.FC = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('2348135549195');
  const [showTooltip, setShowTooltip] = useState(true);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Hide on internal staff and guest QR table ordering screens so UI remains clean
  const isHiddenRoute = /^\/(admin|cashier|pos|kitchen|q)(\/|$)/.test(location.pathname);

  useEffect(() => {
    // Fetch latest contact phone number from CMS settings
    const loadPhone = async () => {
      try {
        const cms = await getCMSContent();
        if (cms?.contact?.phone) {
          setWhatsappPhone(cleanPhoneNumber(cms.contact.phone));
        }
      } catch {
        // Fallback default
        setWhatsappPhone('2348135549195');
      }
    };
    loadPhone();
  }, []);

  // Auto-hide the initial pill tooltip after 7 seconds if not interacted with
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTooltip(false);
    }, 7000);
    return () => clearTimeout(timer);
  }, []);

  // Close popup when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (isHiddenRoute) {
    return null;
  }

  const handleStartConversation = (customText?: string) => {
    const textToSend = (customText || message || "Hello Queen's Palace! I'd like to ask a question.").trim();
    const url = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(textToSend)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setMessage('');
    setIsOpen(false);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    handleStartConversation(message);
  };

  // Quick conversation prompts
  const quickStarters = [
    {
      id: 'order',
      icon: '🍽️',
      label: 'Place Food Order / Menu Inquiry',
      prompt: "Hello Queen's Palace! I would like to place an order or inquire about your food menu.",
    },
    {
      id: 'hall',
      icon: '🏛️',
      label: 'Event Hall Booking Inquiry',
      prompt: "Hello Queen's Palace! I would like to inquire about booking your Event Hall for an upcoming event.",
    },
    {
      id: 'delivery',
      icon: '🚚',
      label: 'Order Delivery Tracking',
      prompt: "Hello Queen's Palace! I have a question regarding my order and delivery status.",
    },
    {
      id: 'support',
      icon: '💬',
      label: 'Chat with Customer Support',
      prompt: "Hello Queen's Palace Support! I need some assistance please.",
    },
  ];

  return (
    <div ref={widgetRef} className="fixed bottom-6 right-6 z-50 flex flex-col items-end print:hidden">
      {/* Interactive Conversation Popup Card */}
      {isOpen && (
        <div className="mb-3 w-[calc(100vw-2.5rem)] sm:w-90 max-w-[380px] bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden animate-scale-in transition-all duration-200">
          {/* WhatsApp Header */}
          <div className="bg-[#075E54] text-white p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-white/10 p-1 flex items-center justify-center overflow-hidden border border-white/20">
                  <img src={queenLogo} alt="Queen's Palace" className="w-full h-full object-contain" />
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#25D366] border-2 border-[#075E54] rounded-full" />
              </div>
              <div>
                <h3 className="font-semibold text-sm leading-tight">Queen's Palace Support</h3>
                <p className="text-[11px] text-emerald-100/90 flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] inline-block animate-pulse" />
                  Typically replies in minutes
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-full hover:bg-white/15 text-emerald-100 hover:text-white transition-colors"
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </div>

          {/* Conversation Chat Body */}
          <div className="p-4 bg-[#EFEAE2] space-y-3 max-h-[360px] overflow-y-auto">
            {/* Welcome Agent Bubble */}
            <div className="bg-white rounded-2xl rounded-tl-xs p-3.5 shadow-xs border border-stone-200/80 text-xs text-stone-800 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-stone-400 font-medium">
                <span>Queen's Palace Concierge</span>
                <span className="flex items-center gap-1">
                  <Clock size={10} /> Just now
                </span>
              </div>
              <p className="leading-relaxed">
                Hi there! 👋 Welcome to The Queen's Palace Eatery & Event Hall. How can we help you today?
              </p>
              <p className="text-[11px] text-stone-500 pt-0.5">
                Choose a topic below or type your message to chat directly with us on WhatsApp:
              </p>
            </div>

            {/* Quick Starters */}
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] uppercase font-semibold tracking-wider text-stone-500 px-1">
                Suggested Topics
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {quickStarters.map((starter) => (
                  <button
                    key={starter.id}
                    type="button"
                    onClick={() => handleStartConversation(starter.prompt)}
                    className="text-left bg-white hover:bg-emerald-50 hover:border-emerald-300 border border-stone-200/90 rounded-xl px-3 py-2 text-xs text-stone-700 transition-all flex items-center justify-between group shadow-2xs"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm">{starter.icon}</span>
                      <span className="font-medium group-hover:text-emerald-800">{starter.label}</span>
                    </span>
                    <Send size={12} className="text-stone-300 group-hover:text-emerald-600 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Message Input Footer */}
          <form onSubmit={handleFormSubmit} className="p-2.5 bg-white border-t border-stone-200 flex items-center gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message here..."
              className="flex-1 text-xs px-3.5 py-2.5 bg-stone-100 focus:bg-white rounded-full border border-stone-200 focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/20 outline-none text-stone-800 placeholder-stone-400 transition-all"
            />
            <button
              type="submit"
              disabled={!message.trim()}
              className="w-9 h-9 rounded-full bg-[#25D366] hover:bg-[#1EBE5D] disabled:opacity-50 disabled:hover:bg-[#25D366] text-white flex items-center justify-center transition-transform active:scale-95 shadow-md hover:shadow-lg shrink-0"
              aria-label="Send message on WhatsApp"
            >
              <Send size={15} className="ml-0.5" />
            </button>
          </form>
        </div>
      )}

      {/* Floating Button with Floating Animation & Radar Pulse */}
      <div className="relative flex items-center gap-3">
        {/* Subtle Tooltip Pill */}
        {(showTooltip || !isOpen) && (
          <div
            onClick={() => {
              setIsOpen((prev) => !prev);
              setShowTooltip(false);
            }}
            className="cursor-pointer hidden sm:flex items-center gap-2 bg-white/95 backdrop-blur-xs text-stone-800 text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg border border-stone-200 hover:border-emerald-300 hover:text-emerald-700 transition-all group animate-fade-in"
          >
            <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
            <span>Need help? Chat with us</span>
            <Sparkles size={13} className="text-amber-500" />
          </div>
        )}

        {/* Main WhatsApp Floating Trigger */}
        <button
          type="button"
          onClick={() => {
            setIsOpen((prev) => !prev);
            setShowTooltip(false);
          }}
          className={`relative group w-14 h-14 rounded-full bg-[#25D366] hover:bg-[#1EBE5D] text-white flex items-center justify-center shadow-xl transition-all duration-300 active:scale-95 ${
            isOpen ? 'rotate-90 bg-stone-800 hover:bg-stone-900' : 'animate-float-gentle animate-pulse-glow'
          }`}
          aria-label={isOpen ? 'Close chat' : 'Open WhatsApp chat'}
        >
          {isOpen ? (
            <X size={24} className="transition-transform -rotate-90" />
          ) : (
            <>
              {/* WhatsApp Authentic SVG Icon */}
              <svg
                viewBox="0 0 24 24"
                width="28"
                height="28"
                stroke="currentColor"
                strokeWidth="0"
                fill="currentColor"
                className="drop-shadow-xs"
              >
                <path d="M12.031 2C6.51 2 2.016 6.47 2.016 11.969c0 1.948.56 3.774 1.532 5.323L2 22l4.908-1.503c1.47.85 3.167 1.332 4.975 1.332 5.52 0 10.015-4.47 10.015-9.97 0-5.498-4.495-9.969-10.015-9.969zm5.836 14.17c-.243.682-1.22 1.25-1.706 1.33-.464.077-1.07.136-3.136-.719-2.64-1.092-4.33-3.784-4.46-3.957-.13-.173-1.07-1.424-1.07-2.715 0-1.29.676-1.926.916-2.186.243-.26.53-.325.707-.325.176 0 .353.002.507.01.163.007.382-.062.597.455.223.536.757 1.849.824 1.984.067.135.111.293.022.47-.09.176-.134.286-.266.442-.132.155-.278.347-.397.466-.133.132-.272.276-.118.54.154.263.686 1.13 1.472 1.83 1.013.9 1.867 1.18 2.132 1.312.266.132.42.11.576-.067.155-.176.663-.77.84-1.034.177-.264.354-.22.598-.132.243.088 1.547.73 1.813.863.265.132.442.198.508.31.066.11.066.643-.177 1.325z" />
              </svg>
              {/* Online Green Ping Indicator */}
              <span className="absolute top-1 right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-400 border-2 border-white" />
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
