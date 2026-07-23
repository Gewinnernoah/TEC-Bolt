import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { SystemSetting } from './types';

const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<(v: unknown) => void>>();

export function getSetting<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  return fallback;
}

export async function loadSettings(): Promise<void> {
  const { data, error } = await supabase.from('system_settings').select('*');
  if (error || !data) return;
  for (const row of data as SystemSetting[]) {
    cache.set(row.key, row.value);
    listeners.get(row.key)?.forEach((fn) => fn(row.value));
  }
}

export async function updateSetting(key: string, value: unknown): Promise<{ error: string | null }> {
  const { error } = await supabase.from('system_settings').upsert({ key, value });
  if (error) return { error: error.message };
  cache.set(key, value);
  listeners.get(key)?.forEach((fn) => fn(value));
  return { error: null };
}

export function useSetting<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => (cache.has(key) ? (cache.get(key) as T) : fallback));

  useEffect(() => {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(setVal as (v: unknown) => void);
    if (cache.has(key)) setVal(cache.get(key) as T);
    return () => {
      listeners.get(key)?.delete(setVal as (v: unknown) => void);
    };
  }, [key]);

  const setter = (v: T) => {
    updateSetting(key, v).then(({ error }) => {
      if (error) console.error(`Failed to update setting "${key}":`, error);
    });
  };

  return [val, setter];
}
