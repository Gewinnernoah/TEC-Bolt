#!/usr/bin/env node
//
// annual-report.mjs
// Generates a full annual report for the School TEC Hub platform.
//
// Queries the Supabase database for counts and statistics across all
// major areas (Inventar, Ausleihe, 3D-Druck, Tickets, Benutzer, …)
// and writes a formatted text report to annual-report-YYYY.txt.
//
// Usage:
//   node scripts/annual-report.mjs              # report for current year
//   node scripts/annual-report.mjs --year 2024  # report for a specific year
//   node scripts/annual-report.mjs --html        # also write an .html version
//
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// ───────────────────────────────────────────────────────────────────────────
//  Environment / config
// ───────────────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(projectRoot, '.env');
  if (!existsSync(envPath)) {
    console.error('\x1b[31m[FEHLER] Keine .env-Datei gefunden.\x1b[0m');
    console.error(`Gesucht in: ${envPath}`);
    console.error('Bitte zuerst den Autoinstaller ausführen oder .env erstellen.');
    process.exit(1);
  }
  const content = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return env;
}

const env = loadEnv();

// The script needs service-role access to read across all RLS-protected tables.
// Support several common env var names for flexibility.
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('\x1b[31m[FEHLER] Supabase-Zugangsdaten fehlen.\x1b[0m');
  console.error('Benötigt in .env:');
  console.error('  SUPABASE_URL            (oder VITE_SUPABASE_URL)');
  console.error('  SUPABASE_SERVICE_ROLE_KEY (Service-Role-Key zum Lesen aller Daten)');
  console.error('');
  console.error('\x1b[33mHinweis:\x1b[0m Der Service-Role-Key umgeht Row-Level-Security.');
  console.error('Niemals im Browser verwenden! Nur für serverseitige Skripte wie dieses.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ───────────────────────────────────────────────────────────────────────────
//  CLI args
// ───────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const now = new Date();
let year = now.getFullYear();
let wantHtml = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--year' && args[i + 1]) {
    year = Number(args[i + 1]);
    i++;
  } else if (args[i] === '--html') {
    wantHtml = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Verwendung: node scripts/annual-report.mjs [--year YYYY] [--html]');
    process.exit(0);
  }
}

const YEAR_START = `${year}-01-01T00:00:00+00:00`;
const YEAR_END = `${year + 1}-01-01T00:00:00+00:00`;

// ───────────────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────────────

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);
const line = (char = '─', n = 64) => char.repeat(n);
const sectionLine = () => line('═', 64);

function pct(part, total) {
  if (!total) return '0,0 %';
  return `${((part / total) * 100).toFixed(1).replace('.', ',')} %`;
}

function fmtNum(n) {
  return new Intl.NumberFormat('de-DE').format(n ?? 0);
}

function fmtEUR(n) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n ?? 0);
}

