import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Menu, X, LogOut, Bell, Fingerprint, ChevronDown, Shield, Monitor, Lock,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { NAV_ITEMS, GROUP_LABELS, type NavItem } from '@/lib/nav';
import { ROLE_META } from '@/lib/constants';
import { cn, initials } from '@/lib/utils';
import { NotificationsDropdown } from './NotificationsDropdown';

interface AppShellProps {
  current: string;
  onNavigate: (id: string) => void;
  children: ReactNode;
}

export function AppShell({ current, onNavigate, children }: AppShellProps) {
  const { profile, signOut, lock } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  if (!profile) return null;

  const visibleItems = NAV_ITEMS.filter((i) => i.roles.includes(profile.role));
  const groups: NavItem['group'][] = ['main', 'support', 'admin'];
  const currentItem = visibleItems.find((i) => i.id === current);

  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-slate-800 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/30">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-100">TEC Hub</div>
          <div className="text-[10px] text-slate-500">School Inventory Platform</div>
        </div>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-3">
        {groups.map((group) => {
          const items = visibleItems.filter((i) => i.group === group);
          if (!items.length) return null;
          return (
            <div key={group}>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {GROUP_LABELS[group]}
              </div>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item.id); setMobileOpen(false); }}
                    className={cn('sidebar-link w-full', current === item.id && 'sidebar-link-active')}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-3">
        <button
          onClick={() => onNavigate('tec-room')}
          className="sidebar-link w-full text-slate-500 hover:text-cyan-400"
        >
          <Monitor className="h-4 w-4" />
          <span>TEC Room Display</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0e1a]">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 flex-shrink-0 border-r border-slate-800 bg-slate-900/40 lg:block">
        {Sidebar}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-slate-800 bg-slate-900 animate-slide-up">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 btn-icon">
              <X className="h-5 w-5" />
            </button>
            {Sidebar}
          </aside>
        </div>,
        document.body,
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="btn-icon lg:hidden">
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-sm font-medium text-slate-300">{currentItem?.label ?? 'TEC Hub'}</h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)} className="btn-icon relative">
                <Bell className="h-5 w-5" />
              </button>
              {notifOpen && <NotificationsDropdown onClose={() => setNotifOpen(false)} />}
            </div>

            <div className="relative">
              <button
                onClick={() => setUserMenu(!userMenu)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-800"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-xs font-semibold text-white">
                  {initials(profile.full_name)}
                </div>
                <div className="hidden text-left sm:block">
                  <div className="text-xs font-medium text-slate-200">{profile.full_name}</div>
                  <div className={cn('text-[10px]', ROLE_META[profile.role].color)}>
                    {ROLE_META[profile.role].label}
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </button>

              {userMenu && createPortal(
                <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)}>
                  <div
                    className="absolute right-4 top-14 w-56 card p-1.5 animate-scale-in"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-2 border-b border-slate-800">
                      <div className="text-sm font-medium text-slate-200">{profile.full_name}</div>
                      <div className="text-xs text-slate-500">{profile.email}</div>
                    </div>
                    {profile.fingerprint_enrolled && (
                      <div className="px-3 py-2 flex items-center gap-2 text-xs text-emerald-400">
                        <Fingerprint className="h-4 w-4" /> Fingerprint enrolled
                      </div>
                    )}
                    <button onClick={() => { lock(); }} className="sidebar-link w-full text-amber-400 hover:bg-amber-950/30">
                      <Lock className="h-4 w-4" /> Sitzung sperren
                    </button>
                    <button onClick={() => { signOut(); }} className="sidebar-link w-full text-red-400 hover:bg-red-950/30">
                      <LogOut className="h-4 w-4" /> Abmelden
                    </button>
                  </div>
                </div>,
                document.body,
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 lg:p-6">
          <div className="mx-auto max-w-7xl animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
