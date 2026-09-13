import React, { useState, useEffect, useCallback } from "react";
import { Bell, Info, Package, ChefHat, CreditCard, Calendar } from "lucide-react";
import { 
  getNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead 
} from "../services/notificationService";
import type { Notification } from "../types";
import { useAuth } from "../context/AuthContext";
import { useSSE } from "../hooks/useSSE";
import { cn } from "../utils/cn";
import { formatDistanceToNow } from "date-fns";

export type { Notification };

export const NotificationBell: React.FC = () => {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await getNotifications(1, 25);
      if (response.success && response.data) {
        setNotifications(response.data);
        setUnreadCount(response.data.filter((n: Notification) => !n.is_read).length);
      }
    } catch (e) {
      console.error("Failed to load notifications", e);
    }
  }, []);

  useEffect(() => {
    if (profile) {
      fetchNotifications();
    }
  }, [profile, fetchNotifications]);

  const handleNotificationsSSE = useCallback((notes: Notification[]) => {
    if (Array.isArray(notes)) {
      setNotifications(prev => {
        // Merge without duplicates
        const noteMap = new Map<number | string, Notification>();
        notes.forEach(n => noteMap.set(n.id, n));
        prev.forEach(n => {
          if (!noteMap.has(n.id)) {
            noteMap.set(n.id, n);
          }
        });
        const merged = Array.from(noteMap.values());
        setUnreadCount(merged.filter(n => !n.is_read).length);
        return merged;
      });
    }
  }, []);

  useSSE({
    endpoint: "/sse/notifications",
    eventName: "notifications_update",
    onMessage: handleNotificationsSSE,
    fallbackPoll: fetchNotifications,
    fallbackIntervalMs: 15000,
    enabled: !!profile
  });

  const markAsRead = async (id: number | string) => {
    try {
      await markNotificationAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      console.error("Failed to mark notification as read", e);
    }
  };

  const markAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error("Failed to mark all as read", e);
    }
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'order': return <ChefHat size={16} className="text-blue-500" />;
      case 'payment': return <CreditCard size={16} className="text-green-500" />;
      case 'stock': return <Package size={16} className="text-orange-500" />;
      case 'event_hall': return <Calendar size={16} className="text-amber-500" />;
      case 'menu': return <Info size={16} className="text-purple-500" />;
      default: return <Bell size={16} className="text-gray-500" />;
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 bg-gray-100 text-gray-500 rounded-xl hover:bg-gray-200 transition-all active:scale-95"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white shadow-lg border-2 border-white animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-4 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-gray-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
              <div>
                <h3 className="text-sm font-black text-dark uppercase tracking-widest">Notifications</h3>
                <p className="text-[10px] font-bold text-gray-400 mt-0.5">Stay updated with restaurant activity</p>
              </div>
              {unreadCount > 0 && (
                <button 
                  onClick={markAllAsRead}
                  className="text-[10px] font-black text-primary uppercase hover:underline animate-pulse"
                >
                  Mark all as read
                </button>
              )}
            </div>

            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center opacity-30">
                  <Bell size={40} className="text-gray-300 mb-3" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">All caught up!</p>
                </div>
              ) : (
                notifications.map((note) => {
                  const rawDate = note.created_at || (note as any).createdAt || new Date().toISOString();
                  const dateVal = new Date(String(rawDate).replace(/-/g, "/"));
                  return (
                    <div 
                      key={note.id} 
                      onClick={() => !note.is_read && markAsRead(note.id)}
                      className={cn(
                        "p-4 border-b border-gray-50 flex gap-4 cursor-pointer transition-all hover:bg-gray-50/50",
                        !note.is_read ? "bg-primary/5" : ""
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                        !note.is_read ? "bg-white" : "bg-gray-50"
                      )}>
                        {getIcon(note.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="text-xs font-black text-dark leading-tight">{note.title}</h4>
                          <span className="text-[9px] text-gray-400 font-bold whitespace-nowrap">
                            {formatDistanceToNow(dateVal, { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed line-clamp-2">{note.message}</p>
                      </div>
                      {!note.is_read && (
                        <div className="w-2 h-2 bg-primary rounded-full shrink-0 mt-2" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {notifications.length > 0 && (
              <div className="p-4 bg-gray-50/30 text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Showing latest alerts</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// Legacy stub so files importing createNotification don't throw errors
export const createNotification = async (note: any) => {
  console.log("createNotification (stubbed):", note);
  return Promise.resolve();
};
