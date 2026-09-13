import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { Menu as MenuIcon } from 'lucide-react';
import queenLogo from '../../assets/queen-logo.png';

export const DashboardLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Desktop Sidebar */}
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[var(--z-sidebar)] md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[var(--sidebar-width)] animate-slide-in-left">
            <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div
        className={`
          transition-all duration-[var(--transition-slow)]
          max-md:ml-0
          ${collapsed ? 'md:ml-[var(--sidebar-collapsed)]' : 'md:ml-[var(--sidebar-width)]'}
        `}
      >
        {/* Top Header */}
        <header className="sticky top-0 z-[var(--z-header)] bg-white border-b border-[var(--color-border)] h-[var(--header-height)] flex items-center px-4 md:px-6 shadow-xs">
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden mr-3 w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <MenuIcon size={20} className="text-[var(--color-text-secondary)]" />
          </button>

          {/* Page title area — populated by pages via context or portal */}
          <div className="flex-1" />

          {/* Right actions */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-active)] px-3 py-1.5 rounded-full">
              {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            {/* Notification bell */}
            <button className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] relative transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 md:p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
