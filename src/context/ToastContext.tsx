import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 4000) => {
      const id = `toast-${++counterRef.current}`;
      const toast: Toast = { id, message, type, duration };

      setToasts((prev) => [...prev, toast]);

      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((msg: string) => addToast(msg, 'success'), [addToast]);
  const error = useCallback((msg: string) => addToast(msg, 'error', 6000), [addToast]);
  const warning = useCallback((msg: string) => addToast(msg, 'warning', 5000), [addToast]);
  const info = useCallback((msg: string) => addToast(msg, 'info'), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      {/* Toast Container */}
      {toasts.length > 0 && (
        <div
          className="fixed bottom-6 right-6 flex flex-col gap-3 z-[var(--z-toast)]"
          style={{ maxWidth: '400px' }}
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`
                flex items-start gap-3 px-4 py-3 rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)]
                text-[var(--text-sm)] animate-slide-up cursor-pointer
                ${toast.type === 'success' ? 'bg-[var(--color-success)] text-white' : ''}
                ${toast.type === 'error' ? 'bg-[var(--color-error)] text-white' : ''}
                ${toast.type === 'warning' ? 'bg-[var(--color-warning)] text-white' : ''}
                ${toast.type === 'info' ? 'bg-[var(--color-text-primary)] text-white' : ''}
              `}
              onClick={() => removeToast(toast.id)}
              role="alert"
            >
              <span className="flex-1">{toast.message}</span>
              <button
                className="shrink-0 opacity-70 hover:opacity-100 text-white font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
};