const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function monthLabel(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Unbekannt';
  return `${MONTHS_DE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Safe count helper: counts rows in a table, optionally filtered to the year.
async function countTable(table, yearColumn = 'created_at', extraFilter = null) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (yearColumn) q = q.gte(yearColumn, YEAR_START).lt(yearColumn, YEAR_END);
  if (extraFilter) q = extraFilter(q);
  const { count, error } = await q;
  if (error) {
    console.warn(`\x1b[33m[Warnung] count(${table}) fehlgeschlagen: ${error.message}\x1b[0m`);
    return 0;
  }
  return count ?? 0;
}

// Fetch rows (limited) with selection — used for breakdowns/aggregations.
async function fetchRows(table, select = '*', yearColumn = 'created_at', limit = 10000) {
  let q = supabase.from(table).select(select).limit(limit);
  if (yearColumn) q = q.gte(yearColumn, YEAR_START).lt(yearColumn, YEAR_END);
  const { data, error } = await q;
  if (error) {
    console.warn(`\x1b[33m[Warnung] fetch(${table}) fehlgeschlagen: ${error.message}\x1b[0m`);
    return [];
  }
  return data ?? [];
}

// Total count ignoring year filter (for "bestand" snapshots).
async function countAll(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    console.warn(`\x1b[33m[Warnung] countAll(${table}) fehlgeschlagen: ${error.message}\x1b[0m`);
    return 0;
  }
  return count ?? 0;
}

async function fetchAll(table, select = '*', limit = 10000) {
  const { data, error } = await supabase.from(table).select(select).limit(limit);
  if (error) {
    console.warn(`\x1b[33m[Warnung] fetchAll(${table}) fehlgeschlagen: ${error.message}\x1b[0m`);
    return [];
  }
  return data ?? [];
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row) ?? 'Unbekannt';
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function topEntries(map, n = 10) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// ───────────────────────────────────────────────────────────────────────────
//  Data collection
// ───────────────────────────────────────────────────────────────────────────

async function collectData() {
  const data = {};

  // Geräteübersicht — Bestand ist nicht jahresgebunden, aber Status & Zustand aktuell.
  const devices = await fetchAll('devices', 'id, status, condition, is_high_value, value, category_id, category:inventory_categories(name)');
  data.devices = {
    total: devices.length,
    byStatus: groupBy(devices, (d) => d.status),
    byCondition: groupBy(devices, (d) => d.condition),
    highValue: devices.filter((d) => d.is_high_value).length,
    totalValue: devices.reduce((sum, d) => sum + Number(d.value || 0), 0),
    byCategory: groupBy(devices, (d) => d.category?.name ?? 'Ohne Kategorie'),
  };

  // Ausleihstatistik
  const loans = await fetchRows('lending_loans', 'id, status, checkout_at, actual_return_at, expected_return_at, teacher_id, room_id, teacher:profiles!lending_loans_teacher_id_fkey(full_name), room:rooms(name)', 'checkout_at');
  data.loans = {
    total: loans.length,
    active: loans.filter((l) => l.status === 'active').length,
    returned: loans.filter((l) => l.status === 'returned').length,
    overdue: loans.filter((l) => l.status === 'overdue').length,
    byMonth: groupBy(loans, (l) => monthLabel(l.checkout_at)),
    byTeacher: groupBy(loans, (l) => l.teacher?.full_name ?? 'Unbekannt'),
    byRoom: groupBy(loans, (l) => l.room?.name ?? 'Ohne Raum'),
  };

  const requests = await fetchRows('lending_requests', 'id, status', 'created_at');
  data.requests = {
    total: requests.length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
    pending: requests.filter((r) => r.status === 'pending').length,
    fulfilled: requests.filter((r) => r.status === 'fulfilled').length,
  };

  // 3D-Druck-Statistik
  const prints = await fetchRows('print_requests', 'id, status, filament_material, filament_color, estimated_grams, copies, teacher_id, teacher:profiles!print_requests_teacher_id_fkey(full_name)', 'created_at');
  data.prints = {
    total: prints.length,
    completed: prints.filter((p) => p.status === 'completed').length,
    failed: prints.filter((p) => p.status === 'failed').length,
    printing: prints.filter((p) => p.status === 'printing' || p.status === 'ready' || p.status === 'validating').length,
    queued: prints.filter((p) => p.status === 'queued').length,
    cancelled: prints.filter((p) => p.status === 'cancelled').length,
    totalCopies: prints.reduce((s, p) => s + Number(p.copies || 0), 0),
    totalGrams: prints.reduce((s, p) => s + Number(p.estimated_grams || 0), 0),
    byMaterial: groupBy(prints, (p) => p.filament_material ?? 'Unbekannt'),
    byStatus: groupBy(prints, (p) => p.status),
    byTeacher: groupBy(prints, (p) => p.teacher?.full_name ?? 'Unbekannt'),
  };

  const printers = await fetchAll('printers', 'id, name, model, status, is_active');
  data.printers = {
    total: printers.length,
    active: printers.filter((p) => p.is_active).length,
  };

  const filament = await fetchAll('filament_inventory', 'id, remaining_grams, total_grams, catalog:filament_catalog(material, color)');
  data.filament = {
    spools: filament.length,
    remainingGrams: filament.reduce((s, f) => s + Number(f.remaining_grams || 0), 0),
    totalGrams: filament.reduce((s, f) => s + Number(f.total_grams || 0), 0),
  };

  // Ticket-Analyse
  const tickets = await fetchRows('tickets', 'id, status, priority, category_key, escalated, created_at, resolved_at, category:ticket_categories(name)', 'created_at');
  data.tickets = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'open').length,
    inProgress: tickets.filter((t) => t.status === 'in_progress').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
    closed: tickets.filter((t) => t.status === 'closed').length,
    escalated: tickets.filter((t) => t.status === 'escalated' || t.escalated).length,
    byPriority: groupBy(tickets, (t) => t.priority),
    byCategory: groupBy(tickets, (t) => t.category?.name ?? t.category_key ?? 'Unbekannt'),
    byMonth: groupBy(tickets, (t) => monthLabel(t.created_at)),
  };

  // Benutzerübersicht
  const profiles = await fetchAll('profiles', 'id, role, is_active, department, created_at');
  data.users = {
    total: profiles.length,
    active: profiles.filter((u) => u.is_active).length,
    inactive: profiles.filter((u) => !u.is_active).length,
    byRole: groupBy(profiles, (u) => u.role),
    byDepartment: groupBy(profiles, (u) => u.department ?? 'Keine Angabe'),
    newThisYear: profiles.filter((u) => {
      const c = new Date(u.created_at);
      return c >= new Date(YEAR_START) && c < new Date(YEAR_END);
    }).length,
  };

  // Räume & Gebäude
  const rooms = await fetchAll('rooms', 'id, name, room_type');
  data.rooms = {
    total: rooms.length,
    byType: groupBy(rooms, (r) => r.room_type ?? 'Unbekannt'),
  };
  data.buildings = await countAll('buildings');

  // Netzwerk-Messungen
  const wifi = await fetchRows('wifi_measurements', 'id, signal_strength_dbm, download_mbps, upload_mbps, is_outage, room_id, room:rooms(name)', 'created_at');
  data.wifi = {
    total: wifi.length,
    outages: wifi.filter((w) => w.is_outage).length,
    avgSignal: wifi.length ? Math.round(wifi.reduce((s, w) => s + Number(w.signal_strength_dbm || 0), 0) / wifi.length) : 0,
    avgDownload: wifi.length ? Math.round(wifi.reduce((s, w) => s + Number(w.download_mbps || 0), 0) / wifi.length) : 0,
    avgUpload: wifi.length ? Math.round(wifi.reduce((s, w) => s + Number(w.upload_mbps || 0), 0) / wifi.length) : 0,
  };

  // Events
  const events = await fetchRows('events', 'id, status, event_type', 'created_at');
  data.events = {
    total: events.length,
    byStatus: groupBy(events, (e) => e.status),
    byType: groupBy(events, (e) => e.event_type ?? 'Unbekannt'),
  };

  // Schadensmeldungen & Reparaturen
  data.damageReports = await countTable('damage_reports', 'created_at');
  const repairs = await fetchRows('repair_records', 'id, repair_status, cost', 'created_at');
  data.repairs = {
    total: repairs.length,
    resolved: repairs.filter((r) => r.repair_status === 'resolved' || r.repair_status === 'completed').length,
    totalCost: repairs.reduce((s, r) => s + Number(r.cost || 0), 0),
  };

  // FAQ / Wissensdatenbank
  data.faqs = await countAll('faq_articles');
  data.faqsThisYear = await countTable('faq_articles', 'created_at');

  // Inventur-Audits
  const audits = await fetchRows('inventory_audits', 'id, status, expected_count, actual_count, missing_count, risk_level', 'created_at');
  data.audits = {
    total: audits.length,
    completed: audits.filter((a) => a.status === 'completed').length,
    totalMissing: audits.reduce((s, a) => s + Number(a.missing_count || 0), 0),
  };

  return data;
}

// ───────────────────────────────────────────────────────────────────────────
//  Text report generation
// ───────────────────────────────────────────────────────────────────────────

function kv(label, value) {
  return `  ${pad(label, 34)} ${value}`;
}

function renderBreakdown(map, limit = 10) {
  const entries = topEntries(map, limit);
  if (!entries.length) return '  — Keine Daten —';
  const maxKey = Math.max(...entries.map((e) => e[0].length), 10);
  return entries
    .map(([k, v]) => `  ${pad(k, maxKey + 2)} ${rpad(v, 6)}  (${pct(v, entries.reduce((s, e) => s + e[1], 0))})`)
    .join('\n');
}

function buildTextReport(d) {
  const L = [];
  const title = `JAHRESBERICHT ${year} — School TEC Hub`;
  L.push(sectionLine());
  L.push(title);
  L.push(`Erstellt am: ${now.toLocaleString('de-DE')}`);
  L.push(sectionLine());
  L.push('');

  // ── Geräteübersicht ──
  L.push('GERÄTEÜBERSICHT');
  L.push(line('─'));
  L.push(kv('Geräte gesamt:', fmtNum(d.devices.total)));
  L.push(kv('Hochwertige Geräte (is_high_value):', fmtNum(d.devices.highValue)));
  L.push(kv('Gesamtwert (Anschaffung):', fmtEUR(d.devices.totalValue)));
  L.push('');
  L.push('  Status-Verteilung:');
  L.push(renderBreakdown(d.devices.byStatus));
  L.push('');
  L.push('  Zustand (Condition):');
  L.push(renderBreakdown(d.devices.byCondition));
  L.push('');
  L.push('  Geräte nach Kategorie:');
  L.push(renderBreakdown(d.devices.byCategory));
  L.push('');

  // ── Ausleihstatistik ──
  L.push('AUSLEIHSTATISTIK');
  L.push(line('─'));
  L.push(kv('Ausleihen in ' + year + ':', fmtNum(d.loans.total)));
  L.push(kv('  davon aktiv:', fmtNum(d.loans.active)));
  L.push(kv('  davon zurückgegeben:', fmtNum(d.loans.returned)));
  L.push(kv('  davon überfällig:', fmtNum(d.loans.overdue)));
  L.push('');
  L.push('  Ausleihanfragen in ' + year + ':');
  L.push(kv('  Anfragen gesamt:', fmtNum(d.requests.total)));
  L.push(kv('    genehmigt:', fmtNum(d.requests.approved)));
  L.push(kv('    abgelehnt:', fmtNum(d.requests.rejected)));
  L.push(kv('    erfüllt:', fmtNum(d.requests.fulfilled)));
  L.push(kv('    offen:', fmtNum(d.requests.pending)));
  L.push('');
  L.push('  Ausleihen pro Monat:');
  L.push(renderBreakdown(d.loans.byMonth, 12));
  L.push('');
  L.push('  Top-Ausleiher:');
  L.push(renderBreakdown(d.loans.byTeacher));
  L.push('');
  L.push('  Meistgenutzte Räume (Ausleihe):');
  L.push(renderBreakdown(d.loans.byRoom));
  L.push('');

  // ── 3D-Druck-Statistik ──
  L.push('3D-DRUCK-STATISTIK');
  L.push(line('─'));
  L.push(kv('Druckaufträge in ' + year + ':', fmtNum(d.prints.total)));
  L.push(kv('  abgeschlossen:', fmtNum(d.prints.completed)));
  L.push(kv('  fehlgeschlagen:', fmtNum(d.prints.failed)));
  L.push(kv('  in Bearbeitung:', fmtNum(d.prints.printing)));
  L.push(kv('  in Warteschlange:', fmtNum(d.prints.queued)));
  L.push(kv('  abgebrochen:', fmtNum(d.prints.cancelled)));
  L.push(kv('Kopien gesamt:', fmtNum(d.prints.totalCopies)));
  L.push(kv('Filament geschätzt:', `${fmtNum(d.prints.totalGrams)} g`));
  L.push('');
  L.push('  Erfolgsquote:', ` ${pct(d.prints.completed, d.prints.total)}`);
  L.push('');
  L.push('  Drucke nach Material:');
  L.push(renderBreakdown(d.prints.byMaterial));
  L.push('');
  L.push('  Drucke nach Status:');
  L.push(renderBreakdown(d.prints.byStatus));
  L.push('');
  L.push('  Top-Druckauftraggeber:');
  L.push(renderBreakdown(d.prints.byTeacher));
  L.push('');
  L.push('  Drucker im System:');
  L.push(kv('Gesamt:', fmtNum(d.printers.total)));
  L.push(kv('Aktiv:', fmtNum(d.printers.active)));
  L.push('');
  L.push('  Filament-Bestand:');
  L.push(kv('Spulen:', fmtNum(d.filament.spools)));
  L.push(kv('Verbleibend:', `${fmtNum(d.filament.remainingGrams)} g`));
  L.push(kv('Gesamtkapazität:', `${fmtNum(d.filament.totalGrams)} g`));
  L.push('');

  // ── Ticket-Analyse ──
  L.push('TICKET-ANALYSE');
  L.push(line('─'));
  L.push(kv('Tickets in ' + year + ':', fmtNum(d.tickets.total)));
  L.push(kv('  offen:', fmtNum(d.tickets.open)));
  L.push(kv('  in Bearbeitung:', fmtNum(d.tickets.inProgress)));
  L.push(kv('  gelöst:', fmtNum(d.tickets.resolved)));
  L.push(kv('  geschlossen:', fmtNum(d.tickets.closed)));
  L.push(kv('  eskaliert:', fmtNum(d.tickets.escalated)));
  L.push('');
  L.push('  Lösungsquote:', ` ${pct(d.tickets.resolved, d.tickets.total)}`);
  L.push('');
  L.push('  Tickets nach Priorität:');
  L.push(renderBreakdown(d.tickets.byPriority));
  L.push('');
  L.push('  Tickets nach Kategorie:');
  L.push(renderBreakdown(d.tickets.byCategory));
  L.push('');
  L.push('  Tickets pro Monat:');
  L.push(renderBreakdown(d.tickets.byMonth, 12));
  L.push('');

  // ── Benutzerübersicht ──
  L.push('BENUTZERÜBERSICHT');
  L.push(line('─'));
  L.push(kv('Benutzer gesamt:', fmtNum(d.users.total)));
  L.push(kv('  aktiv:', fmtNum(d.users.active)));
  L.push(kv('  inaktiv:', fmtNum(d.users.inactive)));
  L.push(kv('Neu in ' + year + ':', fmtNum(d.users.newThisYear)));
  L.push('');
  L.push('  Benutzer nach Rolle:');
  L.push(renderBreakdown(d.users.byRole));
  L.push('');
  L.push('  Benutzer nach Fachbereich:');
  L.push(renderBreakdown(d.users.byDepartment));
  L.push('');

  // ── Weitere Bereiche ──
  L.push('WEITERE BEREICHE');
  L.push(line('─'));
  L.push('Räume & Gebäude:');
  L.push(kv('Räume gesamt:', fmtNum(d.rooms.total)));
  L.push(kv('Gebäude gesamt:', fmtNum(d.buildings)));
  L.push('');
  L.push('  Räume nach Typ:');
  L.push(renderBreakdown(d.rooms.byType));
  L.push('');
  L.push('Netzwerk-Messungen:');
  L.push(kv('Messungen in ' + year + ':', fmtNum(d.wifi.total)));
  L.push(kv('Ausfälle erkannt:', fmtNum(d.wifi.outages)));
  L.push(kv('Ø Signalstärke:', `${d.wifi.avgSignal} dBm`));
  L.push(kv('Ø Download:', `${fmtNum(d.wifi.avgDownload)} Mbps`));
  L.push(kv('Ø Upload:', `${fmtNum(d.wifi.avgUpload)} Mbps`));
  L.push('');
  L.push('Events & Audimax:');
  L.push(kv('Events in ' + year + ':', fmtNum(d.events.total)));
  L.push('  nach Status:');
  L.push(renderBreakdown(d.events.byStatus));
  L.push('');
  L.push('Schäden & Reparaturen:');
  L.push(kv('Schadensmeldungen:', fmtNum(d.damageReports)));
  L.push(kv('Reparaturen:', fmtNum(d.repairs.total)));
  L.push(kv('  davon gelöst:', fmtNum(d.repairs.resolved)));
  L.push(kv('Reparaturkosten gesamt:', fmtEUR(d.repairs.totalCost)));
  L.push('');
  L.push('Inventur:');
  L.push(kv('Audits in ' + year + ':', fmtNum(d.audits.total)));
  L.push(kv('  abgeschlossen:', fmtNum(d.audits.completed)));
  L.push(kv('Fehlende Geräte (Summe):', fmtNum(d.audits.totalMissing)));
  L.push('');
  L.push('FAQ & Wissensdatenbank:');
  L.push(kv('Artikel gesamt:', fmtNum(d.faqs)));
  L.push(kv('Neu in ' + year + ':', fmtNum(d.faqsThisYear)));
  L.push('');

  // ── Zusammenfassung ──
  L.push(sectionLine());
  L.push('ZUSAMMENFASSUNG');
  L.push(sectionLine());
  L.push(kv('Gerätebestand:', fmtNum(d.devices.total)));
  L.push(kv('Ausleihen:', fmtNum(d.loans.total)));
  L.push(kv('3D-Druckaufträge:', fmtNum(d.prints.total)));
  L.push(kv('Support-Tickets:', fmtNum(d.tickets.total)));
  L.push(kv('Benutzer:', fmtNum(d.users.total)));
  L.push(kv('Räume:', fmtNum(d.rooms.total)));
  L.push(kv('WLAN-Messungen:', fmtNum(d.wifi.total)));
  L.push(kv('Events:', fmtNum(d.events.total)));
  L.push('');
  L.push(`Bericht erstellt: ${now.toLocaleString('de-DE')}`);
  L.push(`Datenquelle: Supabase (${SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0]})`);
  L.push(sectionLine());

  return L.join('\n');
}

// ───────────────────────────────────────────────────────────────────────────
//  HTML report generation
// ───────────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statCard(label, value, sub = '') {
  return `<div class="stat"><div class="stat-value">${esc(value)}</div><div class="stat-label">${esc(label)}</div>${sub ? `<div class="stat-sub">${esc(sub)}</div>` : ''}</div>`;
}

function barRow(label, value, max) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<tr><td class="bar-label">${esc(label)}</td><td class="bar-track"><div class="bar-fill" style="width:${w}%"></div></td><td class="bar-value">${value}</td></tr>`;
}

function barTable(map, limit = 10) {
  const entries = topEntries(map, limit);
  if (!entries.length) return '<p class="empty">Keine Daten</p>';
  const max = Math.max(...entries.map((e) => e[1]), 1);
  return `<table class="bars">${entries.map(([k, v]) => barRow(k, v, max)).join('')}</table>`;
}

function buildHtmlReport(d) {
  const css = `
    :root { color-scheme: dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif; background: #0a0e1a; color: #e2e8f0; padding: 2rem; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { font-size: 1.75rem; color: #f1f5f9; margin-bottom: .25rem; }
    .subtitle { color: #94a3b8; font-size: .9rem; margin-bottom: 2rem; }
    h2 { font-size: 1.15rem; color: #60a5fa; margin: 2rem 0 .75rem; padding-bottom: .4rem; border-bottom: 1px solid #1e293b; }
    h3 { font-size: .95rem; color: #cbd5e1; margin: 1rem 0 .5rem; }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: .75rem; margin-bottom: 1rem; }
    .stat { background: #111726; border: 1px solid #1e293b; border-radius: .6rem; padding: .9rem; }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: #f1f5f9; }
    .stat-label { font-size: .75rem; color: #94a3b8; margin-top: .15rem; }
    .stat-sub { font-size: .7rem; color: #64748b; margin-top: .15rem; }
    .bars { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
    .bar-label { width: 45%; font-size: .8rem; color: #cbd5e1; padding: .2rem .5rem .2rem 0; vertical-align: middle; }
    .bar-track { width: 45%; padding: .2rem 0; }
    .bar-fill { height: .55rem; border-radius: .3rem; background: linear-gradient(90deg, #3b82f6, #06b6d4); min-width: 2px; }
    .bar-value { width: 10%; text-align: right; font-size: .8rem; font-weight: 600; color: #e2e8f0; padding-left: .5rem; vertical-align: middle; }
    .empty { color: #64748b; font-size: .85rem; padding: .5rem 0; }
    .footer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #1e293b; font-size: .75rem; color: #64748b; text-align: center; }
    .badge { display: inline-block; padding: .1rem .5rem; border-radius: 1rem; font-size: .7rem; background: #1e293b; color: #94a3b8; }
  `;

  const body = `
    <div class="container">
      <h1>Jahresbericht ${year}</h1>
      <p class="subtitle">School TEC Hub · Inventar-, Ausleih- &amp; Technik-Support-Plattform<br>Erstellt am ${esc(now.toLocaleString('de-DE'))}</p>

      <h2>📊 Geräteübersicht</h2>
      <div class="stats">
        ${statCard('Geräte gesamt', fmtNum(d.devices.total))}
        ${statCard('Hochwertige Geräte', fmtNum(d.devices.highValue))}
        ${statCard('Gesamtwert', fmtEUR(d.devices.totalValue))}
      </div>
      <h3>Status-Verteilung</h3>${barTable(d.devices.byStatus)}
      <h3>Zustand</h3>${barTable(d.devices.byCondition)}
      <h3>Nach Kategorie</h3>${barTable(d.devices.byCategory)}

      <h2>📤 Ausleihstatistik</h2>
      <div class="stats">
        ${statCard('Ausleihen', fmtNum(d.loans.total))}
        ${statCard('Aktiv', fmtNum(d.loans.active))}
        ${statCard('Zurückgegeben', fmtNum(d.loans.returned))}
        ${statCard('Überfällig', fmtNum(d.loans.overdue))}
      </div>
      <h3>Ausleihen pro Monat</h3>${barTable(d.loans.byMonth, 12)}
      <h3>Top-Ausleiher</h3>${barTable(d.loans.byTeacher)}
      <h3>Meistgenutzte Räume</h3>${barTable(d.loans.byRoom)}

      <h2>🖨️ 3D-Druck-Statistik</h2>
      <div class="stats">
        ${statCard('Druckaufträge', fmtNum(d.prints.total))}
        ${statCard('Abgeschlossen', fmtNum(d.prints.completed), pct(d.prints.completed, d.prints.total))}
        ${statCard('Fehlgeschlagen', fmtNum(d.prints.failed))}
        ${statCard('Filament (g)', fmtNum(d.prints.totalGrams))}
      </div>
      <h3>Nach Material</h3>${barTable(d.prints.byMaterial)}
      <h3>Top-Druckauftraggeber</h3>${barTable(d.prints.byTeacher)}

      <h2>🎫 Ticket-Analyse</h2>
      <div class="stats">
        ${statCard('Tickets', fmtNum(d.tickets.total))}
        ${statCard('Gelöst', fmtNum(d.tickets.resolved), pct(d.tickets.resolved, d.tickets.total))}
        ${statCard('Offen', fmtNum(d.tickets.open))}
        ${statCard('Eskaliert', fmtNum(d.tickets.escalated))}
      </div>
      <h3>Nach Kategorie</h3>${barTable(d.tickets.byCategory)}
      <h3>Tickets pro Monat</h3>${barTable(d.tickets.byMonth, 12)}

      <h2>👥 Benutzerübersicht</h2>
      <div class="stats">
        ${statCard('Benutzer gesamt', fmtNum(d.users.total))}
        ${statCard('Aktiv', fmtNum(d.users.active))}
        ${statCard('Neu in ' + year, fmtNum(d.users.newThisYear))}
      </div>
      <h3>Nach Rolle</h3>${barTable(d.users.byRole)}
      <h3>Nach Fachbereich</h3>${barTable(d.users.byDepartment)}

      <h2>📡 Weitere Bereiche</h2>
      <div class="stats">
        ${statCard('Räume', fmtNum(d.rooms.total))}
        ${statCard('Gebäude', fmtNum(d.buildings))}
        ${statCard('WLAN-Messungen', fmtNum(d.wifi.total))}
        ${statCard('WLAN-Ausfälle', fmtNum(d.wifi.outages))}
        ${statCard('Events', fmtNum(d.events.total))}
        ${statCard('Reparaturen', fmtNum(d.repairs.total), fmtEUR(d.repairs.totalCost))}
        ${statCard('Inventur-Audits', fmtNum(d.audits.total))}
        ${statCard('FAQ-Artikel', fmtNum(d.faqs))}
      </div>

      <div class="footer">
        Jahresbericht ${year} · School TEC Hub · Datenquelle: Supabase
      </div>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Jahresbericht ${year} — School TEC Hub</title>
<style>${css}</style>
</head>
<body>${body}</body>
</html>`;
}

// ───────────────────────────────────────────────────────────────────────────
//  Main
// ───────────────────────────────────────────────────────────────────────────

async function main() {
  const c = {
    reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
    cyan: '\x1b[36m', green: '\x1b[32m', blue: '\x1b[34m', yellow: '\x1b[33m',
  };

  console.log(`\n${c.bold}${c.cyan}══════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}${c.cyan}  Jahresbericht ${year} — School TEC Hub${c.reset}`);
  console.log(`${c.bold}${c.cyan}══════════════════════════════════════════${c.reset}\n`);

  console.log(`${c.dim}Verbinde mit Supabase …${c.reset}`);
  console.log(`${c.dim}  URL: ${SUPABASE_URL}${c.reset}`);
  console.log(`${c.dim}  Jahr: ${year}${c.reset}\n`);

  console.log(`${c.blue}Daten werden abgefragt …${c.reset}`);
  const data = await collectData();

  console.log(`${c.green}✓${c.reset} Daten gesammelt.`);
  console.log(`  Geräte: ${data.devices.total} · Ausleihen: ${data.loans.total} · Drucke: ${data.prints.total}`);
  console.log(`  Tickets: ${data.tickets.total} · Benutzer: ${data.users.total} · Räume: ${data.rooms.total}\n`);

  // Text report
  const textReport = buildTextReport(data);
  const textFile = resolve(projectRoot, `annual-report-${year}.txt`);
  writeFileSync(textFile, textReport, 'utf8');
  console.log(`${c.green}✓${c.reset} Text-Bericht gespeichert: ${c.bold}${textFile}${c.reset}`);

  // Optional HTML report
  if (wantHtml) {
    const htmlReport = buildHtmlReport(data);
    const htmlFile = resolve(projectRoot, `annual-report-${year}.html`);
    writeFileSync(htmlFile, htmlReport, 'utf8');
    console.log(`${c.green}✓${c.reset} HTML-Bericht gespeichert:  ${c.bold}${htmlFile}${c.reset}`);
  }

  console.log(`\n${c.cyan}Fertig!${c.reset}\n`);
}

main().catch((e) => {
  console.error(`\x1b[31m\n[FEHLER] ${e.message}\x1b[0m\n`);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
