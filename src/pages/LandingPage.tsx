import {
  Shield, ArrowRight, Package, HandHelping, Printer, Ticket, Radio,
  BarChart3, CalendarDays, Mic2, BookOpen, Server, Lock, Fingerprint,
  CheckCircle2, Cpu, Wifi, Users,
} from 'lucide-react';
import { navigateTo } from '@/lib/router';
import { IS_SUPABASE } from '@/lib/db';
import { cn } from '@/lib/utils';

export function LandingPage() {
  const features = [
    { icon: Package, title: 'Inventarverwaltung', desc: 'Alle Geraete zentral erfassen, mit Barcode, NFC und QR-Code-Tracking.' },
    { icon: HandHelping, title: 'Ausleihverwaltung', desc: 'Lehrer koennen Geraete anfragen, Personal genehmigt und dokumentiert Ausleihen.' },
    { icon: Printer, title: '3D-Druck-Service', desc: 'Druckauftraege einreichen, Fortschritt verfolgen und Filament-Bestaende verwalten.' },
    { icon: Ticket, title: 'Support-Tickets', desc: 'Technische Probleme melden und bearbeiten, mit Eskalationsstufen und Prioritaeten.' },
    { icon: Radio, title: 'Netzwerk & Gebaeude', desc: 'WLAN-Messungen, Gebaeudeplaene und Raumverwaltung an einem Ort.' },
    { icon: Mic2, title: 'Events & Audimax', desc: 'Veranstaltungen planen mit Buehnenplaenen, Equipment-Listen und Proben.' },
    { icon: BarChart3, title: 'Analyse & Berichte', desc: 'Auslastung, Ausleihstatistiken und Geraete-Zustaende auswerten.' },
    { icon: BookOpen, title: 'FAQ & Wissensdatenbank', desc: 'Haeufige Fragen und Loesungen zentral fuer alle verfuegbar machen.' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-slate-200">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800/50 bg-[#0a0e1a]/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/30">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-100">School TEC Hub</div>
              <div className="text-[10px] text-slate-500">Inventar- & Technikplattform</div>
            </div>
          </div>
          <button
            onClick={() => navigateTo('login')}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            Anmelden
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-16">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-cyan-600/10 blur-3xl" />
          <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-600/5 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-700/50 bg-slate-800/30 px-4 py-1.5">
            <Server className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-slate-400">
              {IS_SUPABASE ? 'Betrieben mit PostgreSQL' : 'Offline-Modus (SQLite)'}
            </span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-slate-100 sm:text-5xl lg:text-6xl">
            School TEC Hub
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
            Die komplette Plattform fuer Inventarverwaltung, Ausleihen, 3D-Druck,
            Support-Tickets und Veranstaltungstechnik — alles an einem Ort.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={() => navigateTo('login')}
              className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:shadow-xl hover:shadow-blue-500/40"
            >
              Zum Dashboard
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </button>
            <button
              onClick={() => navigateTo('login')}
              className="rounded-xl border border-slate-700 px-6 py-3 text-base font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800/50"
            >
              Anmelden
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Passwort- & Biometrie-Schutz</span>
            <span className="flex items-center gap-1.5"><Fingerprint className="h-3.5 w-3.5" /> Fingerabdruck-Login</span>
            <span className="flex items-center gap-1.5"><Server className="h-3.5 w-3.5" /> PostgreSQL-Datenbank</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative mx-auto max-w-7xl px-4 py-20 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-slate-100">Alle Funktionen</h2>
          <p className="mt-2 text-slate-400">Alles, was die Technikverwaltung einer Schule braucht</p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-slate-800 bg-slate-900/30 p-6 transition-all hover:border-slate-700 hover:bg-slate-800/40"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 ring-1 ring-blue-500/20">
                <f.icon className="h-5 w-5 text-blue-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-200">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech-Sektion */}
      <section className="border-t border-slate-800 bg-slate-900/20">
        <div className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <Cpu className="h-8 w-8 text-blue-400" />
              <h3 className="mt-3 text-lg font-semibold text-slate-100">Moderne Technologie</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> PostgreSQL-Datenbank</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> React + TypeScript</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Responsive Design</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <Wifi className="h-8 w-8 text-cyan-400" />
              <h3 className="mt-3 text-lg font-semibold text-slate-100">Netzwerk-Monitoring</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> WLAN-Messungen pro Raum</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Ausfall-Erkennung</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Geschwindigkeits-Tests</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <Users className="h-8 w-8 text-emerald-400" />
              <h3 className="mt-3 text-lg font-semibold text-slate-100">Rollenverwaltung</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Administratoren</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" />&nbsp;Ausleih-Personal</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Lehrer</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center lg:px-8">
        <h2 className="text-3xl font-bold text-slate-100">Bereit zu starten?</h2>
        <p className="mt-2 text-slate-400">Melden Sie sich an und verwalten Sie Ihre gesamte Technik</p>
        <button
          onClick={() => navigateTo('login')}
          className="group mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:shadow-xl"
        >
          Zum Dashboard
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-slate-500 lg:px-8">
          School TEC Hub · Inventar-, Ausleih- & Technik-Support-Plattform
        </div>
      </footer>
    </div>
  );
}
