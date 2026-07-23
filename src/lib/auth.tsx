import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile, UserRole } from './types';
import { logActivity } from './utils';

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email oder Passwort ist falsch.';
  if (m.includes('user already registered')) return 'Diese Email ist bereits registriert.';
  if (m.includes('password should be at least')) return 'Das Passwort muss mindestens 6 Zeichen lang sein.';
  if (m.includes('unable to send email')) return 'Die Reset-Email konnte nicht gesendet werden. Bitte später erneut versuchen.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Zu viele Versuche. Bitte in einigen Minuten erneut versuchen.';
  if (m.includes('email rate limit')) return 'Zu viele Reset-Emails gesendet. Bitte später erneut versuchen.';
  if (m.includes('user not found')) return 'Kein Benutzer mit dieser Email gefunden.';
  if (m.includes('expired')) return 'Die Sitzung ist abgelaufen. Bitte erneut anmelden.';
  if (m.includes('network') || m.includes('fetch')) return 'Netzwerkfehler. Bitte Internetverbindung prüfen.';
  return message;
}

const LOCK_TIMEOUT_MINUTES = 15;
const LOCK_STORAGE_KEY = 'auth_lock_email';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  locked: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, role?: UserRole) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  lock: () => void;
  unlock: (password: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  isStaff: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('Failed to load profile:', error.message);
      return null;
    }
    return data as Profile | null;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      const p = await loadProfile(session.user.id);
      setProfile(p);
    }
  }, [session, loadProfile]);

  const signOut = useCallback(async () => {
    await logActivity('auth.signout');
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setLocked(false);
    try { localStorage.removeItem(LOCK_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const lock = useCallback(() => {
    if (!session) return;
    setLocked(true);
    try {
      if (session.user?.email) localStorage.setItem(LOCK_STORAGE_KEY, session.user.email);
    } catch { /* ignore */ }
    logActivity('auth.lock');
  }, [session]);

  const unlock = useCallback(async (password: string): Promise<{ error: string | null }> => {
    const email = session?.user?.email ?? (() => { try { return localStorage.getItem(LOCK_STORAGE_KEY); } catch { return null; } })();
    if (!email) return { error: 'Sitzung abgelaufen. Bitte erneut anmelden.' };

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: translateAuthError(error.message) };

    setLocked(false);
    try { localStorage.removeItem(LOCK_STORAGE_KEY); } catch { /* ignore */ }
    await logActivity('auth.unlock');
    return { error: null };
  }, [session]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (!session || !profile || locked) return;
    if (profile.exempt_auto_logout || profile.role === 'admin') return;
    inactivityTimer.current = setTimeout(() => {
      void lock();
    }, LOCK_TIMEOUT_MINUTES * 60_000);
  }, [session, profile, locked, lock]);

  useEffect(() => {
    if (session && profile && !locked) {
      const events = ['mousedown', 'keydown', 'touchstart', 'mousemove'];
      events.forEach((e) => window.addEventListener(e, resetInactivityTimer, { passive: true }));
      resetInactivityTimer();
      return () => {
        events.forEach((e) => window.removeEventListener(e, resetInactivityTimer));
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      };
    }
  }, [session, profile, locked, resetInactivityTimer]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user?.id) {
        loadProfile(s.user.id).then((p) => {
          if (mounted) {
            setProfile(p);
            setLoading(false);
          }
        });
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      (async () => {
        if (!mounted) return;
        setSession(s);
        if (s?.user?.id) {
          const p = await loadProfile(s.user.id);
          if (mounted) setProfile(p);
        } else {
          setProfile(null);
          setLocked(false);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: translateAuthError(error.message) };
    await logActivity('auth.signin');
    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string, role: UserRole = 'teacher') => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });
    if (error) return { error: translateAuthError(error.message) };
    if (data.user) {
      await logActivity('auth.signup', 'user', data.user.id, { email, role });
    }
    return { error: null };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) return { error: translateAuthError(error.message) };
    return { error: null };
  }, []);

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    locked,
    signIn,
    signUp,
    signOut,
    lock,
    unlock,
    resetPassword,
    refreshProfile,
    isStaff: profile?.role === 'admin' || profile?.role === 'staff',
    isAdmin: profile?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
