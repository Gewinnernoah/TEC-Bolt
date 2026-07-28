// Shared types for the database layer.
// Both the Supabase and SQLite adapters conform to the same interface,
// so pages and hooks can use `supabase` without knowing which backend is active.

export type DbMode = 'supabase' | 'sqlite';

export interface DbResult<T = any> {
  data: T | null;
  error: { message: string; code?: string; details?: string } | null;
}

export interface DbClient {
  from(table: string): any;
  rpc(fnName: string): any;
  channel(name: string): any;
  removeChannel(channel: any): void;
  auth: {
    getSession(): Promise<DbResult<any>>;
    getUser(): Promise<DbResult<any>>;
    signInWithPassword(credentials: { email: string; password: string }): Promise<DbResult<any>>;
    signUp(credentials: { email: string; password: string; options?: { data?: Record<string, any> } }): Promise<DbResult<any>>;
    signOut(): Promise<{ error: any }>;
    resetPasswordForEmail(email: string, options?: { redirectTo?: string }): Promise<DbResult<any>>;
    onAuthStateChange(callback: (event: string, session: any) => void): {
      data: { subscription: { unsubscribe: () => void } };
    };
  };
}

export { uuid } from './sqlite-schema';
