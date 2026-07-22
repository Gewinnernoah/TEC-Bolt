import { useState, useEffect } from 'react';
import { Shield, Fingerprint, Mail, Lock, UserPlus, LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { canUseBiometric, verifyFingerprint, getStoredFingerprintProfileId, getProfileForFingerprint } from '@/lib/webauthn';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/lib/types';
import { ROLE_META } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('teacher');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [storedEmail, setStoredEmail] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    canUseBiometric().then(setBiometricAvailable);
    const storedId = getStoredFingerprintProfileId();
    if (storedId) {
      getProfileForFingerprint(storedId).then((p) => {
        if (p?.fingerprint_enrolled) setStoredEmail(p.email);
      });
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) setError(err);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signUp(email, password, fullName, role);
    setLoading(false);
    if (err) setError(err);
  };

  const handleBiometric = async () => {
    if (!storedEmail) return;
    setBiometricLoading(true);
    setError(null);
    try {
      const profile = await getProfileForFingerprint(storedEmail);
      if (!profile || !profile.fingerprint_enrolled) {
        setError('No fingerprint enrolled for this account.');
        setBiometricLoading(false);
        return;
      }
      const { success, error: verr } = await verifyFingerprint(profile);
      if (!success || verr) {
        setError(verr || 'Fingerprint verification failed.');
        setBiometricLoading(false);
        return;
      }
      // Biometric verified — sign in with stored session refresh
      // WebAuthn assertion doesn't give us a Supabase session directly,
      // so we sign in with a special approach: the user must have a password-less session.
      // For this app, we require the email to be pre-entered and we call signInWithPassword
      // with a stored credential token. Since we can't store passwords, biometric serves as
      // a local unlock for already-authenticated sessions.
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        setBiometricLoading(false);
        return;
      }
      setError('Please sign in with email and password first to enable fingerprint unlock.');
      setBiometricLoading(false);
    } catch {
      setError('Biometric authentication failed.');
      setBiometricLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0e1a] via-[#0d1320] to-[#0a0e1a] p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-cyan-600/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="mb-6 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-xl shadow-blue-500/30">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-100">School TEC Hub</h1>
          <p className="mt-1 text-sm text-slate-400">Inventory, Lending & Technical Support Platform</p>
        </div>

        <div className="card p-6">
          <div className="mb-5 flex gap-2 rounded-lg bg-slate-800/50 p-1">
            <button
              onClick={() => { setMode('login'); setError(null); }}
              className={cn('flex-1 rounded-md py-2 text-sm font-medium transition-colors', mode === 'login' ? 'bg-slate-700 text-slate-100' : 'text-slate-400')}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('register'); setError(null); }}
              className={cn('flex-1 rounded-md py-2 text-sm font-medium transition-colors', mode === 'register' ? 'bg-slate-700 text-slate-100' : 'text-slate-400')}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input pl-10" placeholder="you@school.edu" />
                </div>
              </div>
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input pl-10" placeholder="••••••••" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                <LogIn className="h-4 w-4" />
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" placeholder="Jane Smith" />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@school.edu" />
              </div>
              <div>
                <label className="label">Password</label>
                <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="Min 6 characters" />
              </div>
              <div>
                <label className="label">Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(ROLE_META) as UserRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={cn('rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                        role === r ? 'border-blue-500 bg-blue-600/15 text-blue-300' : 'border-slate-700 text-slate-400 hover:border-slate-600')}
                    >
                      {ROLE_META[r].label}
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                <UserPlus className="h-4 w-4" />
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}

          {mode === 'login' && biometricAvailable && (
            <div className="mt-4 border-t border-slate-800 pt-4">
              <button
                onClick={handleBiometric}
                disabled={!storedEmail || biometricLoading}
                className="btn-secondary w-full"
              >
                <Fingerprint className={cn('h-5 w-5', biometricLoading && 'animate-pulse text-emerald-400')} />
                {biometricLoading ? 'Scanning...' : storedEmail ? `Unlock with fingerprint (${storedEmail})` : 'No fingerprint enrolled'}
              </button>
              {!storedEmail && (
                <p className="mt-2 text-center text-xs text-slate-500">
                  Sign in and enroll your fingerprint in profile settings to enable fast unlock.
                </p>
              )}
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          Protected by password & biometric authentication · Auto-logout on inactivity
        </p>
      </div>
    </div>
  );
}
