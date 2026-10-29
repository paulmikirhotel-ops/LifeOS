import Logo from '../components/Logo.jsx';
import Watermark from '../components/Watermark.jsx';
import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, CheckSquare, Calendar, Book, 
  Target, Zap, PieChart, Settings, Bell, Flag, 
  LogOut, User, Menu, X, Wallet, Heart,
  Sun, Moon, ChevronDown, Check, MoreHorizontal, Video, MessagesSquare
} from 'lucide-react';
import { QrCode } from 'lucide-react';
import { Scale } from 'lucide-react';
import { WifiOff } from 'lucide-react';
import OfflineBanner from '../components/offline/OfflineBanner.jsx';
import { HandHeart } from 'lucide-react';
import { Radar } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTenant } from '../context/TenantContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { NotificationProvider, useNotification } from '../context/NotificationContext.jsx';
import NotificationsPanel from '../components/NotificationsPanel.jsx';
import { ConnectProvider, useConnect } from '../context/ConnectContext.jsx';
import IncomingCall from '../components/connect/IncomingCall.jsx';
import NotificationToasts from '../components/NotificationToasts.jsx';

export default function AppLayout() {
  return (
    <NotificationProvider>
      <ConnectProvider>
        <AppLayoutInner />
        <IncomingCall />
      </ConnectProvider>
      <NotificationToasts />
    </NotificationProvider>
  );
}

