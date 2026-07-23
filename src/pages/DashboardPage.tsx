import { useEffect, useState, useMemo } from 'react';
import {
  Package, HandHelping, AlertTriangle, Printer, Ticket as TicketIcon, Wifi,
  Clock, Activity, TrendingUp, Battery, CalendarClock, Zap, CircleDot,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useDevices, useLoans, useRequests, usePrintRequests, useTickets, useWifiMeasurements, useConsumables } from '@/lib/hooks';
import { DEVICE_STATUS_META, LOAN_STATUS_META, PRINT_STATUS_META, TICKET_STATUS_META } from '@/lib/constants';
import { cn, formatDateTime, timeAgo, isOverdue, calculateLessonNumber } from '@/lib/utils';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { useSetting } from '@/lib/settings';
import type { Device, LendingLoan, PrintRequest, Ticket } from '@/lib/types';
// Use the lucide Ticket icon as TicketIcon to avoid clash with the Ticket type
const Ticket = TicketIcon;

export function DashboardPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { profile } = useAuth();
  const { data: devices } = useDevices();
  const { data: loans } = useLoans('active');
  const { data: pendingRequests } = useRequests('pending');
  const { data: printRequests } = usePrintRequests();
  const { data: tickets } = useTickets('open');
  const { data: wifi } = useWifiMeasurements(50);
  const { data: consumables } = useConsumables();
  const [now, setNow] = useState(new Date());
  const [lessonStart] = useSetting<string>('lesson_start_time', '08:00');
  const [lessonDuration] = useSetting<number>('lesson_duration_minutes', 45);
  const [lessonBreak] = useSetting<number>('lesson_break_minutes', 15);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const lesson = useMemo(() => calculateLessonNumber(lessonStart, lessonDuration, lessonBreak), [lessonStart, lessonDuration, lessonBreak]);

  const stats = useMemo(() => {
    const activeLoans = loans ?? [];
    const overdueLoans = activeLoans.filter((l) => isOverdue(l.expected_return_at));
    const printingJobs = (printRequests ?? []).filter((p) => p.status === 'printing' || p.status === 'queued');
    const openTickets = tickets ?? [];
    const poorWifi = (wifi ?? []).filter((w) => w.signal_strength_dbm < -67 || w.is_outage);
    const lowConsumables = (consumables ?? []).filter((c) => c.current_stock <= c.min_stock);
    const available = (devices ?? []).filter((d) => d.status === 'available').length;
    const borrowed = (devices ?? []).filter((d) => d.status === 'borrowed').length;
    const maintenance = (devices ?? []).filter((d) => d.status === 'maintenance').length;
    const defective = (devices ?? []).filter((d) => d.status === 'defective').length;

    return {
      activeLoans: activeLoans.length,
      overdueLoans: overdueLoans.length,
      pendingRequests: (pendingRequests ?? []).length,
      printingJobs: printingJobs.length,
      openTickets: openTickets.length,
      poorWifi: poorWifi.length,
      lowConsumables: lowConsumables.length,
      available, borrowed, maintenance, defective,
      totalDevices: (devices ?? []).length,
    };
  }, [devices, loans, pendingRequests, printRequests, tickets, wifi, consumables]);

  if (!profile) return <LoadingScreen />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${profile.full_name.split(' ')[0]}`}
        subtitle="Real-time overview of the school's technology operations"
        actions={
          <div className="card px-4 py-2">
            <div className="text-xs text-slate-400">Current Lesson</div>
            <div className="flex items-center gap-2">
              <CircleDot className="h-4 w-4 text-blue-400 animate-pulse" />
              <span className="text-lg font-semibold text-slate-100">
                {lesson.current > 0 && lesson.current <= lesson.total ? `Period ${lesson.current}` : 'Outside school hours'}
              </span>
            </div>
          </div>
        }
      />

      {/* Clock bar */}
      <div className="card flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-blue-400" />
          <div>
            <div className="text-2xl font-bold text-slate-100 tabular-nums">
              {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-xs text-slate-400">
              {now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('badge', stats.overdueLoans > 0 ? 'bg-red-500/15 border-red-500/30 text-red-300' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300')}>
            <AlertTriangle className="h-3 w-3" />
            {stats.overdueLoans} overdue
          </div>
          <div className="badge bg-blue-500/15 border-blue-500/30 text-blue-300">
            <Activity className="h-3 w-3" />
            {stats.activeLoans} active loans
          </div>
          {stats.pendingRequests > 0 && (
            <div className="badge bg-amber-500/15 border-amber-500/30 text-amber-300">
              {stats.pendingRequests} pending requests
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={Package} label="Available Devices" value={stats.available} total={stats.totalDevices} color="emerald" onClick={() => onNavigate('inventory')} />
        <StatCard icon={HandHelping} label="Active Loans" value={stats.activeLoans} color="blue" onClick={() => onNavigate('lending')} />
        <StatCard icon={Printer} label="Print Jobs" value={stats.printingJobs} color="cyan" onClick={() => onNavigate('printing')} />
        <StatCard icon={Ticket} label="Open Tickets" value={stats.openTickets} color="amber" onClick={() => onNavigate('tickets')} />
        <StatCard icon={Wifi} label="Poor Wi-Fi" value={stats.poorWifi} color="red" onClick={() => onNavigate('monitoring')} />
        <StatCard icon={Battery} label="Low Stock" value={stats.lowConsumables} color="orange" onClick={() => onNavigate('inventory')} />
      </div>

      {/* Traffic-light system status */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatusLight
          title="System / Server"
          status={stats.totalDevices > 0 ? 'green' : 'amber'}
          detail={stats.totalDevices > 0 ? 'All systems operational' : 'Loading data...'}
          icon={Activity}
        />
        <StatusLight
          title="Wi-Fi Health"
          status={stats.poorWifi === 0 ? 'green' : stats.poorWifi <= 2 ? 'amber' : 'red'}
          detail={stats.poorWifi === 0 ? 'All rooms good' : `${stats.poorWifi} rooms need attention`}
          icon={Wifi}
        />
        <StatusLight
          title="Lending"
          status={stats.overdueLoans === 0 ? 'green' : stats.overdueLoans <= 2 ? 'amber' : 'red'}
          detail={stats.overdueLoans === 0 ? `${stats.activeLoans} active, no overdue` : `${stats.overdueLoans} overdue loans`}
          icon={HandHelping}
        />
        <StatusLight
          title="Tickets"
          status={stats.openTickets === 0 ? 'green' : stats.openTickets <= 3 ? 'amber' : 'red'}
          detail={stats.openTickets === 0 ? 'All resolved' : `${stats.openTickets} open tickets`}
          icon={Ticket}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Active loans */}
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-200">Active Loans</h3>
            <button onClick={() => onNavigate('lending')} className="text-xs text-blue-400 hover:underline">View all</button>
          </div>
          <div className="scrollbar-thin max-h-80 overflow-y-auto">
            {(loans ?? []).length === 0 ? (
              <EmptyState icon={HandHelping} title="No active loans" />
            ) : (
              (loans ?? []).slice(0, 8).map((loan) => <LoanRow key={loan.id} loan={loan} />)
            )}
          </div>
        </div>

        {/* Print jobs */}
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-200">3D Print Queue</h3>
            <button onClick={() => onNavigate('printing')} className="text-xs text-blue-400 hover:underline">View all</button>
          </div>
          <div className="scrollbar-thin max-h-80 overflow-y-auto">
            {(printRequests ?? []).filter((p) => p.status === 'printing' || p.status === 'queued').length === 0 ? (
              <EmptyState icon={Printer} title="No active print jobs" />
            ) : (
              (printRequests ?? []).filter((p) => p.status === 'printing' || p.status === 'queued').slice(0, 6).map((job) => <PrintRow key={job.id} job={job} />)
            )}
          </div>
        </div>

        {/* Open tickets */}
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-200">Open Tickets</h3>
            <button onClick={() => onNavigate('tickets')} className="text-xs text-blue-400 hover:underline">View all</button>
          </div>
          <div className="scrollbar-thin max-h-80 overflow-y-auto">
            {(tickets ?? []).length === 0 ? (
              <EmptyState icon={Ticket} title="No open tickets" />
            ) : (
              (tickets ?? []).slice(0, 8).map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)
            )}
          </div>
        </div>

        {/* Urgent notifications */}
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-200">Urgent Notifications</h3>
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div className="scrollbar-thin max-h-80 overflow-y-auto p-3 space-y-2">
            {stats.overdueLoans > 0 && (
              <UrgentItem icon={AlertTriangle} color="red" title={`${stats.overdueLoans} overdue loans`} message="Devices need to be returned immediately" onClick={() => onNavigate('lending')} />
            )}
            {stats.pendingRequests > 0 && (
              <UrgentItem icon={CalendarClock} color="amber" title={`${stats.pendingRequests} pending lending requests`} message="Awaiting staff approval" onClick={() => onNavigate('lending')} />
            )}
            {stats.poorWifi > 0 && (
              <UrgentItem icon={Wifi} color="red" title={`${stats.poorWifi} rooms with poor Wi-Fi`} message="Network issues detected" onClick={() => onNavigate('monitoring')} />
            )}
            {stats.lowConsumables > 0 && (
              <UrgentItem icon={Battery} color="orange" title={`${stats.lowConsumables} consumables low on stock`} message="Reorder needed" onClick={() => onNavigate('inventory')} />
            )}
            {stats.defective > 0 && (
              <UrgentItem icon={AlertTriangle} color="red" title={`${stats.defective} defective devices`} message="Require repair" onClick={() => onNavigate('inventory')} />
            )}
            {stats.overdueLoans === 0 && stats.pendingRequests === 0 && stats.poorWifi === 0 && stats.lowConsumables === 0 && stats.defective === 0 && (
              <EmptyState icon={TrendingUp} title="All clear" message="No urgent notifications" />
            )}
          </div>
        </div>
      </div>

      {/* Device status breakdown */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-200">Device Status Overview</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-5">
          {(Object.keys(DEVICE_STATUS_META) as Device['status'][]).map((status) => {
            const count = (devices ?? []).filter((d) => d.status === status).length;
            const meta = DEVICE_STATUS_META[status];
            return (
              <div key={status} className="text-center">
                <div className={cn('mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full border-2', meta.bg)}>
                  <span className="text-2xl font-bold text-slate-100">{count}</span>
                </div>
                <div className={cn('text-xs font-medium', meta.color)}>{meta.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, total, color, onClick }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  total?: number;
  color: string;
  onClick: () => void;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    cyan: 'text-cyan-400 bg-cyan-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    red: 'text-red-400 bg-red-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
  };
  return (
    <button onClick={onClick} className="card card-hover p-4 text-left">
      <div className={cn('mb-3 inline-flex rounded-lg p-2', colorMap[color])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-2xl font-bold text-slate-100">{value}{total !== undefined && <span className="text-sm text-slate-500">/{total}</span>}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </button>
  );
}

function StatusLight({ title, status, detail, icon: Icon }: {
  title: string;
  status: 'green' | 'amber' | 'red';
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const colors = {
    green: { dot: 'bg-emerald-400', text: 'text-emerald-300', glow: 'shadow-emerald-400/50' },
    amber: { dot: 'bg-amber-400', text: 'text-amber-300', glow: 'shadow-amber-400/50' },
    red: { dot: 'bg-red-400', text: 'text-red-300', glow: 'shadow-red-400/50' },
  };
  const c = colors[status];
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-200">{title}</span>
        </div>
        <span className={cn('status-dot h-3 w-3 shadow-lg', c.dot, c.glow)} />
      </div>
      <div className={cn('mt-2 text-xs', c.text)}>{detail}</div>
    </div>
  );
}

function LoanRow({ loan }: { loan: LendingLoan }) {
  const overdue = isOverdue(loan.expected_return_at);
  return (
    <div className={cn('flex items-center justify-between px-5 py-2.5 border-b border-slate-800/50 hover:bg-slate-800/30', overdue && 'bg-red-950/20')}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-200 truncate">{loan.teacher?.full_name ?? 'Unknown'}</div>
        <div className="text-xs text-slate-500">{loan.items?.length ?? 0} device(s) · {loan.room?.name ?? 'No room'}</div>
      </div>
      <div className="text-right">
        <div className={cn('text-xs', overdue ? 'text-red-400' : 'text-slate-400')}>Due {formatDateTime(loan.expected_return_at)}</div>
        <span className={cn('badge mt-0.5', LOAN_STATUS_META[loan.status].bg, LOAN_STATUS_META[loan.status].color, 'border-transparent')}>
          {LOAN_STATUS_META[loan.status].label}
        </span>
      </div>
    </div>
  );
}

function PrintRow({ job }: { job: PrintRequest }) {
  const meta = PRINT_STATUS_META[job.status];
  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-800/50 hover:bg-slate-800/30">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-200 truncate">{job.file_name}</div>
        <div className="text-xs text-slate-500">{job.teacher?.full_name ?? 'Unknown'} · {job.filament_material} {job.filament_color}</div>
      </div>
      <div className="text-right">
        {job.status === 'printing' && (
          <div className="mb-1 h-1.5 w-20 rounded-full bg-slate-700 overflow-hidden">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${job.progress_pct}%` }} />
          </div>
        )}
        <span className={cn('badge', meta.bg, meta.color, 'border-transparent text-[10px]')}>{meta.label}</span>
      </div>
    </div>
  );
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-800/50 hover:bg-slate-800/30">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-200 truncate">{ticket.title}</div>
        <div className="text-xs text-slate-500">{ticket.ticket_number} · {ticket.category?.name ?? ticket.category_key} · {timeAgo(ticket.created_at)}</div>
      </div>
      <div className="flex items-center gap-1.5">
        {ticket.escalated && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
        <span className={cn('badge', TICKET_STATUS_META[ticket.status].bg, TICKET_STATUS_META[ticket.status].color, 'border-transparent text-[10px]')}>
          {TICKET_STATUS_META[ticket.status].label}
        </span>
      </div>
    </div>
  );
}

function UrgentItem({ icon: Icon, color, title, message, onClick }: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  title: string;
  message: string;
  onClick: () => void;
}) {
  const colorMap: Record<string, string> = {
    red: 'border-red-500/30 bg-red-950/20 text-red-300',
    amber: 'border-amber-500/30 bg-amber-950/20 text-amber-300',
    orange: 'border-orange-500/30 bg-orange-950/20 text-orange-300',
  };
  return (
    <button onClick={onClick} className={cn('flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-slate-800/30', colorMap[color])}>
      <Icon className="h-5 w-5 flex-shrink-0" />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs opacity-80">{message}</div>
      </div>
    </button>
  );
}
