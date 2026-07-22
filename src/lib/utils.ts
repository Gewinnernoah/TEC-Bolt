import { supabase } from './supabase';
import type { ActivityLog } from './types';

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(date: string | Date | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, opts ?? { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(date: string | Date | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(date: string | Date | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

export function downloadFile(content: string, filename: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function printHtml(html: string): void {
  const w = window.open('', '_blank', 'width=800,height=600');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.close();
  }, 250);
}

export async function logActivity(
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const entry: Partial<ActivityLog> = {
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: details ?? {},
    };
    await supabase.from('activity_logs').insert(entry);
  } catch {
    // logging is best-effort
  }
}

export function calculateProgress(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}

export function isOverdue(expectedReturn: string): boolean {
  return new Date(expectedReturn).getTime() < Date.now();
}

export function getWifiQuality(dbm: number, thresholds: { good: number; ok: number; poor: number }): 'good' | 'ok' | 'poor' | 'critical' {
  if (dbm >= thresholds.good) return 'good';
  if (dbm >= thresholds.ok) return 'ok';
  if (dbm >= thresholds.poor) return 'poor';
  return 'critical';
}

export function wifiQualityColor(quality: 'good' | 'ok' | 'poor' | 'critical'): string {
  switch (quality) {
    case 'good': return 'text-emerald-400';
    case 'ok': return 'text-amber-400';
    case 'poor': return 'text-orange-400';
    case 'critical': return 'text-red-400';
  }
}

export function generateInventoryNumber(categoryPrefix: string, count: number): string {
  return `${categoryPrefix}-${String(count + 1).padStart(5, '0')}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function calculateLessonNumber(lessonStart: string, lessonDuration: number, breakDuration: number): { current: number; total: number; nextChange: Date } {
  const now = new Date();
  const [h, m] = lessonStart.split(':').map(Number);
  const start = new Date();
  start.setHours(h, m, 0, 0);
  if (now < start) return { current: 0, total: 8, nextChange: start };
  const lessonMs = lessonDuration * 60_000;
  const breakMs = breakDuration * 60_000;
  const elapsed = now.getTime() - start.getTime();
  const cycleMs = lessonMs + breakMs;
  const lessonNum = Math.floor(elapsed / cycleMs) + 1;
  const nextChange = new Date(start.getTime() + lessonNum * cycleMs);
  return { current: lessonNum, total: 8, nextChange };
}

export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
