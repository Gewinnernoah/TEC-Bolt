import { useState, useEffect } from 'react';
import { Monitor, Search, Download } from 'lucide-react';
import { supabase } from '@/lib/db';
import { timeAgo, downloadFile } from '@/lib/utils';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import type { ActivityLog } from '@/lib/types';

export function AdminLogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('activity_logs').select('*, user:profiles(*)').order('created_at', { ascending: false }).limit(200);
    setLogs((data ?? []) as ActivityLog[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const actions = Array.from(new Set(logs.map((l) => l.action.split('.')[0])));

  const filtered = logs.filter((l) => {
    if (search && !l.action.toLowerCase().includes(search.toLowerCase()) && !l.user?.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (actionFilter !== 'all' && !l.action.startsWith(actionFilter)) return false;
    return true;
  });

  const exportLogs = () => {
    const csv = ['Timestamp,User,Action,Entity Type,Entity ID,Details'];
    filtered.forEach((l) => {
      csv.push(`${l.created_at},${l.user?.full_name ?? 'System'},${l.action},${l.entity_type ?? ''},${l.entity_id ?? ''},${JSON.stringify(l.details)}`);
    });
    downloadFile(csv.join('\n'), 'activity-logs.csv', 'text/csv');
  };

  if (loading) return <LoadingScreen message="Loading activity logs..." />;

  return (
    <div className="space-y-5">
      <PageHeader title="Activity Logs & Audit Trail" subtitle={`${logs.length} recent actions logged`} actions={
        <button onClick={exportLogs} className="btn-secondary"><Download className="h-4 w-4" /> Export CSV</button>
      } />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by action or user..." className="input pl-10" />
        </div>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="select w-auto">
          <option value="all">All Actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="scrollbar-thin max-h-[600px] overflow-y-auto">
          {filtered.length === 0 ? <EmptyState icon={Monitor} title="No logs found" /> : (
            <table className="w-full">
              <thead className="bg-slate-900/50 sticky top-0">
                <tr>
                  <th className="table-header">Time</th>
                  <th className="table-header">User</th>
                  <th className="table-header">Action</th>
                  <th className="table-header">Entity</th>
                  <th className="table-header">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30">
                    <td className="table-cell text-xs text-slate-400 whitespace-nowrap">{timeAgo(log.created_at)}</td>
                    <td className="table-cell"><span className="text-sm text-slate-200">{log.user?.full_name ?? 'System'}</span></td>
                    <td className="table-cell"><span className="badge bg-blue-500/10 border-blue-500/20 text-blue-300 text-[10px] font-mono">{log.action}</span></td>
                    <td className="table-cell text-xs text-slate-400">{log.entity_type ?? '—'}{log.entity_id ? `:${log.entity_id.slice(0, 8)}` : ''}</td>
                    <td className="table-cell text-xs text-slate-500 max-w-xs truncate">{Object.keys(log.details).length > 0 ? JSON.stringify(log.details) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
