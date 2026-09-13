import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/index';
import type { NavGroup, UserRole } from '../../types';
import {
  LayoutDashboard,
  CreditCard,
  ClipboardList,
  UtensilsCrossed,
  Package,
  ChefHat,
  BarChart3,
  Users,
  FileText,
  Landmark,
  Bell,
  ScrollText,
  ShoppingBag,
  MapPin,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import queenLogo from '../../assets/queen-logo.png';

const iconMap: Record<string, React.ElementType> = {
  '📊': LayoutDashboard,
  '💳': CreditCard,
  '📋': ClipboardList,
  '🍽️': UtensilsCrossed,
  '📦': Package,
  '👨‍🍳': ChefHat,
  '📈': BarChart3,
  '👥': Users,
  '📝': FileText,
  '🏛️': Landmark,
  '🔔': Bell,
  '📜': ScrollText,
  '📍': MapPin,
  '👤': User,
};

const getNavGroups = (role: UserRole): NavGroup[] => {
  const groups: NavGroup[] = [];

  // Main navigation
  const mainItems = [
    { label: 'Dashboard', path: '/dashboard', icon: '📊', roles: ['super_admin', 'admin', 'cashier', 'kitchen', 'customer'] as UserRole[] },
  ];

  groups.push({ label: 'Main', items: mainItems.filter((item) => item.roles.includes(role)) });

  // Operations — Staff only
  if (['super_admin', 'admin', 'cashier'].includes(role)) {
    const ops = [];
    ops.push({ label: 'POS Terminal', path: '/pos', icon: '💳', permission: 'orders.create' });
    ops.push({ label: 'Orders', path: '/orders', icon: '📋', permission: 'orders.view' });
    if (['super_admin', 'admin'].includes(role)) {
      ops.push({ label: 'Menu', path: '/menu', icon: '🍽️', permission: 'menu.view' });
      ops.push({ label: 'Inventory', path: '/inventory', icon: '📦', permission: 'inventory.view' });
    }
    groups.push({ label: 'Operations', items: ops });
  }

  // Kitchen
  if (['super_admin', 'admin', 'kitchen'].includes(role)) {
    groups.push({
      label: 'Kitchen',
      items: [{ label: 'Kitchen Queue', path: '/kitchen', icon: '👨‍🍳', permission: 'orders.view' }],
    });
  }

  // Customer
  if (role === 'customer') {
    groups.push({
      label: 'My Account',
      items: [
        { label: 'My Orders', path: '/my-orders', icon: '📋' },
        { label: 'Track Order', path: '/track-order', icon: '📍' },
        { label: 'Profile', path: '/profile', icon: '👤' },
      ],
    });
  }

  // Admin section
  if (['super_admin', 'admin'].includes(role)) {
    groups.push({
      label: 'Administration',
      items: [
        { label: 'Reports', path: '/reports', icon: '📈', permission: 'reports.view' },
        { label: 'Staff', path: '/staff', icon: '👥', permission: 'staff.view' },
        { label: 'CMS', path: '/cms', icon: '📝', permission: 'cms.view' },
        { label: 'Event Hall', path: '/event-hall', icon: '🏛️', permission: 'event_hall.view_inquiries' },
        { label: 'Notifications', path: '/notifications', icon: '🔔' },
        { label: 'Audit Logs', path: '/audit-logs', icon: '📜', permission: 'audit.view' },
      ],
    });
  }

  return groups.filter((g) => g.items.length > 0);
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const navGroups = getNavGroups(user.role);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside
      className={`
        fixed left-0 top-0 bottom-0 z-[var(--z-sidebar)]
        bg-[var(--color-sidebar-bg)]
        flex flex-col transition-all duration-[var(--transition-slow)]
        ${collapsed ? 'w-[var(--sidebar-collapsed)]' : 'w-[var(--sidebar-width)]'}
        max-md:hidden
      `}
    >
      {/* Logo */}
      <div className="flex items-center h-[var(--header-height)] px-4 border-b border-[var(--color-sidebar-border)]">
        <div className="flex items-center gap-3 overflow-hidden">
          <img 
            src={queenLogo} 
            alt="Queen's Palace" 
            className="w-9 h-9 rounded-lg object-contain shrink-0"
          />
          {!collapsed && (
            <div className="overflow-hidden">
              <span className="text-sm font-bold text-[var(--color-brand-gold)] whitespace-nowrap">
                Queen's Palace
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 dark-scrollbar">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <span className="block px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-sidebar-section)]">
                {group.label}
              </span>
            )}
            {group.items.map((item) => {
              const IconComp = iconMap[item.icon] || LayoutDashboard;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `
                    flex items-center gap-3 h-10 px-3 rounded-lg relative
                    text-[var(--text-sm)] transition-colors duration-[var(--transition-fast)] no-underline
                    ${isActive
                      ? 'bg-[var(--color-sidebar-bg-active)] text-white font-medium'
                      : 'text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-bg-hover)] hover:text-[var(--color-sidebar-text-hover)]'
                    }
                  `}
                  title={collapsed ? item.label : undefined}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[var(--color-sidebar-accent)] rounded-r-full" />
                      )}
                      <IconComp 
                        size={18} 
                        className={`shrink-0 ${isActive ? 'text-[var(--color-sidebar-accent)]' : 'text-[var(--color-sidebar-section)]'}`} 
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="h-10 mx-2 mb-1 flex items-center justify-center rounded-lg text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-bg-hover)] transition-colors"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* User profile */}
      <div className="border-t border-[var(--color-sidebar-border)] p-3">
        <div className="flex items-center gap-3 mb-2">
          <Avatar name={user.name} size="sm" />
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">
                {user.name}
              </p>
              <p className="text-xs text-[var(--color-sidebar-text)] truncate">
                {user.roleDisplay}
              </p>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className={`
            flex items-center gap-2 w-full h-9 rounded-lg
            text-xs text-[var(--color-sidebar-text)]
            hover:text-red-400 hover:bg-red-900/20
            transition-colors no-underline
            ${collapsed ? 'justify-center px-0' : 'px-3'}
          `}
        >
          <LogOut size={16} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};
