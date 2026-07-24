import { useState, useEffect, useMemo } from 'react';
import {
  Wifi, HandHelping, Ticket, Printer, AlertTriangle,
  Package, Server, Zap, X, CircleDot, TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/db';
import { DEVICE_STATUS_META } from '@/lib/constants';
import { cn, formatDateTime, isOverdue, calculateLessonNumber } from '@/lib/utils';
import { useSetting } from '@/lib/settings';
import type { Device, LendingLoan, PrintRequest, Ticket as TicketType, WifiMeasurement, Consumable } from '@/lib/types';

export function TecRoomPage({ onExit }: { onExit: () => void }) {
  const [now, setNow] = useState(new Date());
  const [devices, setDevices] = useState<Device[]>([]);
  const [loans, setLoans] = useState<LendingLoan[]>([]);
  const [prints, setPrints] = useState<PrintRequest[]>([]);
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [wifi, setWifi] = useState<WifiMeasurement[]>([]);
  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [lessonStart] = useSetting<string>('lesson_start_time', '08:00');
  const [lessonDuration] = useSetting<number>('lesson_duration_minutes', 45);
  const [lessonBreak] = useSetting<number>('lesson_break_minutes', 15);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const channels: ReturnType<typeof supabase.channel>[] = [];

    const loadAll = async () => {
      const [d, l, p, t, w, c] = await Promise.all([
        supabase.from('devices').select('*'),
        supabase.from('lending_loans').select('*, teacher:profiles!lending_loans_teacher_id_fkey(*), room:rooms(*), items:lending_loan_items(*)').eq('status', 'active'),
        supabase.from('print_requests').select('*, teacher:profiles!print_requests_teacher_id_fkey(*)').in('status', ['queued', 'printing', 'paused']),
        supabase.from('tickets').select('*, category:ticket_categories(*)').in('status', ['open', 'in_progress', 'escalated']),
        supabase.from('wifi_measurements').select('*, room:rooms(*)').order('created_at', { ascending: false }).limit(50),
        supabase.from('consumables').select('*'),
      ]);
      setDevices((d.data ?? []) as Device[]);
      setLoans((l.data ?? []) as LendingLoan[]);
      setPrints((p.data ?? []) as PrintRequest[]);
      setTickets((t.data ?? []) as TicketType[]);
      setWifi((w.data ?? []) as WifiMeasurement[]);
      setConsumables((c.data ?? []) as Consumable[]);
    };

    loadAll();

    // Real-time subscriptions
    ['devices', 'lending_loans', 'print_requests', 'tickets', 'wifi_measurements', 'consumables'].forEach((table) => {
      const ch = supabase.channel(`tec-${table}`).on('postgres_changes', { event: '*', schema: 'public', table }, () => loadAll()).subscribe();
      channels.push(ch);
    });

    return () => channels.forEach((ch) => supabase.removeChannel(ch));
  }, []);

  const lesson = useMemo(() => calculateLessonNumber(lessonStart, lessonDuration, lessonBreak), [lessonStart, lessonDuration, lessonBreak]);

  const stats = useMemo(() => {
    const activeLoans = loans.length;
    const overdueLoans = loans.filter((l) => isOverdue(l.expected_return_at)).length;
    const printingJobs = prints.length;
    const openTickets = tickets.length;
    const escalatedTickets = tickets.filter((t) => t.escalated).length;
    const latestWifi = new Map<string, WifiMeasurement>();
    wifi.forEach((m) => { const existing = latestWifi.get(m.room_id); if (!existing || new Date(m.created_at) > new Date(existing.created_at)) latestWifi.set(m.room_id, m); });
    const poorWifi = Array.from(latestWifi.values()).filter((w) => w.signal_strength_dbm < -67 || w.is_outage).length;
    const lowConsumables = consumables.filter((c) => c.current_stock <= c.min_stock).length;
    const available = devices.filter((d) => d.status === 'available').length;
    const borrowed = devices.filter((d) => d.status === 'borrowed').length;
    const defective = devices.filter((d) => d.status === 'defective').length;
    const maintenance = devices.filter((d) => d.status === 'maintenance').length;
    return { activeLoans, overdueLoans, printingJobs, openTickets, escalatedTickets, poorWifi, lowConsumables, available, borrowed, defective, maintenance, totalDevices: devices.length };
  }, [devices, loans, prints, tickets, wifi, consumables]);

  return (
    <div className="fixed inset-0 z-50 bg-[#050810] overflow-hidden">
      {/* Exit button (top-right, small) */}
      <button onClick={onExit} className="absolute right-3 top-3 z-50 btn-icon text-slate-600 hover:text-slate-300" title="Exit (click to exit)">
        <X className="h-5 w-5" />
      </button>

      <div className="h-full flex flex-col p-4 gap-3">
        {/* Top bar: clock + lesson + system status */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/30">
                <Server className="h-7 w-7 text-white" />
              </div>
              <div>
                <div className="text-lg font-bold text-slate-100">TEC Room Monitor</div>
                <div className="text-xs text-slate-500">School Technology Operations Center</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CircleDot className="h-5 w-5 text-blue-400 animate-pulse" />
              <div>
                <div className="text-sm font-semibold text-slate-200">{lesson.current > 0 && lesson.current <= lesson.total ? `Period ${lesson.current} / ${lesson.total}` : 'Outside School Hours'}</div>
                <div className="text-xs text-slate-500">Current Lesson</div>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-4xl font-bold text-slate-100 tabular-nums tracking-tight">
              {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-sm text-slate-400">
              {now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Traffic lights */}
        <div className="grid grid-cols-4 gap-3 flex-shrink-0">
          <TrafficLight icon={Server} title="System Status" status={stats.totalDevices > 0 ? 'green' : 'amber'} detail={stats.totalDevices > 0 ? 'Operational' : 'Loading'} />
          <TrafficLight icon={Wifi} title="Wi-Fi Health" status={stats.poorWifi === 0 ? 'green' : stats.poorWifi <= 2 ? 'amber' : 'red'} detail={`${stats.poorWifi} rooms poor`} />
          <TrafficLight icon={HandHelping} title="Lending" status={stats.overdueLoans === 0 ? 'green' : stats.overdueLoans <= 2 ? 'amber' : 'red'} detail={`${stats.overdueLoans} overdue`} />
          <TrafficLight icon={Ticket} title="Tickets" status={stats.openTickets === 0 ? 'green' : stats.openTickets <= 3 ? 'amber' : 'red'} detail={`${stats.openTickets} open`} />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">
          {/* Active loans */}
          <Panel title="Active Loans" icon={HandHelping} count={stats.activeLoans} className="col-span-4 row-span-2">
            <div className="scrollbar-thin h-full overflow-y-auto space-y-1.5">
              {loans.slice(0, 10).map((loan) => {
                const overdue = isOverdue(loan.expected_return_at);
                return (
                  <div key={loan.id} className={cn('rounded-lg border p-2.5', overdue ? 'border-red-500/30 bg-red-950/20' : 'border-slate-800 bg-slate-900/30')}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-200 truncate">{loan.teacher?.full_name ?? '—'}</span>
                      {overdue && <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />}
                    </div>
                    <div className="text-xs text-slate-500">{loan.items?.length ?? 0} device(s) · Due {formatDateTime(loan.expected_return_at)}</div>
                  </div>
                );
              })}
              {loans.length === 0 && <div className="text-center text-sm text-slate-600 py-8">No active loans</div>}
            </div>
          </Panel>

          {/* Print jobs */}
          <Panel title="Print Queue" icon={Printer} count={stats.printingJobs} className="col-span-4">
            <div className="scrollbar-thin h-full overflow-y-auto space-y-1.5">
              {prints.slice(0, 5).map((job) => (
                <div key={job.id} className="rounded-lg border border-slate-800 bg-slate-900/30 p-2.5">
                  <div className="text-sm font-medium text-slate-200 truncate">{job.file_name}</div>
                  <div className="text-xs text-slate-500">{job.teacher?.full_name ?? '—'} · {job.filament_material} {job.filament_color}</div>
                  {job.status === 'printing' && (
                    <div className="mt-1.5">
                      <div className="flex justify-between text-xs"><span className="text-emerald-300">Layer {job.current_layer}/{job.total_layers}</span><span className="text-slate-400">{job.progress_pct}%</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${job.progress_pct}%` }} /></div>
                    </div>
                  )}
                </div>
              ))}
              {prints.length === 0 && <div className="text-center text-sm text-slate-600 py-8">No active prints</div>}
            </div>
          </Panel>

          {/* Device status */}
          <Panel title="Device Status" icon={Package} count={stats.totalDevices} className="col-span-4">
            <div className="grid grid-cols-5 gap-2 h-full items-center">
              {(Object.keys(DEVICE_STATUS_META) as Device['status'][]).map((status) => {
                const count = devices.filter((d) => d.status === status).length;
                const meta = DEVICE_STATUS_META[status];
                return (
                  <div key={status} className="text-center">
                    <div className={cn('mx-auto mb-1.5 flex h-14 w-14 items-center justify-center rounded-full border-2', meta.bg)}>
                      <span className="text-xl font-bold text-slate-100">{count}</span>
                    </div>
                    <div className={cn('text-[10px] font-medium', meta.color)}>{meta.label}</div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Open tickets */}
          <Panel title="Open Tickets" icon={Ticket} count={stats.openTickets} className="col-span-4">
            <div className="scrollbar-thin h-full overflow-y-auto space-y-1.5">
              {tickets.slice(0, 6).map((ticket) => (
                <div key={ticket.id} className={cn('rounded-lg border p-2.5', ticket.escalated ? 'border-red-500/30 bg-red-950/20' : 'border-slate-800 bg-slate-900/30')}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-200 truncate">{ticket.title}</span>
                    {ticket.escalated && <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />}
                  </div>
                  <div className="text-xs text-slate-500">{ticket.ticket_number} · {ticket.category?.name ?? ticket.category_key}</div>
                </div>
              ))}
              {tickets.length === 0 && <div className="text-center text-sm text-slate-600 py-8">No open tickets</div>}
            </div>
          </Panel>

          {/* Wi-Fi health */}
          <Panel title="Wi-Fi Health" icon={Wifi} className="col-span-4">
            <div className="space-y-1.5">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-emerald-500/10 p-2"><div className="text-lg font-bold text-emerald-400">{Array.from(new Map(wifi.map((m) => [m.room_id, m])).values()).filter((m) => m.signal_strength_dbm >= -55).length}</div><div className="text-[10px] text-slate-500">Good</div></div>
                <div className="rounded-lg bg-amber-500/10 p-2"><div className="text-lg font-bold text-amber-400">{Array.from(new Map(wifi.map((m) => [m.room_id, m])).values()).filter((m) => m.signal_strength_dbm < -55 && m.signal_strength_dbm >= -67).length}</div><div className="text-[10px] text-slate-500">OK</div></div>
                <div className="rounded-lg bg-orange-500/10 p-2"><div className="text-lg font-bold text-orange-400">{Array.from(new Map(wifi.map((m) => [m.room_id, m])).values()).filter((m) => m.signal_strength_dbm < -67 && m.signal_strength_dbm >= -75).length}</div><div className="text-[10px] text-slate-500">Poor</div></div>
                <div className="rounded-lg bg-red-500/10 p-2"><div className="text-lg font-bold text-red-400">{Array.from(new Map(wifi.map((m) => [m.room_id, m])).values()).filter((m) => m.signal_strength_dbm < -75 || m.is_outage).length}</div><div className="text-[10px] text-slate-500">Critical</div></div>
              </div>
              {stats.poorWifi > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-2 text-xs text-red-300">
                  <AlertTriangle className="inline h-3.5 w-3.5 mr-1" /> {stats.poorWifi} rooms with poor network quality
                </div>
              )}
            </div>
          </Panel>

          {/* Urgent notifications */}
          <Panel title="Urgent Notifications" icon={Zap} className="col-span-4">
            <div className="scrollbar-thin h-full overflow-y-auto space-y-1.5">
              {stats.overdueLoans > 0 && <UrgentItem text={`${stats.overdueLoans} overdue loans need immediate return`} color="red" />}
              {stats.escalatedTickets > 0 && <UrgentItem text={`${stats.escalatedTickets} escalated tickets need attention`} color="red" />}
              {stats.poorWifi > 0 && <UrgentItem text={`${stats.poorWifi} rooms with Wi-Fi issues`} color="amber" />}
              {stats.lowConsumables > 0 && <UrgentItem text={`${stats.lowConsumables} consumables low on stock`} color="orange" />}
              {stats.defective > 0 && <UrgentItem text={`${stats.defective} defective devices need repair`} color="red" />}
              {stats.maintenance > 0 && <UrgentItem text={`${stats.maintenance} devices in maintenance`} color="amber" />}
              {stats.overdueLoans === 0 && stats.escalatedTickets === 0 && stats.poorWifi === 0 && stats.lowConsumables === 0 && stats.defective === 0 && (
                <div className="text-center text-sm text-emerald-400 py-8"><TrendingUp className="mx-auto h-6 w-6 mb-1" /> All systems clear</div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function TrafficLight({ icon: Icon, title, status, detail }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  status: 'green' | 'amber' | 'red';
  detail: string;
}) {
  const colors = {
    green: { dot: 'bg-emerald-400 shadow-emerald-400/50', text: 'text-emerald-300', bar: 'from-emerald-500/20' },
    amber: { dot: 'bg-amber-400 shadow-amber-400/50', text: 'text-amber-300', bar: 'from-amber-500/20' },
    red: { dot: 'bg-red-400 shadow-red-400/50', text: 'text-red-300', bar: 'from-red-500/20' },
  };
  const c = colors[status];
  return (
    <div className={cn('rounded-xl border border-slate-800 bg-gradient-to-b to-slate-900/40 p-3', c.bar)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-slate-400" />
          <span className="text-sm font-medium text-slate-200">{title}</span>
        </div>
        <span className={cn('h-4 w-4 rounded-full shadow-lg', c.dot)} />
      </div>
      <div className={cn('mt-1.5 text-xs', c.text)}>{detail}</div>
    </div>
  );
}

function Panel({ title, icon: Icon, count, className, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-xl border border-slate-800 bg-slate-900/40 flex flex-col min-h-0', className)}>
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold text-slate-200">{title}</span>
        </div>
        {count !== undefined && <span className="badge bg-blue-500/15 border-blue-500/30 text-blue-300 text-[10px]">{count}</span>}
      </div>
      <div className="flex-1 min-h-0 p-2.5">{children}</div>
    </div>
  );
}

function UrgentItem({ text, color }: { text: string; color: string }) {
  const colorMap: Record<string, string> = {
    red: 'border-red-500/30 bg-red-950/20 text-red-300',
    amber: 'border-amber-500/30 bg-amber-950/20 text-amber-300',
    orange: 'border-orange-500/30 bg-orange-950/20 text-orange-300',
  };
  return <div className={cn('rounded-lg border px-3 py-2 text-xs', colorMap[color])}>{text}</div>;
}
