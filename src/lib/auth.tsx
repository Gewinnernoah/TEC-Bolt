import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, dbReady } from './database';
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
  authError: string | null;
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  lock: () => void;
  unlock: (password: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  changePassword: (newPassword: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  clearAuthError: () => void;
  isStaff: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('[Auth] Failed to load profile:', error.message);
      return null;
    }
    return data as Profile | null;
  }, []);

  const signOut = useCallback(async () => {
    await logActivity('auth.signout');
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setLocked(false);
    setMustChangePassword(false);
    try { localStorage.removeItem(LOCK_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      const p = await loadProfile(session.user.id);
      setProfile(p);
    }
  }, [session, loadProfile]);

  const lock = useCallback(() => {
    if (!session) return;
    setLocked(true);
    try {
      if (session.user?.email) localStorage.setItem(LOCK_STORAGE_KEY, session.user.email);
    } catch { /* ignore */ }
    logActivity('auth.lock');
  }, [session]);

  const unlock = useCallback(async (password: string): Promise<{ error: string | null }> => {
    const email: string | null = session?.user?.email ?? (() => { try { return localStorage.getItem(LOCK_STORAGE_KEY); } catch { return null; } })();
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

    dbReady.then(() => {
      if (!mounted) return;
      supabase.auth.getSession().then(({ data }: any) => {
        if (!mounted) return;
        const s = data?.session ?? null;
        setSession(s);
        if (s?.user?.id) {
          loadProfile(s.user.id).then(async (p) => {
            if (!mounted) return;
            // Inactive user lock — block login even for existing sessions.
            if (p && p.is_active === false) {
              await signOut();
              setAuthError('Ihr Konto wurde deaktiviert.');
              setLoading(false);
              return;
            }
            setProfile(p);
            setMustChangePassword(Boolean(p?.must_change_password));
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event: any, s: Session | null) => {
      (async () => {
        if (!mounted) return;
        setSession(s);
        if (s?.user?.id) {
          const p = await loadProfile(s.user.id);
          if (!mounted) return;
          // Inactive user lock on every auth state transition.
          if (p && p.is_active === false) {
            await signOut();
            setAuthError('Ihr Konto wurde deaktiviert.');
            setLoading(false);
            return;
          }
          setProfile(p);
          setMustChangePassword(Boolean(p?.must_change_password));
        } else {
          setProfile(null);
          setLocked(false);
          setMustChangePassword(false);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      try { sub?.data?.subscription?.unsubscribe?.(); } catch { /* ignore */ }
    };
  }, [loadProfile, signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: translateAuthError(error.message) };

    // Fetch profile immediately to enforce the inactive-user lock before the
    // auth-state-change effect resolves, so disabled users never see the app.
    if (data.user?.id) {
      const p = await loadProfile(data.user.id);
      if (p && p.is_active === false) {
        await signOut();
        return { error: 'Ihr Konto wurde deaktiviert.' };
      }
      setMustChangePassword(Boolean(p?.must_change_password));
    }

    await logActivity('auth.signin');
    return { error: null };
  }, [loadProfile, signOut]);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    // Role is NOT user-selectable. New accounts always default to 'teacher'.
    const role: UserRole = 'teacher';
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

  const changePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: translateAuthError(error.message) };

    // Clear the must-change flag on the profile so the UI stops prompting.
    if (session?.user?.id) {
      await supabase.from('profiles').update({ must_change_password: false }).eq('id', session.user.id);
      setMustChangePassword(false);
    }
    await logActivity('auth.password_change');
    return { error: null };
  }, [session]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    locked,
    authError,
    mustChangePassword,
    signIn,
    signUp,
    signOut,
    lock,
    unlock,
    resetPassword,
    changePassword,
    refreshProfile,
    clearAuthError,
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
