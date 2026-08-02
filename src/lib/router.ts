// Pfad-basiertes Routing fuer die Anwendung (History API).
// Die Startseite (/) zeigt eine Landing-Page, das Dashboard ist unter /dashboard erreichbar.
//
// Beispiele:
//   http://localhost:5173/           → Landing-Page (Hauptseite)
//   http://localhost:5173/dashboard  → Dashboard (mit Anmeldung)
//   http://localhost:5173/login      → Anmeldeseite

export type Route = 'landing' | 'dashboard' | 'login';

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';

function stripBase(pathname: string): string {
  if (BASE && pathname.startsWith(BASE)) {
    return pathname.slice(BASE.length);
  }
  return pathname;
}

export function getRoute(): Route {
  const path = stripBase(window.location.pathname).replace(/^\/+/, '').toLowerCase();
  if (path === 'dashboard') return 'dashboard';
  if (path === 'login') return 'login';
  return 'landing';
}

export function navigateTo(route: Route): void {
  const target = route === 'landing' ? `${BASE}/` : `${BASE}/${route}`;
  if (window.location.pathname !== target) {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

export function onRouteChange(callback: (route: Route) => void): () => void {
  const handler = () => callback(getRoute());
  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
}
