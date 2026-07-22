import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar, MapPin, Clock } from 'lucide-react';
import { useLoans, useRequests, useRooms } from '@/lib/hooks';
import { cn, formatDateTime } from '@/lib/utils';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';

export function CalendarPage() {
  const { data: loans, loading: loanLoading } = useLoans();
  const { data: requests, loading: reqLoading } = useRequests();
  const { data: rooms } = useRooms();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const allEvents = useMemo(() => {
    const events: { date: string; title: string; type: 'loan' | 'request'; meta?: string; room?: string }[] = [];
    (loans ?? []).forEach((l) => {
      events.push({ date: l.checkout_at, title: `Loan: ${l.teacher?.full_name ?? 'Unknown'}`, type: 'loan', room: l.room?.name });
      events.push({ date: l.expected_return_at, title: `Return due: ${l.teacher?.full_name ?? 'Unknown'}`, type: 'loan', room: l.room?.name });
    });
    (requests ?? []).forEach((r) => {
      if (r.pickup_at) events.push({ date: r.pickup_at, title: `Pickup: ${r.teacher?.full_name ?? 'Unknown'}`, type: 'request', room: r.room?.name });
      if (r.return_at) events.push({ date: r.return_at, title: `Return: ${r.teacher?.full_name ?? 'Unknown'}`, type: 'request', room: r.room?.name });
    });
    return events;
  }, [loans, requests]);

  if (loanLoading || reqLoading) return <LoadingScreen message="Loading calendar..." />;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay();

  const monthDays = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - startWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    return new Date(year, month, dayNum);
  });

  const eventsForDay = (date: Date) => {
    return allEvents.filter((e) => {
      const ed = new Date(e.date);
      return ed.getDate() === date.getDate() && ed.getMonth() === date.getMonth() && ed.getFullYear() === date.getFullYear();
    });
  };

  const prev = () => setCurrentDate(new Date(year, month - 1, 1));
  const next = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

  const selectedEvents = selectedDate ? eventsForDay(new Date(selectedDate)) : [];

  return (
    <div className="space-y-5">
      <PageHeader title="Availability Calendar" subtitle="Real-time overview of loans and reservations" actions={
        <div className="flex gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-800/50 p-1">
            <button onClick={() => setView('month')} className={cn('rounded-md px-3 py-1 text-xs', view === 'month' ? 'bg-slate-700 text-slate-100' : 'text-slate-400')}>Month</button>
            <button onClick={() => setView('week')} className={cn('rounded-md px-3 py-1 text-xs', view === 'week' ? 'bg-slate-700 text-slate-100' : 'text-slate-400')}>Week</button>
          </div>
          <button onClick={today} className="btn-secondary text-xs">Today</button>
        </div>
      } />

      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-100">
            {currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </h3>
          <div className="flex gap-2">
            <button onClick={prev} className="btn-icon"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={next} className="btn-icon"><ChevronRight className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>
          ))}
          {monthDays.map((date, i) => {
            if (!date) return <div key={i} />;
            const events = eventsForDay(date);
            const isToday = date.toDateString() === new Date().toDateString();
            const isSelected = selectedDate === date.toISOString();
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(date.toISOString())}
                className={cn(
                  'min-h-[80px] rounded-lg border p-2 text-left transition-colors',
                  isToday ? 'border-blue-500 bg-blue-600/10' : 'border-slate-800 hover:bg-slate-800/30',
                  isSelected && 'ring-1 ring-blue-500',
                )}
              >
                <div className={cn('text-xs font-medium', isToday ? 'text-blue-400' : 'text-slate-400')}>{date.getDate()}</div>
                <div className="mt-1 space-y-0.5">
                  {events.slice(0, 3).map((e, j) => (
                    <div key={j} className={cn('rounded px-1 py-0.5 text-[10px] truncate', e.type === 'loan' ? 'bg-blue-500/15 text-blue-300' : 'bg-amber-500/15 text-amber-300')}>
                      {e.title}
                    </div>
                  ))}
                  {events.length > 3 && <div className="text-[10px] text-slate-500">+{events.length - 3} more</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">
            Events on {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          {selectedEvents.length === 0 ? (
            <EmptyState icon={Calendar} title="No events" message="No loans or reservations scheduled for this day" />
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((e, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className={cn('rounded-lg p-2', e.type === 'loan' ? 'bg-blue-500/15' : 'bg-amber-500/15')}>
                      {e.type === 'loan' ? <Clock className="h-4 w-4 text-blue-400" /> : <Calendar className="h-4 w-4 text-amber-400" />}
                    </div>
                    <div>
                      <div className="text-sm text-slate-200">{e.title}</div>
                      <div className="text-xs text-slate-500">{formatDateTime(e.date)}{e.room && <> · <MapPin className="inline h-3 w-3" /> {e.room}</>}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Room availability overview */}
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Room Availability Today</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(rooms ?? []).map((room) => {
            const todayLoans = (loans ?? []).filter((l) => l.room_id === room.id && l.status === 'active');
            return (
              <div key={room.id} className="rounded-lg border border-slate-800 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-200">{room.name}</span>
                  <span className={cn('badge', todayLoans.length > 0 ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300')}>
                    {todayLoans.length > 0 ? `${todayLoans.length} active` : 'Free'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{room.room_number} · {room.room_type}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
