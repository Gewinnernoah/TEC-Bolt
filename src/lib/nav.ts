import { type LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Package, HandHelping, Printer, Ticket, Radio,
  BarChart3, CalendarDays, Users, Settings, Mic2, Monitor, BookOpen,
} from 'lucide-react';
import type { UserRole } from './types';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  group: 'main' | 'support' | 'admin';
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'staff', 'teacher', 'student'], group: 'main' },
  { id: 'inventory', label: 'Inventar', icon: Package, roles: ['admin', 'staff'], group: 'main' },
  { id: 'lending', label: 'Ausleihe', icon: HandHelping, roles: ['admin', 'staff', 'teacher', 'student'], group: 'main' },
  { id: 'calendar', label: 'Verfügbarkeitskalender', icon: CalendarDays, roles: ['admin', 'staff', 'teacher', 'student'], group: 'main' },
  { id: 'printing', label: '3D-Druck', icon: Printer, roles: ['admin', 'staff', 'teacher', 'student'], group: 'main' },
  { id: 'tickets', label: 'Support-Tickets', icon: Ticket, roles: ['admin', 'staff', 'teacher', 'student'], group: 'support' },
  { id: 'monitoring', label: 'Netzwerk & Gebäude', icon: Radio, roles: ['admin', 'staff', 'teacher'], group: 'support' },
  { id: 'events', label: 'Events & Audimax', icon: Mic2, roles: ['admin', 'staff', 'teacher'], group: 'support' },
  { id: 'faq', label: 'FAQ & Wissensdatenbank', icon: BookOpen, roles: ['admin', 'staff', 'teacher', 'student'], group: 'support' },
  { id: 'analytics', label: 'Analyse', icon: BarChart3, roles: ['admin', 'staff'], group: 'support' },
  { id: 'admin-users', label: 'Benutzerverwaltung', icon: Users, roles: ['admin'], group: 'admin' },
  { id: 'admin-settings', label: 'Systemeinstellungen', icon: Settings, roles: ['admin'], group: 'admin' },
  { id: 'admin-logs', label: 'Aktivitätsprotokoll', icon: Monitor, roles: ['admin'], group: 'admin' },
];

export const GROUP_LABELS: Record<NavItem['group'], string> = {
  main: 'Betrieb',
  support: 'Support & Info',
  admin: 'Verwaltung',
};
