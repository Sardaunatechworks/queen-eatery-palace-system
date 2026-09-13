import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LogOut, Menu as MenuIcon, X, ChevronRight, Bell } from "lucide-react";
import { cn } from "../utils/cn";
import { NotificationBell } from "../components/NotificationBell";
import queenLogo from "../assets/queen-logo.png";

interface SidebarItem {
  name: string;
  path: string;
  icon: React.ElementType;
}

interface DashboardLayoutProps {
  navigation: SidebarItem[];
  title: string;
  children?: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ navigation, title, children }) => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { pathname } = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden animate-fade-in"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* ===== SIDEBAR — Dark Maroon Theme ===== */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-[250px] transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0",
        "bg-[#2D1414] flex flex-col border-r border-[#3D1E1E]",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo Area */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-[#3D1E1E]">
          <Link to="/" className="flex items-center gap-2.5 no-underline group">
            <img 
              src={queenLogo} 
              alt="Queen's Palace" 
              className="w-9 h-9 rounded-md object-contain"
            />
            <div>
              <span className="text-[#D4AF37] font-semibold text-sm tracking-wide block leading-none">
                Queen's Palace
              </span>
              <span className="text-[10px] text-stone-400 font-normal tracking-wider block mt-1">
                Eatery & Event Hall
              </span>
            </div>
          </Link>
          <button 
            className="md:hidden text-stone-400 hover:text-white transition-colors p-1"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 px-3 py-3 overflow-y-auto dark-scrollbar">
          <nav className="space-y-0.5">
            {navigation.map((item) => {
              const isActive = pathname === item.path || 
                (item.path !== '/admin' && pathname.startsWith(item.path));
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-[13px] font-medium no-underline",
                    isActive 
                      ? "bg-[#8B1E1E] text-white" 
                      : "text-stone-300 hover:bg-white/5 hover:text-white"
                  )}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <item.icon size={16} className={cn(
                    "shrink-0",
                    isActive ? "text-white" : "text-stone-400"
                  )} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Logout Button */}
        <div className="p-3 border-t border-[#3D1E1E]">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-stone-400 hover:bg-white/5 hover:text-red-300 transition-colors text-[13px] font-medium"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header Bar */}
        <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              className="md:hidden p-1.5 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <MenuIcon size={20} />
            </button>
            <div>
              <h1 className="text-sm sm:text-base font-semibold text-stone-900 leading-tight">
                {getGreeting()}, {profile?.name?.split(' ')[0] || 'Admin'}
              </h1>
              <p className="text-xs text-stone-500 hidden sm:block mt-0.5">
                {navigation.find(n => pathname.startsWith(n.path))?.name || title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-xs font-medium text-stone-500 bg-stone-100 px-2.5 py-1 rounded-md border border-stone-200">
              {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <NotificationBell />
          </div>
        </header>
        
        {/* Page Content Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-[1500px] mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
