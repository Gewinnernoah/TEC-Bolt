import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { loadSettings } from '@/lib/settings';
import { dbReady } from '@/lib/db';
import { ToastProvider } from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppShell } from '@/components/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { LandingPage } from '@/pages/LandingPage';
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
import { getRoute, onRouteChange, navigateTo, type Route } from '@/lib/router';

function AppContent() {
  const { session, profile, loading, locked } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [route, setRoute] = useState<Route>(getRoute());

  useEffect(() => {
    const unsub = onRouteChange((r) => setRoute(r));
    return unsub;
  }, []);

  useEffect(() => {
    loadSettings();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
          <p className="mt-3 text-sm text-slate-400">Wird geladen...</p>
        </div>
      </div>
    );
  }

  // Landing-Page: nur anzeigen wenn nicht eingeloggt und Route = landing
  if (route === 'landing' && !session) {
    return <LandingPage />;
  }

  if (locked && session) {
    return <LoginPage locked />;
  }

  if (!session || !profile) {
    return <LoginPage />;
  }

  // Eingeloggt: Dashboard und Unterseiten
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

  // Admin-Seiten schuetzen
  if ((page === 'admin-users' || page === 'admin-settings' || page === 'admin-logs') && profile.role !== 'admin') {
    return (
      <AppShell current="dashboard" onNavigate={setPage}>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h2 className="text-lg font-semibold text-slate-200">Zugriff verweigert</h2>
          <p className="mt-1 text-sm text-slate-400">Sie benoetigen Administratorrechte, um auf diese Seite zuzugreifen.</p>
        </div>
      </AppShell>
    );
  }

  // Personal-Seiten schuetzen
  if ((page === 'inventory' || page === 'analytics') && profile.role === 'teacher') {
    return (
      <AppShell current="dashboard" onNavigate={setPage}>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h2 className="text-lg font-semibold text-slate-200">Zugriff verweigert</h2>
          <p className="mt-1 text-sm text-slate-400">Sie benoetigen Personalrechte, um auf diese Seite zuzugreifen.</p>
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
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    dbReady
      .then(() => setDbLoading(false))
      .catch((e: Error) => {
        console.error('[App] Datenbank-Initialisierung fehlgeschlagen:', e);
        setDbError(e.message || 'Unbekannter Datenbankfehler');
        setDbLoading(false);
      });
  }, []);

  if (dbLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
          <p className="mt-3 text-sm text-slate-400">Datenbank wird initialisiert...</p>
        </div>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a] p-6">
        <div className="max-w-lg rounded-xl border border-red-900/50 bg-red-950/20 p-8 text-center">
          <h2 className="text-xl font-bold text-red-400">Datenbankfehler</h2>
          <p className="mt-2 text-sm text-slate-400">
            Die Datenbank konnte nicht initialisiert werden. Bitte pruefen Sie die Konfiguration und laden Sie die Seite neu.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-left text-xs text-red-300">
            {dbError}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Neu laden
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
