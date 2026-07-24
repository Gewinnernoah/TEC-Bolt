import { useEffect, useState, useCallback } from 'react';
import { supabase } from './db';
import type {
  Device, LendingLoan, LendingRequest, PrintRequest, Ticket, WifiMeasurement,
  Consumable, Profile, Room, AppNotification,
} from './types';

export function useLiveData<T>(
  table: string,
  select: string,
  filter?: Record<string, string>,
  order?: { column: string; ascending?: boolean },
  limit?: number,
): { data: T[] | null; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from(table).select(select);
    if (filter) {
      for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    }
    if (order) q = q.order(order.column, { ascending: order.ascending ?? false });
    if (limit) q = q.limit(limit);
    const { data: result, error: err } = await q;
    if (err) setError(err.message);
    else setData(result as T[]);
    setLoading(false);
  }, [table, select, JSON.stringify(filter), order?.column, order?.ascending, limit]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`live-${table}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, table]);

  return { data, loading, error, refresh: load };
}

export function useDevices() {
  return useLiveData<Device>(
    'devices',
    '*, category:inventory_categories(*), room:rooms(*)',
    undefined,
    { column: 'name' },
  );
}

export function useLoans(status?: string) {
  return useLiveData<LendingLoan>(
    'lending_loans',
    '*, teacher:profiles!lending_loans_teacher_id_fkey(*), staff:profiles!lending_loans_staff_id_fkey(*), room:rooms(*), period:lending_periods(*), items:lending_loan_items(*, device:devices(*))',
    status ? { status } : undefined,
    { column: 'checkout_at', ascending: false },
    50,
  );
}

export function useRequests(status?: string) {
  return useLiveData<LendingRequest>(
    'lending_requests',
    '*, teacher:profiles!lending_requests_teacher_id_fkey(*), room:rooms(*), period:lending_periods(*), items:lending_request_items(*, device:devices(*), bundle:device_bundles(*), category:inventory_categories(*))',
    status ? { status } : undefined,
    { column: 'created_at', ascending: false },
    50,
  );
}

export function usePrintRequests(status?: string) {
  return useLiveData<PrintRequest>(
    'print_requests',
    '*, teacher:profiles!print_requests_teacher_id_fkey(*), assigned_printer:printers(*), filament:filament_catalog(*)',
    status ? { status } : undefined,
    { column: 'created_at', ascending: false },
    50,
  );
}

export function useTickets(status?: string) {
  return useLiveData<Ticket>(
    'tickets',
    '*, category:ticket_categories(*), room:rooms(*), creator:profiles!tickets_created_by_fkey(*), assignee:profiles!tickets_assigned_to_fkey(*)',
    status ? { status } : undefined,
    { column: 'created_at', ascending: false },
    50,
  );
}

export function useWifiMeasurements(limit = 100) {
  return useLiveData<WifiMeasurement>(
    'wifi_measurements',
    '*, room:rooms(*)',
    undefined,
    { column: 'created_at', ascending: false },
    limit,
  );
}

export function useConsumables() {
  return useLiveData<Consumable>('consumables', '*', undefined, { column: 'name' });
}

export function useRooms() {
  return useLiveData<Room>('rooms', '*, building:buildings(*)', undefined, { column: 'name' });
}

export function useProfiles() {
  return useLiveData<Profile>('profiles', '*', undefined, { column: 'full_name' });
}

export function useNotifications() {
  return useLiveData<AppNotification>(
    'notifications',
    '*',
    undefined,
    { column: 'created_at', ascending: false },
    20,
  );
}