function AppLayoutInner() {
  const { user, logout, memberships } = useAuth();
  const { activeTenant, switchTenant, can } = useTenant();
  const { theme, toggleTheme } = useTheme();
  const { unread: unreadCount, panelOpen, setPanelOpen } = useNotification();
  const { unread: chatUnread, requests: chatRequests } = useConnect();
  const connectBadge = chatUnread + chatRequests;
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Escape closes whichever menu is open (keyboard users otherwise have no way out).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setIsUserMenuOpen(false);
      setIsWorkspaceMenuOpen(false);
      setIsMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const initials = (user?.name || '?').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/', permission: '*' },
    { label: 'Tasks', icon: CheckSquare, path: '/tasks', permission: 'tasks.view' },
    { label: 'Calendar', icon: Calendar, path: '/calendar', permission: 'schedule.view' },
    { label: 'Meetings', icon: Video, path: '/meetings', permission: 'meetings.view' },
    { label: 'Connect', icon: MessagesSquare, path: '/connect', permission: '*' },
    { label: 'Community', icon: HandHeart, path: '/community', permission: '*' },
    { label: 'Data & offline', icon: WifiOff, path: '/data', permission: '*' },
    { label: 'Journal', icon: Book, path: '/journal', permission: 'journal.view' },
    { label: 'Focus', icon: Zap, path: '/focus', permission: '*' },
    { label: 'Finance', icon: Wallet, path: '/finance', permission: 'finance.view' },
    { label: 'Habits', icon: Heart, path: '/habits', permission: 'habits.view' },
    { label: 'Goals', icon: Target, path: '/goals', permission: 'goals.view' },
    { label: 'Opportunities', icon: Radar, path: '/radar', permission: 'goals.view' },
    { label: 'My life', icon: Scale, path: '/life', permission: 'goals.view' },
    { label: 'Link a device', icon: QrCode, path: '/link', permission: 'goals.view' },
    { label: 'NextStep', icon: Compass, path: '/nextstep', permission: 'goals.view' },
    { label: 'Assistant', icon: Sparkles, path: '/assistant', permission: '*' },
    { label: 'Analytics', icon: PieChart, path: '/analytics', permission: 'analytics.view' },
    { label: 'Settings', icon: Settings, path: '/settings', permission: '*' },
  ].filter(item => item.permission === '*' || can(item.permission));

  // Mobile: 3 core shortcuts + a "More" sheet that lists every remaining module.
  const mobileNav = navItems.slice(0, 3);
  const moreItems = navItems.slice(3);

  return (
    <div className="relative isolate min-h-screen bg-slate-50 dark:bg-slate-950 flex transition-colors duration-200">
      <Watermark shift={isSidebarOpen ? '8rem' : '2.5rem'} />
      {/* Desktop Sidebar */}
      <aside aria-label="Sidebar" className={`fixed inset-y-0 left-0 z-40 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 hidden md:flex flex-col ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className={`h-16 flex items-center border-b border-slate-200 dark:border-slate-800 ${isSidebarOpen ? 'px-6' : 'justify-center px-0'}`}>
          <Logo size={32} showText={isSidebarOpen} />
        </div>

        <nav aria-label="Main" className="flex-1 py-5 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              title={isSidebarOpen ? undefined : item.label}
              aria-label={isSidebarOpen ? undefined : item.label}
              className={({ isActive }) => `
                relative flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60
                ${isActive 
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 font-semibold' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'}
              `}
            >
              {({ isActive }) => (
                <>
                  <span aria-hidden="true" className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-indigo-500 transition-all duration-300 ${isActive ? 'h-5 opacity-100' : 'h-0 opacity-0'}`} />
                  <item.icon className={`w-5 h-5 flex-shrink-0 ${isSidebarOpen ? 'mr-3' : 'mx-auto'}`} />
                  {isSidebarOpen && <span className="truncate">{item.label}</span>}
                  {item.path === '/connect' && connectBadge > 0 && (
                    <span className={`rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white ${isSidebarOpen ? 'ml-auto' : 'absolute right-2 top-1.5'}`} aria-label={`${connectBadge} new in Connect`}>{connectBadge > 99 ? '99+' : connectBadge}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          {isSidebarOpen && (
            <button
              onClick={() => navigate('/settings')}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
            >
              <span className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{initials}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900 dark:text-white truncate">{user?.name}</span>
                <span className="block text-[11px] text-slate-500 truncate">{user?.email}</span>
              </span>
            </button>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={isSidebarOpen}
            className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 min-w-0 flex flex-col ${isSidebarOpen ? 'md:ml-64' : 'md:ml-20'} transition-all duration-300 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0`}>
        {/* Topbar */}
        <header className="h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-8 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            {/* Workspace Switcher */}
            <div className="relative">
              <button 
                onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
                aria-haspopup="menu"
                aria-expanded={isWorkspaceMenuOpen}
                aria-label="Switch workspace"
                className="flex items-center gap-2 px-3 min-h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
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
                  <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-20 py-2 animate-scale-in">
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
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
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
                className={`w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 relative transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${panelOpen ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
                aria-expanded={panelOpen}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-4 h-4 px-0.5 bg-red-500 animate-pop text-white text-[10px] flex items-center justify-center rounded-full font-bold border-2 border-white dark:border-slate-900">
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
                aria-haspopup="menu"
                aria-expanded={isUserMenuOpen}
                aria-label="Account menu"
                className="flex items-center justify-center w-10 h-10 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-xs font-bold flex items-center justify-center overflow-hidden">
                  {user?.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : initials}
                </div>
              </button>

              {isUserMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsUserMenuOpen(false)} />
                  <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-20 py-2 animate-scale-in">
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
                    {user?.role === 'platform-admin' && (
                      <button
                        onClick={() => { navigate('/admin/reports'); setIsUserMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm dark:text-slate-300"
                      >
                        <Flag className="w-4 h-4" /> Connect reports
                      </button>
                    )}
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
        <div className="flex-1 p-4 md:p-8 max-w-[1600px] w-full mx-auto min-w-0">
          {/* Keyed on the first path segment: the animation replays when the module changes, not on every sub-route. */}
          <div key={`/${location.pathname.split('/')[1]}`} className="page-enter">
            <OfflineBanner />
            <Outlet />
          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav aria-label="Primary" className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 md:hidden pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex items-center justify-around px-2 h-14">
          {mobileNav.map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `
                relative flex flex-col items-center justify-center gap-0.5 flex-1 min-h-12 py-1 rounded-xl transition-colors min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60
                ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}
              `}
            >
              {({ isActive }) => (
                <>
                  <span aria-hidden="true" className={`absolute top-0 h-0.5 rounded-full bg-indigo-500 transition-all duration-300 ${isActive ? 'w-8 opacity-100' : 'w-0 opacity-0'}`} />
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium truncate max-w-full px-0.5">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setIsMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isMoreOpen}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-h-12 py-1 rounded-xl transition-colors min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${isMoreOpen ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}
          >
            <span className="relative">
              <MoreHorizontal className="w-5 h-5" />
              {connectBadge > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-blue-600 ring-2 ring-white dark:ring-slate-900" aria-label="New messages in Connect" />}
            </span>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" bottom sheet */}
      {isMoreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="All modules">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsMoreOpen(false)} />
          <div className="sheet-in absolute bottom-0 inset-x-0 bg-white dark:bg-slate-900 rounded-t-2xl border-t border-slate-200 dark:border-slate-800 shadow-2xl max-h-[75dvh] flex flex-col pb-[env(safe-area-inset-bottom,0px)]">
            <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-bold dark:text-white">All modules</h2>
              <button
                onClick={() => setIsMoreOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
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
                  {item.path === '/connect' && connectBadge > 0 && <span className="ml-auto rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">{connectBadge > 99 ? '99+' : connectBadge}</span>}
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
