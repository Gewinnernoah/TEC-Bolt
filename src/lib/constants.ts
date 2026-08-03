import type { DeviceStatus, LoanStatus, RequestStatus, TicketStatus, TicketPriority, PrintStatus, ConditionRating, AuditRisk, AuditItemStatus, EventStatus, UserRole, UserPermissions } from './types';

export const DEVICE_STATUS_META: Record<DeviceStatus, { label: string; color: string; bg: string; dot: string }> = {
  available: { label: 'Verfügbar', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
  borrowed: { label: 'Ausgeliehen', color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-500/30', dot: 'bg-blue-400' },
  maintenance: { label: 'Wartung', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-500/30', dot: 'bg-amber-400' },
  defective: { label: 'Defekt', color: 'text-red-300', bg: 'bg-red-500/15 border-red-500/30', dot: 'bg-red-400' },
  internal_use: { label: 'Interne Nutzung', color: 'text-violet-300', bg: 'bg-violet-500/15 border-violet-500/30', dot: 'bg-violet-400' },
};

export const LOAN_STATUS_META: Record<LoanStatus, { label: string; color: string; bg: string; dot: string }> = {
  active: { label: 'Aktiv', color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-500/30', dot: 'bg-blue-400' },
  returned: { label: 'Zurückgegeben', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
  overdue: { label: 'Überfällig', color: 'text-red-300', bg: 'bg-red-500/15 border-red-500/30', dot: 'bg-red-400' },
};

export const REQUEST_STATUS_META: Record<RequestStatus, { label: string; color: string; bg: string; dot: string }> = {
  pending: { label: 'Ausstehend', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-500/30', dot: 'bg-amber-400' },
  approved: { label: 'Genehmigt', color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-500/30', dot: 'bg-blue-400' },
  rejected: { label: 'Abgelehnt', color: 'text-red-300', bg: 'bg-red-500/15 border-red-500/30', dot: 'bg-red-400' },
  fulfilled: { label: 'Erfüllt', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
  cancelled: { label: 'Abgebrochen', color: 'text-slate-400', bg: 'bg-slate-500/15 border-slate-500/30', dot: 'bg-slate-500' },
};

export const TICKET_STATUS_META: Record<TicketStatus, { label: string; color: string; bg: string; dot: string }> = {
  open: { label: 'Offen', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-500/30', dot: 'bg-amber-400' },
  in_progress: { label: 'In Bearbeitung', color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-500/30', dot: 'bg-blue-400' },
  resolved: { label: 'Gelöst', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
  closed: { label: 'Geschlossen', color: 'text-slate-400', bg: 'bg-slate-500/15 border-slate-500/30', dot: 'bg-slate-500' },
  escalated: { label: 'Dringend', color: 'text-red-300', bg: 'bg-red-500/15 border-red-500/30', dot: 'bg-red-400' },
};

export const TICKET_PRIORITY_META: Record<TicketPriority, { label: string; color: string; bg: string }> = {
  low: { label: 'Niedrig', color: 'text-slate-300', bg: 'bg-slate-500/15' },
  normal: { label: 'Normal', color: 'text-blue-300', bg: 'bg-blue-500/15' },
  high: { label: 'Hoch', color: 'text-amber-300', bg: 'bg-amber-500/15' },
  urgent: { label: 'Dringend', color: 'text-red-300', bg: 'bg-red-500/15' },
};

export const PRINT_STATUS_META: Record<PrintStatus, { label: string; color: string; bg: string; dot: string }> = {
  queued: { label: 'In Warteschlange', color: 'text-slate-300', bg: 'bg-slate-500/15 border-slate-500/30', dot: 'bg-slate-400' },
  validating: { label: 'Wird geprüft', color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-500/30', dot: 'bg-blue-400' },
  ready: { label: 'Bereit', color: 'text-cyan-300', bg: 'bg-cyan-500/15 border-cyan-500/30', dot: 'bg-cyan-400' },
  printing: { label: 'Druckt', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
  paused: { label: 'Pausiert', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-500/30', dot: 'bg-amber-400' },
  completed: { label: 'Abgeschlossen', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
  failed: { label: 'Fehlgeschlagen', color: 'text-red-300', bg: 'bg-red-500/15 border-red-500/30', dot: 'bg-red-400' },
  cancelled: { label: 'Abgebrochen', color: 'text-slate-400', bg: 'bg-slate-500/15 border-slate-500/30', dot: 'bg-slate-500' },
};

export const CONDITION_META: Record<ConditionRating, { label: string; color: string }> = {
  excellent: { label: 'Sehr gut', color: 'text-emerald-300' },
  good: { label: 'Gut', color: 'text-blue-300' },
  fair: { label: 'Befriedigend', color: 'text-amber-300' },
  damaged: { label: 'Beschädigt', color: 'text-orange-300' },
  defective: { label: 'Defekt', color: 'text-red-300' },
};

export const AUDIT_RISK_META: Record<AuditRisk, { label: string; color: string; bg: string }> = {
  none: { label: 'Keine', color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
  low: { label: 'Gering', color: 'text-blue-300', bg: 'bg-blue-500/15' },
  medium: { label: 'Mittel', color: 'text-amber-300', bg: 'bg-amber-500/15' },
  high: { label: 'Hoch', color: 'text-red-300', bg: 'bg-red-500/15' },
};

export const AUDIT_ITEM_META: Record<AuditItemStatus, { label: string; color: string; bg: string }> = {
  present: { label: 'Vorhanden', color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
  missing: { label: 'Fehlend', color: 'text-red-300', bg: 'bg-red-500/15' },
  unexpected: { label: 'Unerwartet', color: 'text-amber-300', bg: 'bg-amber-500/15' },
};

export const EVENT_STATUS_META: Record<EventStatus, { label: string; color: string; bg: string }> = {
  planning: { label: 'Planung', color: 'text-slate-300', bg: 'bg-slate-500/15' },
  preparation: { label: 'Vorbereitung', color: 'text-blue-300', bg: 'bg-blue-500/15' },
  rehearsal: { label: 'Probe', color: 'text-amber-300', bg: 'bg-amber-500/15' },
  ready: { label: 'Bereit', color: 'text-cyan-300', bg: 'bg-cyan-500/15' },
  in_progress: { label: 'Laufend', color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
  completed: { label: 'Abgeschlossen', color: 'text-slate-400', bg: 'bg-slate-600/15' },
  cancelled: { label: 'Abgesagt', color: 'text-red-300', bg: 'bg-red-500/15' },
};

export const ROLE_META: Record<UserRole, { label: string; color: string; bg: string }> = {
  admin: { label: 'Administrator', color: 'text-red-300', bg: 'bg-red-500/15' },
  staff: { label: 'Mitarbeiter', color: 'text-blue-300', bg: 'bg-blue-500/15' },
  teacher: { label: 'Lehrer', color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
  student: { label: 'Schüler', color: 'text-cyan-300', bg: 'bg-cyan-500/15' },
};

export const DEFAULT_PERMISSIONS: UserPermissions = {
  can_print_3d: true,
  can_borrow: true,
  can_manage_inventory: false,
  can_manage_events: false,
  can_view_analytics: false,
  can_create_tickets: true,
};

export const PERMISSION_META: { key: keyof UserPermissions; label: string; description: string }[] = [
  { key: 'can_print_3d', label: '3D-Druck erlaubt', description: '3D-Druckaufträge einreichen' },
  { key: 'can_borrow', label: 'Ausleihe erlaubt', description: 'Geräte ausleihen' },
  { key: 'can_manage_inventory', label: 'Inventar verwalten', description: 'Geräte und Bestand verwalten' },
  { key: 'can_manage_events', label: 'Veranstaltungen verwalten', description: 'Events planen und bearbeiten' },
  { key: 'can_view_analytics', label: 'Analysen einsehen', description: 'Auswertungen und Statistiken' },
  { key: 'can_create_tickets', label: 'Tickets erstellen', description: 'Support-Tickets einreichen' },
];

export function statusMeta(status: string): { label: string; color: string; bg: string; dot: string } {
  return (
    DEVICE_STATUS_META[status as DeviceStatus] ||
    LOAN_STATUS_META[status as LoanStatus] ||
    REQUEST_STATUS_META[status as RequestStatus] ||
    PRINT_STATUS_META[status as PrintStatus] ||
    { label: status, color: 'text-slate-300', bg: 'bg-slate-500/15 border-slate-500/30', dot: 'bg-slate-400' }
  );
}
