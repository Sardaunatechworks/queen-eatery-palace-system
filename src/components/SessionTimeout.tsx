import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Clock, LogOut, ShieldAlert } from 'lucide-react';

const INACTIVITY_LIMIT = 60 * 60 * 1000; // 1 Hour
const WARNING_THRESHOLD = 5 * 60 * 1000; // 5 Minutes

export const SessionTimeout: React.FC = () => {
  const { user, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(300);
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<any>(null);
  const countdownRef = useRef<any>(null);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) {
      setShowWarning(false);
      setRemainingSeconds(300);
    }
  }, [showWarning]);

  const handleLogout = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    await signOut();
    window.location.href = '/login';
  }, [signOut]);

  useEffect(() => {
    if (!user) return;

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetTimer));

    // Visibility change detection
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Just sync activity if they come back
        const inactiveTime = Date.now() - lastActivityRef.current;
        if (inactiveTime >= INACTIVITY_LIMIT) {
          handleLogout();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Main check interval
    timerRef.current = setInterval(() => {
      const inactiveTime = Date.now() - lastActivityRef.current;

      if (inactiveTime >= INACTIVITY_LIMIT) {
        handleLogout();
      } else if (inactiveTime >= INACTIVITY_LIMIT - WARNING_THRESHOLD) {
        if (!showWarning) {
          setShowWarning(true);
          const timeLeft = Math.floor((INACTIVITY_LIMIT - inactiveTime) / 1000);
          setRemainingSeconds(timeLeft);
        }
      }
    }, 10000); // Check every 10 seconds

    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [user, resetTimer, showWarning, handleLogout]);

  // Countdown timer when warning is shown
  useEffect(() => {
    if (showWarning && remainingSeconds > 0) {
      countdownRef.current = setInterval(() => {
        setRemainingSeconds(prev => {
          if (prev <= 1) {
            handleLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownRef.current) clearInterval(countdownRef.current);
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [showWarning, remainingSeconds, handleLogout]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!user) return null;

  return (
    <AnimatePresence>
      {showWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-dark/60 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-red-50"
          >
            <div className="p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto ring-8 ring-red-50/50">
                <ShieldAlert className="text-red-500" size={40} />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-dark tracking-tight">Session Expiring Soon</h2>
                <p className="text-gray-500 font-medium text-sm px-4">
                  You have been inactive for a while. For your security, you will be logged out in:
                </p>
              </div>

              <div className="bg-dark rounded-2xl p-6 flex items-center justify-center gap-4 text-white shadow-xl shadow-dark/20">
                <Clock className="text-primary animate-pulse" size={24} />
                <span className="text-4xl font-black tabular-nums tracking-tighter">
                  {formatTime(remainingSeconds)}
                </span>
              </div>

              <div className="flex flex-col gap-3 pt-4">
                <button
                  onClick={resetTimer}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-primary-dark transition-all shadow-lg shadow-primary/25 active:scale-95"
                >
                  Stay Logged In
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full py-4 bg-gray-50 text-gray-500 rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                >
                  <LogOut size={16} /> Logout Now
                </button>
              </div>
            </div>
            
            <div className="bg-red-50 py-3 px-6 text-center">
              <p className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em]">
                Auto-Security System Active
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
