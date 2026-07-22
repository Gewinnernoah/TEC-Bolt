import { useCallback } from 'react';
import { useAuth } from './auth';

interface ToastFn {
  (msg: string, type?: 'success' | 'error' | 'info'): void;
}

let externalToast: ToastFn | null = null;

export function registerToast(fn: ToastFn) {
  externalToast = fn;
}

export function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  if (externalToast) externalToast(msg, type);
  else console.log(`[${type}] ${msg}`);
}

export function useApi() {
  const { profile } = useAuth();

  const call = useCallback(async <T,>(
    fn: () => Promise<{ data: T | null; error: { message: string } | null }>
  ): Promise<T | null> => {
    const { data, error } = await fn();
    if (error) {
      toast(error.message, 'error');
      return null;
    }
    return data;
  }, []);

  return { call, profile };
}
