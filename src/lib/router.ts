// Hash-basiertes Routing fuer die Anwendung.
// Die Startseite (/) zeigt eine Landing-Page, das Dashboard ist unter /dashboard erreichbar.
//
// Beispiele:
//   http://localhost:5173/           → Landing-Page (Hauptseite)
//   http://localhost:5173/#/dashboard → Dashboard
//   http://localhost:5173/#/login     → Anmeldung

export type Route = 'landing' | 'dashboard' | 'login';

export function getRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (hash === 'dashboard') return 'dashboard';
  if (hash === 'login') return 'login';
  return 'landing';
}

export function navigateTo(route: Route): void {
  const target = route === 'landing' ? '#/' : `#/${route}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

export function onRouteChange(callback: (route: Route) => void): () => void {
  const handler = () => callback(getRoute());
  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}
