import { useState, useMemo } from 'react';
import {
  ArrowLeft, BookOpen, Search, ChevronDown, ChevronUp,
  Package, HandHelping, Printer, Ticket, Radio, BarChart3,
  CalendarDays, Mic2, Users, Settings, Shield, Lock, Fingerprint,
  Server, Wifi, Cpu, Boxes, Wrench, ClipboardCheck, FileText,
  Palette, QrCode, Cog, AlertTriangle, CheckCircle2, Clock,
  Layers, Monitor, Bell, Database, Gauge, Send, ScanLine,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────────────────

interface DocFeature {
  title: string;
  desc: string;
}

interface DocSection {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  summary: string;
  features: DocFeature[];
  details: DocSubSection[];
}

interface DocSubSection {
  heading: string;
  icon?: LucideIcon;
  body: string[];
  bullets?: string[];
}

// ──────────────────────────────────────────────────────────────────────────
//  Documentation content
// ──────────────────────────────────────────────────────────────────────────

const SECTIONS: DocSection[] = [
  {
    id: 'inventar',
    label: 'Inventarverwaltung',
    icon: Package,
    color: 'blue',
    summary:
      'Alle Geräte der Schule zentral erfasst — mit Barcode-, NFC- und QR-Code-Tracking, Kategorien, Räumen und Schränken.',
    features: [
      { title: 'Geräte-Tracking', desc: 'Barcode, NFC-Tags und QR-Codes zur eindeutigen Identifikation jedes Geräts.' },
      { title: 'Kategorien & Standorte', desc: 'Geräte nach Kategorie, Gebäude, Raum, Schrank und Fach strukturiert.' },
      { title: 'Zustandsverwaltung', desc: 'Zustand (excellent, good, fair, damaged, defective) und Status pro Gerät.' },
      { title: 'Geräte-Bundles', desc: 'Vordefinierte Gerätesets für bestimmte Raumtypen schnell ausleihbar.' },
    ],
    details: [
      {
        heading: 'Geräte anlegen und bearbeiten',
        icon: Package,
        body: [
          'Personal und Administratoren können neue Geräte anlegen mit Inventarnummer, Hersteller, Modell, Seriennummer, Betriebssystem, Anschaffungswert und Garantiedatum.',
          'Jedem Gerät wird eine Tracking-Methode (Barcode, NFC) und ein QR-Code zugewiesen, sodass es über Scan schnell gefunden und ausgeliehen werden kann.',
        ],
        bullets: [
          'Inventarnummer, Name und Kategorie sind Pflichtfelder',
          'Hochwertige Geräte (is_high_value) werden gesondert markiert',
          'Metadaten-Feld für beliebige Zusatzinformationen (JSON)',
          'Notizen pro Gerät — intern oder öffentlich',
        ],
      },
      {
        heading: 'Schäden und Reparaturen',
        icon: Wrench,
        body: [
          'Schäden können pro Gerät gemeldet werden — mit Fotos, Schweregrad und Beschreibung. Reparaturen werden mit Intake-Formular, Status, Kosten und Wiederkehrend-Kennzeichnung dokumentiert.',
          'Reparaturkommentare ermöglichen die Nachverfolgung zwischen Personal und Technikern.',
        ],
      },
      {
        heading: 'Inventur & Audits',
        icon: ClipboardCheck,
        body: [
          'Administratoren können Inventur-Audits starten: Erwartete vs. tatsächliche Geräte werden abgeglichen, fehlende und unerwartete Geräte gezählt und ein Risikolevel (none, low, medium, high) berechnet.',
          'Audit-Positionen können einzeln gescannt und mit Notizen versehen werden.',
        ],
      },
    ],
  },
  {
    id: 'ausleihe',
    label: 'Ausleihe',
    icon: HandHelping,
    color: 'emerald',
    summary:
      'Lehrer stellen Ausleihanfragen, Personal genehmigt und dokumentiert die Ausgabe — mit digitaler Unterschrift, Zeiträumen und automatischer Rückverfolgung.',
    features: [
      { title: 'Anfrage-Workflow', desc: 'Lehrer fordern Geräte an, Personal genehmigt oder lehnt ab — mit Begründung.' },
      { title: 'Digitale Unterschrift', desc: 'Unterschrift bei Ausgabe und Rückgabe direkt auf dem Bildschirm erfasst.' },
      { title: 'Zeiträume & Pausen', desc: 'Stundenplan-basierte Ausleihzeiträume und definierbare Pausen.' },
      { title: 'Überfällig-Tracking', desc: 'Automatische Erkennung überfälliger Ausleihen und Status-Verfolgung.' },
    ],
    details: [
      {
        heading: 'Ausleihprozess Schritt für Schritt',
        icon: HandHelping,
        body: [
          '1. Lehrer erstellt eine Ausleihanfrage mit gewünschten Geräten oder Bundles, Raum und Zeitraum.',
          '2. Personal sieht offene Anfragen, genehmigt oder lehnt diese mit Begründung.',
          '3. Bei Ausgabe wird der Ausleih-Vorgang mit digitaler Unterschrift und Namen dokumentiert.',
          '4. Bei Rückgabe werden Zustand, Notizen und eine weitere Unterschrift erfasst.',
        ],
      },
      {
        heading: 'Zeiträume, Pausen und Kalender',
        icon: CalendarDays,
        body: [
          'Ausleihzeiträume basieren auf definierbaren Lending-Perioden (z. B. 1. Stunde, 2. Stunde, ganzer Tag). Pausen können pro Wochentag konfiguriert werden.',
          'Der Verfügbarkeitskalender zeigt, welche Geräte an welchen Tagen bereits ausgeliehen sind, sodass Konflikte vermieden werden.',
        ],
      },
      {
        heading: 'Rückgabe und Zustand',
        icon: CheckCircle2,
        body: [
          'Bei der Rückgabe wird der Zustand des Geräts (excellent bis defective) erfasst. Schäden können direkt als Schadensmeldung angelegt werden.',
          'Überfällige Ausleihen werden automatisch markiert und auf dem Dashboard sichtbar.',
        ],
      },
    ],
  },
  {
    id: '3d-druck',
    label: '3D-Druck-Service',
    icon: Printer,
    color: 'cyan',
    summary:
      'Lehrer reichen 3D-Druckaufträge ein, Personal validiert und druckt — mit Filament-Verwaltung, Drucker-Status und Fortschrittsverfolgung.',
    features: [
      { title: 'Auftragseinreichung', desc: 'Lehrer laden STL/OBJ-Dateien hoch und wählen Material, Farbe und Kopien.' },
      { title: 'Datei-Validierung', desc: 'Automatische Prüfung von Format, Größe und Druckbarkeit.' },
      { title: 'Filament-Verwaltung', desc: 'Katalog mit Materialien/Farben und Bestandsüberwachung pro Spule.' },
      { title: 'Drucker-Verwaltung', desc: 'Mehrere Drucker mit Status, IP-Adresse und aktiven Aufträgen.' },
    ],
    details: [
      {
        heading: 'Druckauftrag einreichen',
        icon: Send,
        body: [
          'Lehrer laden eine 3D-Modelldatei hoch (STL, OBJ, 3MF), wählen Filament-Material und Farbe aus dem Katalog, geben die Anzahl Kopien und optionale Notizen an.',
          'Das System schätzt Filament-Verbrauch (Gramm) und Druckdauer (Minuten).',
        ],
      },
      {
        heading: 'Validierung und Warteschlange',
        icon: CheckCircle2,
        body: [
          'Personal validiert die eingereichten Dateien (Format, Größe, Druckbarkeit). Ungültige Dateien werden mit Begründung abgelehnt.',
          'Gültige Aufträge werden der Warteschlange zugewiesen und einem freien Drucker zugeordnet. Der Status durchläuft: queued → validating → ready → printing → completed/failed.',
        ],
        bullets: [
          'Fortschrittsanzeige mit aktueller Schicht und Prozent',
          'Bambu-Lab-Integration (optional) für automatischen Druckstart',
          'Fehlgeschlagene Drucke mit Fehlergrund dokumentiert',
        ],
      },
      {
        heading: 'Filament-Bestand',
        icon: Boxes,
        body: [
          'Der Filament-Katalog verwaltet verfügbare Materialien (PLA, PETG, ABS, TPU …) und Farben mit Hex-Farbcode. Pro Spule werden Restbestand und Mindestmenge überwacht.',
          'Bei Unterschreitung des Mindestbestands wird auf niedrigen Vorrat hingewiesen.',
        ],
      },
    ],
  },
  {
    id: 'tickets',
    label: 'Support-Tickets',
    icon: Ticket,
    color: 'amber',
    summary:
      'Technische Probleme melden, priorisieren und bearbeiten — mit Kategorien, Dringlichkeitsstufen, Eskalation und Speedtest-Ergebnissen.',
    features: [
      { title: 'Ticket-Kategorien', desc: 'Vordefinierte Kategorien mit Icons, Farben und Pflichtfeldern.' },
      { title: 'Priorisierung', desc: 'Priorität low, normal, high, urgent — mit Eskalations-Möglichkeit.' },
      { title: 'Speedtest-Integration', desc: 'Bei Netzwerk-Tickets werden Speedtest- und Ping-Ergebnisse angehängt.' },
      { title: 'Kommentare', desc: 'Öffentliche und interne Kommentare pro Ticket.' },
    ],
    details: [
      {
        heading: 'Ticket erstellen',
        icon: Ticket,
        body: [
          'Jeder angemeldete Benutzer kann ein Ticket erstellen. Je Kategorie können ein Raum und/oder ein Speedtest-Ergebnis erforderlich sein.',
          'Tickets erhalten eine automatische Ticket-Nummer und einen Status (open, in_progress, resolved, closed, escalated).',
        ],
      },
      {
        heading: 'Bearbeitung und Eskalation',
        icon: AlertTriangle,
        body: [
          'Personal kann Tickets sich selbst zuweisen, den Status ändern, Kommentare hinzufügen und bei Bedarf eskalieren.',
          'Eskalierte Tickets werden auf dem Dashboard hervorgehoben und können mit Lösungsnotizen abgeschlossen werden.',
        ],
        bullets: [
          'Fotouploads zur Dokumentation des Problems',
          'Interne Kommentare (nur für Personal sichtbar)',
          'Lösungsquote und Bearbeitungszeit in der Analyse einsehbar',
        ],
      },
    ],
  },
  {
    id: 'netzwerk',
    label: 'Netzwerk-Monitoring & Gebäude',
    icon: Radio,
    color: 'violet',
    summary:
      'WLAN-Messungen pro Raum, Ausfall-Erkennung, Gebäude- und Raumverwaltung mit installierter Technik und Anschlüssen.',
    features: [
      { title: 'WLAN-Messungen', desc: 'Signalstärke, Download, Upload, Ping, Jitter und Paketverlust pro Raum.' },
      { title: 'Ausfall-Erkennung', desc: 'Automatische Markierung von Messungen als Ausfall (is_outage).' },
      { title: 'Gebäude & Räume', desc: 'Gebäude mit Etagen und Raumplänen, Räume mit Typ, Kapazität und Technik.' },
      { title: 'Installierte Technik', desc: 'Pro Raum: installierte Technik, verfügbare Anschlüsse und Verbindungen.' },
    ],
    details: [
      {
        heading: 'WLAN-Messungen durchführen',
        icon: Wifi,
        body: [
          'In jedem Raum können WLAN-Messungen erfasst werden: Signalstärke (dBm), Download/Upload (Mbps), Ping (ms), Jitter und Paketverlust.',
          'Messungen mit schlechten Werten oder als Ausfall markiert werden im Monitoring-Dashboard hervorgehoben.',
        ],
      },
      {
        heading: 'Räume und Gebäude verwalten',
        icon: Server,
        body: [
          'Gebäude werden mit Name, Code, Adresse und Etagenanzahl angelegt. Räume gehören zu einem Gebäude und haben eine Raumnummer, Etage, Raumtyp und Kapazität.',
          'Pro Raum werden installierte Technik (z. B. Beamer, Smartboard), verfügbare Anschlüsse (HDMI, VGA, USB-C) und Fotos dokumentiert.',
        ],
      },
      {
        heading: 'TEC-Raum Anzeige',
        icon: Monitor,
        body: [
          'Der TEC-Raum-Modus ist eine öffentlich zugängliche Anzeige (ohne Login), die für den TEC-Raum im Schulgebäude gedacht ist. Sie zeigt aktuelle Ausleihen, anstehende Rückgaben und Geräte-Status in Echtzeit.',
        ],
      },
    ],
  },
  {
    id: 'events',
    label: 'Events & Audimax',
    icon: Mic2,
    color: 'rose',
    summary:
      'Veranstaltungen planen mit Bühnenplänen, Equipment-Listen, Proben-Terminen und Aufgabenverteilung.',
    features: [
      { title: 'Event-Planung', desc: 'Veranstaltungen mit Typ, Raum, Zeitraum und Status anlegen.' },
      { title: 'Bühnenplan', desc: 'Visueller Bühnenplan mit Positionierung von Technik und Elementen.' },
      { title: 'Equipment-Liste', desc: 'Benötigtes Equipment mit Status (needed, ready, set, done) verwalten.' },
      { title: 'Proben & Aufgaben', desc: 'Proben-Termine und Aufgaben mit Zuweisung und Fälligkeit.' },
    ],
    details: [
      {
        heading: 'Event-Lebenszyklus',
        icon: Mic2,
        body: [
          'Events durchlaufen die Status: planning → preparation → rehearsal → ready → in_progress → completed (oder cancelled).',
          'Der Organisator kann den Status manuell weitersetzen und so den Fortschritt nachverfolgen.',
        ],
      },
      {
        heading: 'Equipment und Aufgaben',
        icon: ClipboardCheck,
        body: [
          'Jedes Event hat eine Equipment-Liste, in der jedes Item einen Status hat (needed → ready → set → done). Aufgaben können Personen zugewiesen und mit Fälligkeitsdatum versehen werden.',
        ],
      },
    ],
  },
  {
    id: 'analyse',
    label: 'Analyse & Berichte',
    icon: BarChart3,
    color: 'indigo',
    summary:
      'Auslastung, Ausleihstatistiken, Geräte-Zustände, WLAN-Qualität und Ticket-Analyse in übersichtlichen Diagrammen.',
    features: [
      { title: 'Ausleihstatistik', desc: 'Ausleihen pro Monat, Top-Ausleiher, meistgenutzte Räume.' },
      { title: 'Geräte-Analyse', desc: 'Geräte nach Kategorie, Status und Beliebtheit.' },
      { title: 'WLAN-Analyse', desc: 'Signalstärke und Ausfälle pro Raum und Monat.' },
      { title: 'Ticket-Analyse', desc: 'Tickets nach Kategorie, Priorität und Monat.' },
    ],
    details: [
      {
        heading: 'Verfügbare Auswertungen',
        icon: BarChart3,
        body: [
          'Die Analyse-Seite bietet Tab-Reiter für Ausleihe, Geräte, Räume, WLAN, Tickets, Drucke und Verbrauchsmaterialien.',
          'Pro Bereich werden Kennzahlen-Karten und Balkendiagramme angezeigt, die Einblicke über alle Plattformbereiche geben.',
        ],
      },
      {
        heading: 'Jahresbericht',
        icon: FileText,
        body: [
          'Mit dem Skript scripts/annual-report.mjs kann ein vollständiger Jahresbericht als Text- und HTML-Datei generiert werden. Der Bericht umfasst Geräteübersicht, Ausleihstatistik, 3D-Druck-Statistik, Ticket-Analyse und Benutzerübersicht.',
          'Aufruf: node scripts/annual-report.mjs [--year YYYY] [--html]',
        ],
      },
    ],
  },
  {
    id: 'faq',
    label: 'FAQ & Wissensdatenbank',
    icon: BookOpen,
    color: 'teal',
    summary:
      'Häufig gestellte Fragen und Anleitungen zentral für alle verfügbar — öffentlich ohne Login einsehbar.',
    features: [
      { title: 'Kategorien', desc: 'FAQs nach Allgemein, 3D-Druck, Ausleihe, Netzwerk, Inventar und Tickets.' },
      { title: 'Öffentlicher Zugriff', desc: 'FAQs sind ohne Anmeldung unter /faq-public erreichbar.' },
      { title: '3D-Druck-Markierung', desc: 'Artikel können als 3D-Druck-relevant markiert werden.' },
      { title: 'Volltextsuche', desc: 'Durchsuche alle FAQ-Artikel nach Stichworten.' },
    ],
    details: [
      {
        heading: 'FAQ verwalten',
        icon: BookOpen,
        body: [
          'Personal kann FAQ-Artikel mit Frage, Antwort, Kategorie und Sortierung anlegen und bearbeiten. Die Artikel erscheinen automatisch in der App und auf der öffentlichen FAQ-Seite.',
        ],
      },
    ],
  },
  {
    id: 'benutzer',
    label: 'Benutzer & Rollen',
    icon: Users,
    color: 'green',
    summary:
      'Vier Rollen mit unterschiedlichen Berechtigungen: Admin, Personal (Staff), Lehrer und Schüler — mit feingranularer Rechteverwaltung.',
    features: [
      { title: 'Rollen', desc: 'admin, staff, teacher, student — mit rollenbasiertem Zugriff.' },
      { title: 'Feingranulare Rechte', desc: 'Pro Benutzer: 3D-Druck, Ausleihe, Inventar, Events, Analyse, Tickets.' },
      { title: 'Fachbereiche', desc: 'Benutzer können Fachbereichen (Departments) zugeordnet werden.' },
      { title: 'Aktiv/Inaktiv', desc: 'Benutzer können deaktiviert werden, ohne gelöscht zu werden.' },
    ],
    details: [
      {
        heading: 'Rollen im Überblick',
        icon: Shield,
        body: [
          'Administratoren haben vollen Zugriff auf alle Bereiche inkl. Benutzerverwaltung, Systemeinstellungen und Aktivitätsprotokoll.',
          'Personal (Staff) verwaltet Inventar, Ausleihe, 3D-Druck, Tickets und Analyse.',
          'Lehrer stellen Ausleihanfragen, Druckaufträge und Tickets.',
          'Schüler haben eingeschränkten Zugriff auf Ausleihe, Kalender, 3D-Druck, Tickets und FAQ.',
        ],
      },
      {
        heading: 'Benutzerverwaltung',
        icon: Users,
        body: [
          'Administratoren können Benutzer anlegen, Rollen ändern, Rechte einzeln setzen (permissions), Benutzer aktivieren/deaktivieren und Passwörter zurücksetzen.',
          'Das Aktivitätsprotokoll protokolliert alle wichtigen Aktionen mit Benutzer, Aktion, Entität und Zeitstempel.',
        ],
      },
    ],
  },
  {
    id: 'auth',
    label: 'Authentifizierung & Sicherheit',
    icon: Lock,
    color: 'red',
    summary:
      'Passwort-Login, Fingerabdruck (WebAuthn), automatischer Logout und rollenbasierte Zugriffskontrolle.',
    features: [
      { title: 'Passwort-Login', desc: 'E-Mail/Passwort-Anmeldung über Supabase Auth.' },
      { title: 'Biometrie', desc: 'Fingerabdruck- und WebAuthn-Anmeldung (Passkeys).' },
      { title: 'Auto-Logout', desc: 'Automatischer Logout bei Inaktivität (konfigurierbar).' },
      { title: 'Passwort-Wechsel', desc: 'Erzwungener Passwort-Wechsel bei must_change_password.' },
    ],
    details: [
      {
        heading: 'Anmeldemethoden',
        icon: Fingerprint,
        body: [
          'Die primäre Anmeldung erfolgt per E-Mail und Passwort über Supabase Auth. Zusätzlich kann ein Fingerabdruck oder WebAuthn-Passkey registriert werden, um sich ohne Passwort anzumelden.',
          'WebAuthn-Credentials werden pro Benutzer gespeichert und können verwaltet werden.',
        ],
      },
      {
        heading: 'Sicherheitseinstellungen',
        icon: Settings,
        body: [
          'Administratoren können den automatischen Logout konfigurieren und einzelne Benutzer davon ausnehmen (exempt_auto_logout).',
          'Bei must_change_password wird der Benutzer nach der Anmeldung zum Passwortwechsel gezwungen.',
        ],
      },
    ],
  },
  {
    id: 'system',
    label: 'System & Konfiguration',
    icon: Cog,
    color: 'slate',
    summary:
      'Systemeinstellungen, Datenbankmodi, Aktivitätsprotokoll und Benachrichtigungen — die technische Basis der Plattform.',
    features: [
      { title: 'Datenbankmodi', desc: 'PostgreSQL (lokal), Supabase (Cloud) oder SQLite (Browser, offline).' },
      { title: 'Systemeinstellungen', desc: 'Schulweite Konfiguration in den System-Settings (key-value).' },
      { title: 'Aktivitätsprotokoll', desc: 'Alle Aktionen werden mit Benutzer und Zeitstempel protokolliert.' },
      { title: 'Benachrichtigungen', desc: 'In-App-Benachrichtigungen mit Priorität und Gelesen-Status.' },
    ],
    details: [
      {
        heading: 'Datenbankmodi',
        icon: Database,
        body: [
          'PostgreSQL (Standard): Lokaler PostgreSQL-Server, automatisch mit npm run dev gestartet.',
          'Supabase: Cloud-Datenbank mit Row-Level-Security — für den produktiven Einsatz.',
          'SQLite: Browser-only Offline-Modus ohne Server — ideal für Demos und Tests.',
        ],
      },
      {
        heading: 'Systemeinstellungen und Feiertage',
        icon: Settings,
        body: [
          'Systemeinstellungen werden als Key-Value-Paare gespeichert und können von Administratoren geändert werden.',
          'Feiertage und Ferien (vacation, holiday, closed) können definiert werden und beeinflussen den Verfügbarkeitskalender.',
        ],
      },
      {
        heading: 'Benachrichtigungen',
        icon: Bell,
        body: [
          'Benachrichtigungen informieren über neue Tickets, Ausleih-Statusänderungen, Druck-Fortschritt und more. Sie haben eine Priorität und einen Gelesen-Status und werden im Benachrichtigungs-Dropdown angezeigt.',
        ],
      },
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────────
//  Color helpers
// ──────────────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { icon: string; ring: string; text: string; badge: string; dot: string }> = {
  blue:    { icon: 'bg-blue-500/15 border-blue-500/30 text-blue-400',    ring: 'ring-blue-500/30',    text: 'text-blue-400',    badge: 'bg-blue-500/10 border-blue-500/20 text-blue-300',    dot: 'bg-blue-400' },
  emerald: { icon: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400', ring: 'ring-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300', dot: 'bg-emerald-400' },
  cyan:    { icon: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400',    ring: 'ring-cyan-500/30',    text: 'text-cyan-400',    badge: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300',    dot: 'bg-cyan-400' },
  amber:   { icon: 'bg-amber-500/15 border-amber-500/30 text-amber-400', ring: 'ring-amber-500/30',   text: 'text-amber-400',   badge: 'bg-amber-500/10 border-amber-500/20 text-amber-300',  dot: 'bg-amber-400' },
  violet:  { icon: 'bg-violet-500/15 border-violet-500/30 text-violet-400', ring: 'ring-violet-500/30', text: 'text-violet-400', badge: 'bg-violet-500/10 border-violet-500/20 text-violet-300', dot: 'bg-violet-400' },
  rose:    { icon: 'bg-rose-500/15 border-rose-500/30 text-rose-400',    ring: 'ring-rose-500/30',    text: 'text-rose-400',    badge: 'bg-rose-500/10 border-rose-500/20 text-rose-300',     dot: 'bg-rose-400' },
  indigo:  { icon: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400', ring: 'ring-indigo-500/30', text: 'text-indigo-400', badge: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300', dot: 'bg-indigo-400' },
  teal:    { icon: 'bg-teal-500/15 border-teal-500/30 text-teal-400',    ring: 'ring-teal-500/30',    text: 'text-teal-400',    badge: 'bg-teal-500/10 border-teal-500/20 text-teal-300',     dot: 'bg-teal-400' },
  green:   { icon: 'bg-green-500/15 border-green-500/30 text-green-400', ring: 'ring-green-500/30',   text: 'text-green-400',   badge: 'bg-green-500/10 border-green-500/20 text-green-300',  dot: 'bg-green-400' },
  red:     { icon: 'bg-red-500/15 border-red-500/30 text-red-400',       ring: 'ring-red-500/30',     text: 'text-red-400',     badge: 'bg-red-500/10 border-red-500/20 text-red-300',        dot: 'bg-red-400' },
  slate:   { icon: 'bg-slate-500/15 border-slate-500/30 text-slate-400', ring: 'ring-slate-500/30',   text: 'text-slate-400',   badge: 'bg-slate-700/40 border-slate-600/40 text-slate-300',  dot: 'bg-slate-400' },
};

function color(c: string) {
  return COLOR_MAP[c] ?? COLOR_MAP.blue;
}

// ──────────────────────────────────────────────────────────────────────────
//  Sub-components
// ──────────────────────────────────────────────────────────────────────────

function FeatureCard({ feature, icon: Icon, c }: { feature: DocFeature; icon: LucideIcon; c: ReturnType<typeof color> }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ring-1', c.icon)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-slate-200">{feature.title}</h4>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">{feature.desc}</p>
        </div>
      </div>
    </div>
  );
}

function SectionContent({ section, c }: { section: DocSection; c: ReturnType<typeof color> }) {
  const SubIcon = ({ icon: I }: { icon?: LucideIcon }) =>
    I ? <I className={cn('h-4 w-4', c.text)} /> : null;

  return (
    <div className="space-y-5">
      {/* Feature grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {section.features.map((f) => (
          <FeatureCard key={f.title} feature={f} icon={section.icon} c={c} />
        ))}
      </div>

      {/* Detailed subsections */}
      <div className="space-y-4">
        {section.details.map((sub) => (
          <div key={sub.heading} className="rounded-lg border border-slate-800/80 bg-slate-900/20 p-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <SubIcon icon={sub.icon} />
              {sub.heading}
            </h4>
            <div className="mt-2 space-y-2">
              {sub.body.map((p, i) => (
                <p key={i} className="text-sm text-slate-400 leading-relaxed">{p}</p>
              ))}
              {sub.bullets && (
                <ul className="mt-2 space-y-1.5">
                  {sub.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                      <CheckCircle2 className={cn('mt-0.5 h-4 w-4 flex-shrink-0', c.text)} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionAccordion({ section, c }: { section: DocSection; c: ReturnType<typeof color> }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-slate-800/30"
      >
        <div className={cn('flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border', c.icon)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-slate-100">{section.label}</h3>
          <p className="mt-0.5 text-sm text-slate-400 line-clamp-2">{section.summary}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={cn('badge text-[10px]', c.badge)}>
            {section.features.length} Funktionen
          </span>
          {open ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-800 p-5">
          <SectionContent section={section} c={c} />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  Main component
// ──────────────────────────────────────────────────────────────────────────

interface DocumentationPageProps {
  /** Optional back-navigation callback (public route). */
  onBack?: () => void;
}

export function DocumentationPage({ onBack }: DocumentationPageProps) {
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search) return SECTIONS;
    const q = search.toLowerCase();
    return SECTIONS.filter((s) => {
      if (
        s.label.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q)
      ) return true;
      return s.features.some(
        (f) => f.title.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q)
      ) || s.details.some(
        (d) => d.heading.toLowerCase().includes(q) || d.body.some((b) => b.toLowerCase().includes(q))
      );
    });
  }, [search]);

  const activeSection = activeId ? SECTIONS.find((s) => s.id === activeId) ?? null : null;

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-slate-200">
      <div className="mx-auto max-w-5xl px-6 py-12">
        {/* Back button */}
        {onBack && (
          <button
            onClick={onBack}
            className="mb-8 flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-blue-400"
          >
            <ArrowLeft className="h-4 w-4" /> Zurück
          </button>
        )}

        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600/20 to-cyan-600/20 ring-1 ring-blue-500/30">
            <BookOpen className="h-7 w-7 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Dokumentation</h1>
            <p className="text-sm text-slate-500">
              Übersicht über alle Funktionen der School TEC Hub Plattform
            </p>
          </div>
        </div>

        {/* Intro card */}
        <div className="card mb-6 p-5">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-400" />
            <div className="text-sm text-slate-400 leading-relaxed">
              <span className="font-medium text-slate-300">School TEC Hub</span> ist die
              zentrale Plattform für Inventarverwaltung, Ausleihe, 3D-Druck, Support-Tickets
              und Veranstaltungstechnik. Diese Dokumentation erklärt alle Bereiche der
              Anwendung — übersichtlich nach Modulen gegliedert. Klicken Sie auf einen
              Bereich, um die Details zu erweitern.
            </div>
          </div>
        </div>

        {/* Quick-nav badges */}
        <div className="mb-6 flex flex-wrap gap-2">
          {SECTIONS.map((s) => {
            const c = color(s.color);
            const Icon = s.icon;
            const isActive = activeId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setActiveId(isActive ? null : s.id);
                  if (!isActive) {
                    const el = document.getElementById(`section-${s.id}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                className={cn(
                  'badge transition-all',
                  isActive ? c.badge : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
                )}
              >
                <Icon className="h-3 w-3" />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Dokumentation durchsuchen..."
            className="input pl-10"
          />
        </div>

        {/* Active section expanded view */}
        {activeSection && (
          <div id={`section-${activeSection.id}`} className="card mb-6 border-2 p-0 overflow-hidden scroll-mt-4" style={{ borderColor: 'var(--tw-color, #1e293b)' }}>
            <div className={cn('flex items-center gap-4 border-b border-slate-800 p-5', color(activeSection.color).icon.replace('border-', 'border-0'))}>
              <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl border', color(activeSection.color).icon)}>
                <activeSection.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-slate-100">{activeSection.label}</h2>
                <p className="text-sm text-slate-400">{activeSection.summary}</p>
              </div>
              <button
                onClick={() => setActiveId(null)}
                className="btn-icon"
                aria-label="Section schließen"
              >
                <ChevronUp className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5">
              <SectionContent section={activeSection} c={color(activeSection.color)} />
            </div>
          </div>
        )}

        {/* Sections list (accordion) */}
        {filtered.length === 0 ? (
          <div className="card py-12 text-center">
            <BookOpen className="mx-auto mb-2 h-8 w-8 text-slate-600" />
            <p className="text-slate-400">Keine Bereiche gefunden.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered
              .filter((s) => s.id !== activeId)
              .map((section) => (
                <div key={section.id} id={`section-${section.id}`} className="scroll-mt-4">
                  <SectionAccordion section={section} c={color(section.color)} />
                </div>
              ))}
          </div>
        )}

        {/* Tech stack section */}
        <div className="mt-10">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-100">
            <Cpu className="h-5 w-5 text-blue-400" /> Technologie-Stack
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="card p-5">
              <Layers className="h-6 w-6 text-blue-400" />
              <h3 className="mt-2 text-sm font-semibold text-slate-200">Frontend</h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> React 18 + TypeScript</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Tailwind CSS (Dark Theme)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Vite Build-Tool</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Lucide Icons</li>
              </ul>
            </div>
            <div className="card p-5">
              <Database className="h-6 w-6 text-emerald-400" />
              <h3 className="mt-2 text-sm font-semibold text-slate-200">Datenbank</h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> PostgreSQL / Supabase</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Row-Level-Security (RLS)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> SQLite (Offline-Modus)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Supabase Auth</li>
              </ul>
            </div>
            <div className="card p-5">
              <Lock className="h-6 w-6 text-red-400" />
              <h3 className="mt-2 text-sm font-semibold text-slate-200">Sicherheit</h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Rollenbasierte Zugriffskontrolle</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> WebAuthn / Passkeys</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Digitale Unterschriften</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Aktivitätsprotokollierung</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Quick reference: roles */}
        <div className="mt-8">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-100">
            <Users className="h-5 w-5 text-green-400" /> Rollen-Referenz
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="table-header">Rolle</th>
                  <th className="table-header">Zugriff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr>
                  <td className="table-cell">
                    <span className="badge bg-red-500/10 border-red-500/20 text-red-300 text-[10px]">
                      <Shield className="h-3 w-3" /> Admin
                    </span>
                  </td>
                  <td className="table-cell text-slate-400">Vollzugriff — alle Bereiche, Benutzerverwaltung, Systemeinstellungen, Aktivitätsprotokoll</td>
                </tr>
                <tr>
                  <td className="table-cell">
                    <span className="badge bg-blue-500/10 border-blue-500/20 text-blue-300 text-[10px]">
                      <Wrench className="h-3 w-3" /> Staff
                    </span>
                  </td>
                  <td className="table-cell text-slate-400">Inventar, Ausleihe, 3D-Druck, Tickets, Monitoring, Events, Analyse, FAQ</td>
                </tr>
                <tr>
                  <td className="table-cell">
                    <span className="badge bg-emerald-500/10 border-emerald-500/20 text-emerald-300 text-[10px]">
                      <HandHelping className="h-3 w-3" /> Teacher
                    </span>
                  </td>
                  <td className="table-cell text-slate-400">Ausleihanfragen, 3D-Druck-Aufträge, Tickets erstellen, Monitoring, Events, FAQ</td>
                </tr>
                <tr>
                  <td className="table-cell">
                    <span className="badge bg-slate-600/30 border-slate-500/30 text-slate-300 text-[10px]">
                      <Users className="h-3 w-3" /> Student
                    </span>
                  </td>
                  <td className="table-cell text-slate-400">Ausleihe, Kalender, 3D-Druck, Tickets, FAQ</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Keyboard / shortcut hint */}
        <div className="mt-8 flex flex-wrap gap-3">
          <div className="card flex items-center gap-3 px-4 py-3">
            <ScanLine className="h-5 w-5 text-cyan-400" />
            <div>
              <div className="text-sm font-medium text-slate-200">Barcode / NFC-Scan</div>
              <div className="text-xs text-slate-500">Geräte werden über Barcode- oder NFC-Scanner identifiziert</div>
            </div>
          </div>
          <div className="card flex items-center gap-3 px-4 py-3">
            <QrCode className="h-5 w-5 text-violet-400" />
            <div>
              <div className="text-sm font-medium text-slate-200">QR-Code</div>
              <div className="text-xs text-slate-500">Jedes Gerät hat einen QR-Code für schnellen Zugriff</div>
            </div>
          </div>
          <div className="card flex items-center gap-3 px-4 py-3">
            <Gauge className="h-5 w-5 text-amber-400" />
            <div>
              <div className="text-sm font-medium text-slate-200">Realtime-Status</div>
              <div className="text-xs text-slate-500">Geräte- und Druck-Status in Echtzeit aktualisiert</div>
            </div>
          </div>
          <div className="card flex items-center gap-3 px-4 py-3">
            <Clock className="h-5 w-5 text-blue-400" />
            <div>
              <div className="text-sm font-medium text-slate-200">Auto-Logout</div>
              <div className="text-xs text-slate-500">Konfigurierbare automatische Abmeldung bei Inaktivität</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-10 text-center text-xs text-slate-600">
          School TEC Hub · Dokumentation · {SECTIONS.length} Bereiche ·
          Diese Seite ist öffentlich zugänglich und erfordert keine Anmeldung.
        </p>
      </div>
    </div>
  );
}

export default DocumentationPage;
