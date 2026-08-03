import { useState, useEffect } from 'react';
import { Users, Search, Shield, Fingerprint, Edit, Ban, CheckCircle2, UserCog, UserPlus, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { ROLE_META, PERMISSION_META, DEFAULT_PERMISSIONS } from '@/lib/constants';
import { cn, initials, logActivity } from '@/lib/utils';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import type { Profile, UserRole, UserPermissions } from '@/lib/types';

/** Roles an admin may assign. */
const ASSIGNABLE_ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'staff', label: 'Ausleih-Personal' },
  { value: 'teacher', label: 'Lehrer' },
  { value: 'student', label: 'Schüler' },
];

/** Merge stored permissions with defaults so every toggle is always present. */
function normalizePermissions(p: UserPermissions | null | undefined): UserPermissions {
  return { ...DEFAULT_PERMISSIONS, ...(p ?? {}) };
}

export function AdminUsersPage() {
  const { profile: currentUser } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('full_name');
    setUsers((data ?? []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = users.filter((u) => {
    if (search && !u.full_name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    return true;
  });

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === 'admin').length,
    staff: users.filter((u) => u.role === 'staff').length,
    teachers: users.filter((u) => u.role === 'teacher').length,
    students: users.filter((u) => u.role === 'student').length,
    active: users.filter((u) => u.is_active).length,
  };

  const toggleActive = async (user: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id);
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('user.toggle_active', 'user', user.id, { active: !user.is_active });
    toast(`Benutzer ${!user.is_active ? 'aktiviert' : 'deaktiviert'}`, 'success');
    load();
  };

  const saveUser = async (updates: Partial<Profile>) => {
    if (!editing) return;
    const { error } = await supabase.from('profiles').update(updates).eq('id', editing.id);
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('user.update', 'user', editing.id, updates);
    toast('Benutzer aktualisiert', 'success');
    setEditing(null);
    load();
  };

  const createUser = async (input: {
    email: string;
    fullName: string;
    role: UserRole;
    department: string;
    tempPassword: string;
    permissions: UserPermissions;
  }) => {
    // Browser-side: use the regular signUp flow with the temp password, then
    // update the auto-created profile row with the admin-chosen role etc.
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.tempPassword,
      options: { data: { full_name: input.fullName, role: input.role } },
    });
    if (error) { toast(error.message, 'error'); return false; }

    const userId = data.user?.id;
    if (userId) {
      const { error: updErr } = await supabase
        .from('profiles')
        .update({
          full_name: input.fullName,
          role: input.role,
          department: input.department || null,
          must_change_password: true,
          permissions: input.permissions,
        })
        .eq('id', userId);
      if (updErr) {
        toast(`Konto erstellt, aber Profil-Update fehlgeschlagen: ${updErr.message}`, 'error');
      }
      await logActivity('user.create', 'user', userId, { email: input.email, role: input.role });
    }

    toast('Benutzer erfolgreich angelegt', 'success');
    setCreating(false);
    load();
    return true;
  };

  if (loading) return <LoadingScreen message="Benutzer werden geladen..." />;

  return (
    <div className="space-y-5">
      <PageHeader title="Benutzerverwaltung" subtitle="Benutzerkonten, Rollen und Berechtigungen verwalten" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatBox label="Benutzer gesamt" value={stats.total} icon={Users} color="blue" />
        <StatBox label="Administratoren" value={stats.admins} icon={Shield} color="red" />
        <StatBox label="Personal" value={stats.staff} icon={UserCog} color="cyan" />
        <StatBox label="Lehrer" value={stats.teachers} icon={Users} color="emerald" />
        <StatBox label="Schüler" value={stats.students} icon={Users} color="cyan" />
        <StatBox label="Aktiv" value={stats.active} icon={CheckCircle2} color="emerald" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Benutzer suchen..." className="input pl-10" />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="select w-auto">
          <option value="all">Alle Rollen</option>
          <option value="admin">Administratoren</option>
          <option value="staff">Personal</option>
          <option value="teacher">Lehrer</option>
          <option value="student">Schüler</option>
        </select>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <UserPlus className="h-4 w-4" />
          Neuen Benutzer anlegen
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50">
              <tr>
                <th className="table-header">Benutzer</th>
                <th className="table-header">Rolle</th>
                <th className="table-header">Abteilung</th>
                <th className="table-header">Status</th>
                <th className="table-header">Biometrie</th>
                <th className="table-header">Auto-Sperre</th>
                <th className="table-header">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((user) => (
                <tr key={user.id} className="hover:bg-slate-800/30">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-xs font-semibold text-white">{initials(user.full_name)}</div>
                      <div>
                        <div className="font-medium text-slate-200">{user.full_name}</div>
                        <div className="text-xs text-slate-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell"><span className={cn('badge', ROLE_META[user.role].bg, ROLE_META[user.role].color)}>{ROLE_META[user.role].label}</span></td>
                  <td className="table-cell text-xs text-slate-400">{user.department ?? '—'}</td>
                  <td className="table-cell">
                    <span className={cn('badge', user.is_active ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-red-500/15 border-red-500/30 text-red-300')}>
                      {user.is_active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td className="table-cell">{user.fingerprint_enrolled ? <Fingerprint className="h-4 w-4 text-emerald-400" /> : <span className="text-xs text-slate-500">Nicht registriert</span>}</td>
                  <td className="table-cell text-xs">{user.exempt_auto_logout ? <span className="text-amber-300">Befreit</span> : <span className="text-slate-400">Aktiv</span>}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(user)} className="btn-icon" title="Bearbeiten"><Edit className="h-4 w-4" /></button>
                      {user.id !== currentUser?.id && <button onClick={() => toggleActive(user)} className="btn-icon" title={user.is_active ? 'Deaktivieren' : 'Aktivieren'}>{user.is_active ? <Ban className="h-4 w-4 text-red-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState icon={Users} title="Keine Benutzer gefunden" />}
      </div>

      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} onSave={saveUser} />}
      {creating && <CreateUserModal onClose={() => setCreating(false)} onCreate={createUser} />}
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-500/10', red: 'text-red-400 bg-red-500/10',
    cyan: 'text-cyan-400 bg-cyan-500/10', emerald: 'text-emerald-400 bg-emerald-500/10',
  };
  return (
    <div className="card p-4">
      <div className={cn('mb-2 inline-flex rounded-lg p-2', colorMap[color] ?? colorMap.blue)}><Icon className="h-5 w-5" /></div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

/** Shared permissions toggle block used by both edit and create modals. */
function PermissionsSection({ permissions, onChange }: { permissions: UserPermissions; onChange: (p: UserPermissions) => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
      <div className="text-sm font-medium text-slate-200">Funktionsberechtigungen</div>
      <p className="text-xs text-slate-400">Legen Sie fest, auf welche Funktionen der Benutzer zugreifen darf.</p>
      <div className="mt-2 space-y-2">
        {PERMISSION_META.map((meta) => (
          <label key={meta.key} className="flex items-start gap-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={permissions[meta.key]}
              onChange={(e) => onChange({ ...permissions, [meta.key]: e.target.checked })}
              className="mt-0.5 rounded"
            />
            <div>
              <div className="font-medium text-slate-200">{meta.label}</div>
              <div className="text-xs text-slate-400">{meta.description}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose, onSave }: { user: Profile; onClose: () => void; onSave: (updates: Partial<Profile>) => void }) {
  const [fullName, setFullName] = useState(user.full_name);
  const [role, setRole] = useState<UserRole>(user.role);
  const [department, setDepartment] = useState(user.department ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [exemptAutoLogout, setExemptAutoLogout] = useState(user.exempt_auto_logout);
  const [isActive, setIsActive] = useState(user.is_active);
  const [permissions, setPermissions] = useState<UserPermissions>(normalizePermissions(user.permissions));

  return (
    <Modal open onClose={onClose} title={`Bearbeiten: ${user.full_name}`} size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Abbrechen</button><button className="btn-primary" onClick={() => onSave({ full_name: fullName, role, department: department || null, phone: phone || null, exempt_auto_logout: exemptAutoLogout, is_active: isActive, permissions })}>Speichern</button></>}>
      <div className="space-y-4">
        <div><label className="label">Vollständiger Name</label><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
        <div><label className="label">Email</label><input className="input" value={user.email} disabled /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Rolle</label>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div><label className="label">Abteilung</label><input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
        </div>
        <div><label className="label">Telefon</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={exemptAutoLogout} onChange={(e) => setExemptAutoLogout(e.target.checked)} className="rounded" /> Von Auto-Sperre befreit</label>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" /> Konto aktiv</label>
        </div>
        <PermissionsSection permissions={permissions} onChange={setPermissions} />
        {user.fingerprint_enrolled && <div className="flex items-center gap-2 rounded-lg bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300"><Fingerprint className="h-4 w-4" /> Fingerabdruck-Authentifizierung registriert</div>}
      </div>
    </Modal>
  );
}

function CreateUserModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (input: { email: string; fullName: string; role: UserRole; department: string; tempPassword: string; permissions: UserPermissions }) => Promise<boolean>;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('teacher');
  const [department, setDepartment] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [permissions, setPermissions] = useState<UserPermissions>({ ...DEFAULT_PERMISSIONS });
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim() && fullName.trim() && tempPassword.length >= 6 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    await onCreate({
      email: email.trim(),
      fullName: fullName.trim(),
      role,
      department: department.trim(),
      tempPassword,
      permissions,
    });
    setSubmitting(false);
  };

  return (
    <Modal open onClose={onClose} title="Neuen Benutzer anlegen" size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Abbrechen</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Wird erstellt...</> : <><UserPlus className="h-4 w-4" /> Benutzer anlegen</>}
          </button>
        </>
      }>
      <div className="space-y-4">
        <div><label className="label">Vollständiger Name</label><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" /></div>
        <div><label className="label">Email</label><input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@school.edu" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Rolle</label>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div><label className="label">Abteilung</label><input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="z. B. Informatik" /></div>
        </div>
        <div>
          <label className="label">Temporäres Passwort</label>
          <input type="text" className="input" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="Mindestens 6 Zeichen" />
          <p className="mt-1 text-xs text-amber-300">Der Benutzer muss dieses Passwort beim ersten Anmelden ändern.</p>
        </div>
        <PermissionsSection permissions={permissions} onChange={setPermissions} />
      </div>
    </Modal>
  );
}
