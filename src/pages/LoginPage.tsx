import { useState, useEffect, type FormEvent } from 'react';
import {
  Shield, Fingerprint, Mail, Lock, UserPlus, LogIn, AlertCircle,
  Eye, EyeOff, ArrowLeft, CheckCircle2, KeyRound, Clock,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  canUseBiometric, verifyFingerprint, getStoredFingerprintEmail,
  getProfileForFingerprint,
} from '@/lib/webauthn';
import type { UserRole } from '@/lib/types';
import { ROLE_META } from '@/lib/constants';
import { cn } from '@/lib/utils';

type Mode = 'login' | 'register' | 'forgot';

export function LoginPage({ locked = false }: { locked?: boolean }) {
  const { signIn, signUp, unlock, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('teacher');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEmail, setBiometricEmail] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    canUseBiometric().then(setBiometricAvailable);
    const stored = getStoredFingerprintEmail();
    if (stored) {
      getProfileForFingerprint(stored).then((p) => {
        if (p?.fingerprint_enrolled) setBiometricEmail(p.email);
      });
    }
  }, []);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setSuccess(null);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) setError(err);
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    const { error: err } = await signUp(email, password, fullName, role);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      setSuccess('Konto erfolgreich erstellt. Sie koennen sich jetzt anmelden.');
      setMode('login');
      setPassword('');
    }
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    const { error: err } = await resetPassword(email);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      setSuccess('Eine Email zum Zuruecksetzen des Passworts wurde gesendet. Bitte den Posteingang pruefen.');
    }
  };

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    const { error: err } = await unlock(password);
    setLoading(false);
    if (err) setError(err);
  };

  const handleBiometricUnlock = async () => {
    if (!biometricEmail) return;
    setBiometricLoading(true);
    setError(null);
    try {
      const profile = await getProfileForFingerprint(biometricEmail);
      if (!profile || !profile.fingerprint_enrolled) {
        setError('Kein Fingerabdruck fuer dieses Konto registriert.');
        setBiometricLoading(false);
        return;
      }
      const { success, error: verr } = await verifyFingerprint(profile);
      setBiometricLoading(false);
      if (!success || verr) {
        setError(verr ?? 'Fingerabdruck-Verifizierung fehlgeschlagen.');
        return;
      }
      setPassword('');
      setError(null);
      setSuccess('Fingerabdruck erkannt. Bitte Passwort eingeben, um die Sitzung zu entsperren.');
    } catch {
      setBiometricLoading(false);
      setError('Biometrische Authentifizierung fehlgeschlagen.');
    }
  };

  // -- Locked screen --
  if (locked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0e1a] via-[#0d1320] to-[#0a0e1a] p-4">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-cyan-600/10 blur-3xl" />
        </div>

        <div className="relative w-full max-w-md animate-slide-up">
          <div className="mb-6 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-xl shadow-amber-500/30">
              <Lock className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-slate-100">Sitzung gesperrt</h1>
            <p className="mt-1 text-sm text-slate-400">
              <Clock className="mr-1 inline h-3.5 w-3.5" />
              Aus Inaktivitaet automatisch gesperrt
            </p>
          </div>

          <div className="card p-6">
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <label className="label">Passwort</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input px-10"
                    placeholder="Passwort zum Entsperren"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                <LogIn className="h-4 w-4" />
                {loading ? 'Entsperren...' : 'Entsperren'}
              </button>
            </form>

            {biometricAvailable && biometricEmail && (
              <div className="mt-4 border-t border-slate-800 pt-4">
                <button
                  onClick={handleBiometricUnlock}
                  disabled={biometricLoading}
                  className="btn-secondary w-full"
                >
                  <Fingerprint className={cn('h-5 w-5', biometricLoading && 'animate-pulse text-emerald-400')} />
                  {biometricLoading ? 'Scanne...' : 'Mit Fingerabdruck entsperren'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -- Auth screen (login / register / forgot) --
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
          {mode !== 'forgot' && (
            <div className="mb-5 flex gap-2 rounded-lg bg-slate-800/50 p-1">
              <button
                onClick={() => switchMode('login')}
                className={cn(
                  'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
                  mode === 'login' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300',
                )}
              >
                Anmelden
              </button>
              <button
                onClick={() => switchMode('register')}
                className={cn(
                  'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
                  mode === 'register' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300',
                )}
              >
                Registrieren
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {mode === 'forgot' ? (
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input pl-10"
                    placeholder="you@school.edu"
                  />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                <KeyRound className="h-4 w-4" />
                {loading ? 'Senden...' : 'Reset-Email senden'}
              </button>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="btn-ghost w-full"
              >
                <ArrowLeft className="h-4 w-4" />
                Zurueck zur Anmeldung
              </button>
            </form>
          ) : mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input pl-10"
                    placeholder="you@school.edu"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="label">Passwort</label>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="mb-1.5 text-xs text-blue-400 transition-colors hover:text-blue-300"
                  >
                    Passwort vergessen?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input px-10"
                    placeholder="Passwort"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                <LogIn className="h-4 w-4" />
                {loading ? 'Anmelden...' : 'Anmelden'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="label">Vollstaendiger Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="label">Email</label>
                <div className="partial-input-wrap relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input pl-10"
                    placeholder="you@school.edu"
                  />
                </div>
              </div>
              <div>
                <label className="label">Passwort</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input px-10"
                    placeholder="Mindestens 6 Zeichen"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Rolle</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(ROLE_META) as UserRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={cn(
                        'rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                        role === r
                          ? 'border-blue-500 bg-blue-600/15 text-blue-300'
                          : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300',
                      )}
                    >
                      {ROLE_META[r].label}
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                <UserPlus className="h-4 w-4" />
                {loading ? 'Konto wird erstellt...' : 'Konto erstellen'}
              </button>
            </form>
          )}

          {mode === 'login' && biometricAvailable && biometricEmail && (
            <div className="mt-4 border-t border-slate-800 pt-4">
              <button
                onClick={handleBiometricUnlock}
                disabled={biometricLoading}
                className="btn-secondary w-full"
              >
                <Fingerprint className={cn('h-5 w-5', biometricLoading && 'animate-pulse text-emerald-400')} />
                {biometricLoading ? 'Scanne...' : `Mit Fingerabdruck anmelden (${biometricEmail})`}
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          Geschuetzt durch Passwort- & Biometrie-Authentifizierung · Auto-Sperre bei Inaktivitaet
        </p>
      </div>
    </div>
  );
}
