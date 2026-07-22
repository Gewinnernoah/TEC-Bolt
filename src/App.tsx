import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { loadSettings } from '@/lib/settings';
import { ToastProvider } from '@/components/Toast';
import { AppShell } from '@/components/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { LendingPage } from '@/pages/LendingPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { PrintingPage } from '@/pages/PrintingPage';
import { TicketsPage } from '@/pages/TicketsPage';
import { MonitoringPage } from '@/pages/MonitoringPage';
import { FaqPage } from '@/pages/FaqPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { EventsPage } from '@/pages/EventsPage';
import { AdminUsersPage } from '@/pages/AdminUsersPage';
import { AdminSettingsPage } from '@/pages/AdminSettingsPage';
import { AdminLogsPage } from '@/pages/AdminLogsPage';
import { TecRoomPage } from '@/pages/TecRoomPage';

function AppContent() {
  const { session, profile, loading } = useAuth();
  const [page, setPage] = useState('dashboard');

  useEffect(() => {
    loadSettings();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
          <p className="mt-3 text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    return <LoginPage />;
  }

  // TEC room is a fullscreen display — renders outside the AppShell
  if (page === 'tec-room') {
    return <TecRoomPage onExit={() => setPage('dashboard')} />;
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <DashboardPage onNavigate={setPage} />;
      case 'inventory': return <InventoryPage />;
      case 'lending': return <LendingPage />;
      case 'calendar': return <CalendarPage />;
      case 'printing': return <PrintingPage />;
      case 'tickets': return <TicketsPage />;
      case 'monitoring': return <MonitoringPage />;
      case 'faq': return <FaqPage />;
      case 'analytics': return <AnalyticsPage />;
      case 'events': return <EventsPage />;
      case 'admin-users': return <AdminUsersPage />;
      case 'admin-settings': return <AdminSettingsPage />;
      case 'admin-logs': return <AdminLogsPage />;
      default: return <DashboardPage onNavigate={setPage} />;
    }
  };

  // Guard admin pages
  if ((page === 'admin-users' || page === 'admin-settings' || page === 'admin-logs') && profile.role !== 'admin') {
    return (
      <AppShell current="dashboard" onNavigate={setPage}>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h2 className="text-lg font-semibold text-slate-200">Access Denied</h2>
          <p className="mt-1 text-sm text-slate-400">You need administrator privileges to access this page.</p>
        </div>
      </AppShell>
    );
  }

  // Guard staff-only pages
  if ((page === 'inventory' || page === 'analytics') && profile.role === 'teacher') {
    return (
      <AppShell current="dashboard" onNavigate={setPage}>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h2 className="text-lg font-semibold text-slate-200">Access Denied</h2>
          <p className="mt-1 text-sm text-slate-400">You need staff privileges to access this page.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell current={page} onNavigate={setPage}>
      {renderPage()}
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
