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
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'staff', 'teacher'], group: 'main' },
  { id: 'inventory', label: 'Inventory', icon: Package, roles: ['admin', 'staff'], group: 'main' },
  { id: 'lending', label: 'Lending', icon: HandHelping, roles: ['admin', 'staff', 'teacher'], group: 'main' },
  { id: 'calendar', label: 'Availability Calendar', icon: CalendarDays, roles: ['admin', 'staff', 'teacher'], group: 'main' },
  { id: 'printing', label: '3D Printing', icon: Printer, roles: ['admin', 'staff', 'teacher'], group: 'main' },
  { id: 'tickets', label: 'Support Tickets', icon: Ticket, roles: ['admin', 'staff', 'teacher'], group: 'support' },
  { id: 'monitoring', label: 'Network & Building', icon: Radio, roles: ['admin', 'staff', 'teacher'], group: 'support' },
  { id: 'events', label: 'Events & Auditorium', icon: Mic2, roles: ['admin', 'staff', 'teacher'], group: 'support' },
  { id: 'faq', label: 'FAQ & Knowledge Base', icon: BookOpen, roles: ['admin', 'staff', 'teacher'], group: 'support' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'staff'], group: 'support' },
  { id: 'admin-users', label: 'User Management', icon: Users, roles: ['admin'], group: 'admin' },
  { id: 'admin-settings', label: 'System Settings', icon: Settings, roles: ['admin'], group: 'admin' },
  { id: 'admin-logs', label: 'Activity Logs', icon: Monitor, roles: ['admin'], group: 'admin' },
];

export const GROUP_LABELS: Record<NavItem['group'], string> = {
  main: 'Operations',
  support: 'Support & Info',
  admin: 'Administration',
};
