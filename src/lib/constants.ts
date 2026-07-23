import type { DeviceStatus, LoanStatus, RequestStatus, TicketStatus, TicketPriority, PrintStatus, ConditionRating, AuditRisk, AuditItemStatus, EventStatus, UserRole } from './types';

export const DEVICE_STATUS_META: Record<DeviceStatus, { label: string; color: string; bg: string; dot: string }> = {
  available: { label: 'Available', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
  borrowed: { label: 'Borrowed', color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-500/30', dot: 'bg-blue-400' },
  maintenance: { label: 'Maintenance', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-500/30', dot: 'bg-amber-400' },
  defective: { label: 'Defective', color: 'text-red-300', bg: 'bg-red-500/15 border-red-500/30', dot: 'bg-red-400' },
  internal_use: { label: 'Internal Use', color: 'text-violet-300', bg: 'bg-violet-500/15 border-violet-500/30', dot: 'bg-violet-400' },
};

export const LOAN_STATUS_META: Record<LoanStatus, { label: string; color: string; bg: string; dot: string }> = {
  active: { label: 'Active', color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-500/30', dot: 'bg-blue-400' },
  returned: { label: 'Returned', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
  overdue: { label: 'Overdue', color: 'text-red-300', bg: 'bg-red-500/15 border-red-500/30', dot: 'bg-red-400' },
};

export const REQUEST_STATUS_META: Record<RequestStatus, { label: string; color: string; bg: string; dot: string }> = {
  pending: { label: 'Pending', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-500/30', dot: 'bg-amber-400' },
  approved: { label: 'Approved', color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-500/30', dot: 'bg-blue-400' },
  rejected: { label: 'Rejected', color: 'text-red-300', bg: 'bg-red-500/15 border-red-500/30', dot: 'bg-red-400' },
  fulfilled: { label: 'Fulfilled', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
  cancelled: { label: 'Cancelled', color: 'text-slate-400', bg: 'bg-slate-500/15 border-slate-500/30', dot: 'bg-slate-500' },
};

export const TICKET_STATUS_META: Record<TicketStatus, { label: string; color: string; bg: string; dot: string }> = {
  open: { label: 'Open', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-500/30', dot: 'bg-amber-400' },
  in_progress: { label: 'In Progress', color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-500/30', dot: 'bg-blue-400' },
  resolved: { label: 'Resolved', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
  closed: { label: 'Closed', color: 'text-slate-400', bg: 'bg-slate-500/15 border-slate-500/30', dot: 'bg-slate-500' },
  escalated: { label: 'Escalated', color: 'text-red-300', bg: 'bg-red-500/15 border-red-500/30', dot: 'bg-red-400' },
};

export const TICKET_PRIORITY_META: Record<TicketPriority, { label: string; color: string; bg: string }> = {
  low: { label: 'Low', color: 'text-slate-300', bg: 'bg-slate-500/15' },
  normal: { label: 'Normal', color: 'text-blue-300', bg: 'bg-blue-500/15' },
  high: { label: 'High', color: 'text-amber-300', bg: 'bg-amber-500/15' },
  urgent: { label: 'Urgent', color: 'text-red-300', bg: 'bg-red-500/15' },
};

export const PRINT_STATUS_META: Record<PrintStatus, { label: string; color: string; bg: string; dot: string }> = {
  queued: { label: 'Queued', color: 'text-slate-300', bg: 'bg-slate-500/15 border-slate-500/30', dot: 'bg-slate-400' },
  validating: { label: 'Validating', color: 'text-blue-300', bg: 'bg-blue-500/15 border-blue-500/30', dot: 'bg-blue-400' },
  ready: { label: 'Ready', color: 'text-cyan-300', bg: 'bg-cyan-500/15 border-cyan-500/30', dot: 'bg-cyan-400' },
  printing: { label: 'Printing', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
  paused: { label: 'Paused', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-500/30', dot: 'bg-amber-400' },
  completed: { label: 'Completed', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
  failed: { label: 'Failed', color: 'text-red-300', bg: 'bg-red-500/15 border-red-500/30', dot: 'bg-red-400' },
  cancelled: { label: 'Cancelled', color: 'text-slate-400', bg: 'bg-slate-500/15 border-slate-500/30', dot: 'bg-slate-500' },
};

export const CONDITION_META: Record<ConditionRating, { label: string; color: string }> = {
  excellent: { label: 'Excellent', color: 'text-emerald-300' },
  good: { label: 'Good', color: 'text-blue-300' },
  fair: { label: 'Fair', color: 'text-amber-300' },
  damaged: { label: 'Damaged', color: 'text-orange-300' },
  defective: { label: 'Defective', color: 'text-red-300' },
};

export const AUDIT_RISK_META: Record<AuditRisk, { label: string; color: string; bg: string }> = {
  none: { label: 'None', color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
  low: { label: 'Low', color: 'text-blue-300', bg: 'bg-blue-500/15' },
  medium: { label: 'Medium', color: 'text-amber-300', bg: 'bg-amber-500/15' },
  high: { label: 'High', color: 'text-red-300', bg: 'bg-red-500/15' },
};

export const AUDIT_ITEM_META: Record<AuditItemStatus, { label: string; color: string; bg: string }> = {
  present: { label: 'Present', color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
  missing: { label: 'Missing', color: 'text-red-300', bg: 'bg-red-500/15' },
  unexpected: { label: 'Unexpected', color: 'text-amber-300', bg: 'bg-amber-500/15' },
};

export const EVENT_STATUS_META: Record<EventStatus, { label: string; color: string; bg: string }> = {
  planning: { label: 'Planning', color: 'text-slate-300', bg: 'bg-slate-500/15' },
  preparation: { label: 'Preparation', color: 'text-blue-300', bg: 'bg-blue-500/15' },
  rehearsal: { label: 'Rehearsal', color: 'text-amber-300', bg: 'bg-amber-500/15' },
  ready: { label: 'Ready', color: 'text-cyan-300', bg: 'bg-cyan-500/15' },
  in_progress: { label: 'In Progress', color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
  completed: { label: 'Completed', bg: 'bg-slate-600/15', color: 'text-slate-400' },
  cancelled: { label: 'Cancelled', color: 'text-red-300', bg: 'bg-red-500/15' },
};

export const ROLE_META: Record<UserRole, { label: string; color: string; bg: string }> = {
  admin: { label: 'Administrator', color: 'text-red-300', bg: 'bg-red-500/15' },
  staff: { label: 'Lending Staff', color: 'text-blue-300', bg: 'bg-blue-500/15' },
  teacher: { label: 'Teacher', color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
};

export function statusMeta(status: string): { label: string; color: string; bg: string; dot: string } {
  return (
    DEVICE_STATUS_META[status as DeviceStatus] ||
    LOAN_STATUS_META[status as LoanStatus] ||
    REQUEST_STATUS_META[status as RequestStatus] ||
    PRINT_STATUS_META[status as PrintStatus] ||
    { label: status, color: 'text-slate-300', bg: 'bg-slate-500/15 border-slate-500/30', dot: 'bg-slate-400' }
  );
}
