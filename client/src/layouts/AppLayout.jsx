import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, CheckSquare, Calendar, Book, 
  Target, Zap, PieChart, Settings, Bell, 
  LogOut, User, Menu, X, Wallet, Heart,
  Sun, Moon, ChevronDown, Check, MoreHorizontal, Video
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTenant } from '../context/TenantContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { NotificationProvider, useNotification } from '../context/NotificationContext.jsx';
import NotificationsPanel from '../components/NotificationsPanel.jsx';
import NotificationToasts from '../components/NotificationToasts.jsx';

export default function AppLayout() {
  return (
    <NotificationProvider>
      <AppLayoutInner />
      <NotificationToasts />
    </NotificationProvider>
  );
}

function AppLayoutInner() {
  const { user, logout, memberships } = useAuth();
  const { activeTenant, switchTenant, can } = useTenant();
  const { theme, toggleTheme } = useTheme();
  const { unread: unreadCount, panelOpen, setPanelOpen } = useNotification();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const navigate = useNavigate();

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/', permission: '*' },
    { label: 'Tasks', icon: CheckSquare, path: '/tasks', permission: 'tasks.view' },
    { label: 'Calendar', icon: Calendar, path: '/calendar', permission: 'schedule.view' },
    { label: 'Meetings', icon: Video, path: '/meetings', permission: 'meetings.view' },
    { label: 'Journal', icon: Book, path: '/journal', permission: 'journal.view' },
    { label: 'Focus', icon: Zap, path: '/focus', permission: '*' },
    { label: 'Finance', icon: Wallet, path: '/finance', permission: 'finance.view' },
    { label: 'Habits', icon: Heart, path: '/habits', permission: 'habits.view' },
    { label: 'Goals', icon: Target, path: '/goals', permission: 'goals.view' },
    { label: 'Analytics', icon: PieChart, path: '/analytics', permission: 'analytics.view' },
    { label: 'Settings', icon: Settings, path: '/settings', permission: '*' },
  ].filter(item => item.permission === '*' || can(item.permission));

  // Mobile: 3 core shortcuts + a "More" sheet that lists every remaining module.
  const mobileNav = navItems.slice(0, 3);
  const moreItems = navItems.slice(3);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex transition-colors duration-200">
      {/* Desktop Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 hidden md:flex flex-col ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white font-bold shadow-md">
            L
          </div>
          {isSidebarOpen && <span className="ml-3 font-bold text-xl tracking-tight dark:text-white">LifeOS</span>}
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `
                flex items-center px-3 py-2.5 rounded-xl transition-all group
                ${isActive 
                  ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400 font-medium shadow-sm' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-indigo-500'}
              `}
            >
              <item.icon className={`w-5 h-5 flex-shrink-0 ${isSidebarOpen ? 'mr-3' : 'mx-auto'}`} />
              {isSidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col ${isSidebarOpen ? 'md:ml-64' : 'md:ml-20'} transition-all duration-300 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0`}>
        {/* Topbar */}
        <header className="h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-8 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            {/* Workspace Switcher */}
            <div className="relative">
              <button 
                onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="w-6 h-6 rounded bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                  {activeTenant?.name?.charAt(0) || 'W'}
                </div>
                <span className="hidden min-[420px]:inline text-sm font-semibold dark:text-white max-w-[120px] truncate">
                  {activeTenant?.name || 'Workspace'}
                </span>
                <ChevronDown className="hidden min-[420px]:block w-4 h-4 text-slate-400" />
              </button>

              {isWorkspaceMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsWorkspaceMenuOpen(false)} />
                  <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-20 py-2 animate-in fade-in slide-in-from-top-2">
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Workspaces</p>
                    </div>
                    {memberships.map((m) => (
                      <button
                        key={m.tenantId}
                        onClick={() => { switchTenant(m.tenantId); setIsWorkspaceMenuOpen(false); }}
                        className="w-full flex items-center justify-between px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs ${m.tenantId === activeTenant?.tenantId ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                            {m.name?.charAt(0) || 'W'}
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium dark:text-white">{m.name}</p>
                            <p className="text-[10px] text-slate-500 capitalize">{m.role}</p>
                          </div>
                        </div>
                        {m.tenantId === activeTenant?.tenantId && <Check className="w-4 h-4 text-indigo-500" />}
                      </button>
                    ))}
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 px-4">
                      <button className="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline">+ Create Workspace</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Notification bell (live badge via NotificationContext) */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  setPanelOpen(!panelOpen);
                }}
                className={`p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 relative transition-colors ${panelOpen ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
                aria-expanded={panelOpen}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-4 h-4 px-0.5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full font-bold border-2 border-white dark:border-slate-900">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <NotificationsPanel />
            </div>

            {/* User Menu */}
            <div className="relative">
              <button 
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 pl-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 overflow-hidden border border-slate-200 dark:border-slate-700">
                  {user?.avatar ? <img src={user.avatar} alt="" /> : <User className="w-5 h-5" />}
                </div>
              </button>

              {isUserMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsUserMenuOpen(false)} />
                  <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-20 py-2 animate-in fade-in slide-in-from-top-2">
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                      <p className="text-sm font-bold dark:text-white truncate">{user?.name}</p>
                      <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    </div>
                    <button 
                      onClick={() => { navigate('/settings'); setIsUserMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm dark:text-slate-300"
                    >
                      <User className="w-4 h-4" /> Profile Settings
                    </button>
                    <button 
                      onClick={logout}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm text-red-600"
                    >
                      <LogOut className="w-4 h-4" /> Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-4 md:p-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 md:hidden pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex items-center justify-around px-2 h-14">
          {mobileNav.map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              className={({ isActive }) => `
                flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-all min-w-0
                ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}
              `}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium truncate max-w-full px-0.5">{item.label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setIsMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-all min-w-0 ${isMoreOpen ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" bottom sheet */}
      {isMoreOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsMoreOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 bg-white dark:bg-slate-900 rounded-t-2xl border-t border-slate-200 dark:border-slate-800 shadow-2xl max-h-[75dvh] flex flex-col pb-[env(safe-area-inset-bottom,0px)]">
            <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-bold dark:text-white">All modules</h2>
              <button
                onClick={() => setIsMoreOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-3 space-y-1">
              {moreItems.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.path}
                  onClick={() => setIsMoreOpen(false)}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-4 py-3 rounded-xl transition-all
                    ${isActive
                      ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400 font-medium'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}
                  `}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                </NavLink>
              ))}
            </div>
            <div className="p-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => { setIsMoreOpen(false); logout(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="w-5 h-5" /> Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
