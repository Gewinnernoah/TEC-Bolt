import { useState, useEffect } from 'react';
import { Users, Search, Shield, Fingerprint, Edit, Ban, CheckCircle2, UserCog } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { ROLE_META } from '@/lib/constants';
import { cn, initials, logActivity } from '@/lib/utils';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import type { Profile, UserRole } from '@/lib/types';

export function AdminUsersPage() {
  const { profile: currentUser } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editing, setEditing] = useState<Profile | null>(null);
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
    active: users.filter((u) => u.is_active).length,
  };

  const toggleActive = async (user: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id);
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('user.toggle_active', 'user', user.id, { active: !user.is_active });
    toast(`User ${!user.is_active ? 'activated' : 'deactivated'}`, 'success');
    load();
  };

  const saveUser = async (updates: Partial<Profile>) => {
    if (!editing) return;
    const { error } = await supabase.from('profiles').update(updates).eq('id', editing.id);
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('user.update', 'user', editing.id, updates);
    toast('User updated', 'success');
    setEditing(null);
    load();
  };

  if (loading) return <LoadingScreen message="Loading users..." />;

  return (
    <div className="space-y-5">
      <PageHeader title="User Management" subtitle="Manage user accounts, roles, and permissions" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatBox label="Total Users" value={stats.total} icon={Users} color="blue" />
        <StatBox label="Admins" value={stats.admins} icon={Shield} color="red" />
        <StatBox label="Staff" value={stats.staff} icon={UserCog} color="cyan" />
        <StatBox label="Teachers" value={stats.teachers} icon={Users} color="emerald" />
        <StatBox label="Active" value={stats.active} icon={CheckCircle2} color="emerald" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="input pl-10" />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="select w-auto">
          <option value="all">All Roles</option>
          <option value="admin">Admins</option>
          <option value="staff">Staff</option>
          <option value="teacher">Teachers</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50">
              <tr>
                <th className="table-header">User</th>
                <th className="table-header">Role</th>
                <th className="table-header">Department</th>
                <th className="table-header">Status</th>
                <th className="table-header">Biometric</th>
                <th className="table-header">Auto-Logout</th>
                <th className="table-header">Actions</th>
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
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell">{user.fingerprint_enrolled ? <Fingerprint className="h-4 w-4 text-emerald-400" /> : <span className="text-xs text-slate-500">Not enrolled</span>}</td>
                  <td className="table-cell text-xs">{user.exempt_auto_logout ? <span className="text-amber-300">Exempt</span> : <span className="text-slate-400">Enabled</span>}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(user)} className="btn-icon" title="Edit"><Edit className="h-4 w-4" /></button>
                      {user.id !== currentUser?.id && <button onClick={() => toggleActive(user)} className="btn-icon" title={user.is_active ? 'Deactivate' : 'Activate'}>{user.is_active ? <Ban className="h-4 w-4 text-red-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState icon={Users} title="No users found" />}
      </div>

      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} onSave={saveUser} />}
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

function EditUserModal({ user, onClose, onSave }: { user: Profile; onClose: () => void; onSave: (updates: Partial<Profile>) => void }) {
  const [fullName, setFullName] = useState(user.full_name);
  const [role, setRole] = useState<UserRole>(user.role);
  const [department, setDepartment] = useState(user.department ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [exemptAutoLogout, setExemptAutoLogout] = useState(user.exempt_auto_logout);
  const [isActive, setIsActive] = useState(user.is_active);

  return (
    <Modal open onClose={onClose} title={`Edit ${user.full_name}`} size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave({ full_name: fullName, role, department: department || null, phone: phone || null, exempt_auto_logout: exemptAutoLogout, is_active: isActive })}>Save</button></>}>
      <div className="space-y-4">
        <div><label className="label">Full Name</label><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
        <div><label className="label">Email</label><input className="input" value={user.email} disabled /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Role</label>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="admin">Administrator</option><option value="staff">Lending Staff</option><option value="teacher">Teacher</option>
            </select>
          </div>
          <div><label className="label">Department</label><input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
        </div>
        <div><label className="label">Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={exemptAutoLogout} onChange={(e) => setExemptAutoLogout(e.target.checked)} className="rounded" /> Exempt from auto-logout</label>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" /> Account active</label>
        </div>
        {user.fingerprint_enrolled && <div className="flex items-center gap-2 rounded-lg bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300"><Fingerprint className="h-4 w-4" /> Fingerprint authentication enrolled</div>}
      </div>
    </Modal>
  );
}
