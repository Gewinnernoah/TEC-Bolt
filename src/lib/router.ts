// Pfad-basiertes Routing fuer die Anwendung (History API).
// Standardmaessig wird auf /login geleitet.
// Oeffentliche Routen ohne Anmeldung: /login, /TEC-Anzeige, /faq-public, /impressum, /dokumentation

export type Route =
  | 'landing'
  | 'dashboard'
  | 'login'
  | 'tec-display'
  | 'faq-public'
  | 'impressum';

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';

function stripBase(pathname: string): string {
  if (BASE && pathname.startsWith(BASE)) {
    return pathname.slice(BASE.length);
  }
  return pathname;
}

function normalizePath(pathname: string): string {
  return stripBase(pathname).replace(/^\/+/, '');
}

export function getRoute(): Route {
  const path = normalizePath(window.location.pathname).toLowerCase();
  if (path === 'dashboard') return 'dashboard';
  if (path === 'login') return 'login';
  if (path === 'tec-anzeige') return 'tec-display';
  if (path === 'faq-public') return 'faq-public';
  if (path === 'impressum') return 'impressum';
  // Root (/) leitet auf Login um
  if (path === '') return 'login';
  // Unbekannte Route -> Login
  return 'login';
}

export function navigateTo(route: Route): void {
  const routePath: Record<Route, string> = {
    landing: '/',
    dashboard: '/dashboard',
    login: '/login',
    'tec-display': '/TEC-Anzeige',
    'faq-public': '/faq-public',
    impressum: '/impressum',
  };
  const target = `${BASE}${routePath[route]}`;
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
