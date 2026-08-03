import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Calendar, MapPin, Clock, Plus, X,
  CalendarOff, AlertTriangle, PartyPopper, Coffee, Ban,
} from 'lucide-react';
import { supabase } from '@/lib/database';
import { useAuth } from '@/lib/auth';
import { useLoans, useRequests, useRooms } from '@/lib/hooks';
import { cn, formatDateTime } from '@/lib/utils';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import type { Holiday, LendingPeriod } from '@/lib/types';

// ---------- Holiday helpers ----------

const HOLIDAY_TYPE_META: Record<Holiday['type'], { label: string; color: string; bg: string; border: string; icon: typeof CalendarOff }> = {
  vacation: { label: 'Ferien', color: 'text-purple-300', bg: 'bg-purple-500/15', border: 'border-purple-500/30', icon: PartyPopper },
  holiday: { label: 'Feiertag', color: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/30', icon: CalendarOff },
  closed: { label: 'Geschlossen', color: 'text-red-300', bg: 'bg-red-500/15', border: 'border-red-500/30', icon: Ban },
};

/**
 * Parse a holiday date string ("YYYY-MM-DD") into a local Date at midnight.
 * Using new Date("YYYY-MM-DD") would parse as UTC; we want local midnight so
 * the day comparison against calendar dates (also local) is correct.
 */
function holidayDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Does the given date fall inside any holiday range (inclusive)? */
function holidayForDate(date: Date, holidays: Holiday[]): Holiday | null {
  const t = date.getTime();
  for (const h of holidays) {
    const start = holidayDate(h.start_date).getTime();
    // end_date is inclusive: add one day so the end boundary is end-of-day
    const end = holidayDate(h.end_date).getTime() + 24 * 60 * 60 * 1000 - 1;
    if (t >= start && t <= end) return h;
  }
  return null;
}

/** Does any day in [start, end] (inclusive) fall inside a holiday range? */
function rangeOverlapsHoliday(start: Date, end: Date, holidays: Holiday[]): Holiday | null {
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const e = new Date(end); e.setHours(0, 0, 0, 0);
  for (let d = new Date(s); d.getTime() <= e.getTime(); d.setDate(d.getDate() + 1)) {
    const h = holidayForDate(d, holidays);
    if (h) return h;
  }
  return null;
}

// ---------- Date helpers for the range picker ----------

function toLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toLocalTimeInput(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function combineDateTime(datePart: string, timePart: string): Date {
  const [y, mo, da] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  return new Date(y, (mo ?? 1) - 1, da ?? 1, h ?? 0, mi ?? 0, 0, 0);
}

// ---------- Main component ----------

type CalendarEvent = {
  date: string;
  title: string;
  type: 'loan' | 'request';
  meta?: string;
  room?: string;
};

export function CalendarPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { data: loans, loading: loanLoading } = useLoans();
  const { data: requests, loading: reqLoading } = useRequests();
  const { data: rooms } = useRooms();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Holidays state
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayLoading, setHolidayLoading] = useState(true);

  // New-loan modal state (with Von-Bis range picker)
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [presetRoomId, setPresetRoomId] = useState<string | null>(null);

  const isStaff = profile?.role === 'admin' || profile?.role === 'staff';

  // Load holidays overlapping the current view's month (plus ±1 month buffer).
  const loadHolidays = useCallback(async (refDate: Date) => {
    setHolidayLoading(true);
    const start = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
    const end = new Date(refDate.getFullYear(), refDate.getMonth() + 2, 0);
    const { data, error } = await supabase
      .from('holidays')
      .select('id, name, start_date, end_date, type, created_at')
      .or(`and(start_date.lte.${toLocalDateInput(end)},end_date.gte.${toLocalDateInput(start)})`)
      .order('start_date', { ascending: true });
    if (error) {
      toast('Ferien konnten nicht geladen werden: ' + error.message, 'error');
      setHolidays([]);
    } else {
      setHolidays((data ?? []) as Holiday[]);
    }
    setHolidayLoading(false);
  }, [toast]);

  useEffect(() => {
    loadHolidays(currentDate);
  }, [loadHolidays, currentDate]);

  const allEvents = useMemo<CalendarEvent[]>(() => {
    const events: CalendarEvent[] = [];
    (loans ?? []).forEach((l) => {
      events.push({ date: l.checkout_at, title: `Ausleihe: ${l.teacher?.full_name ?? 'Unbekannt'}`, type: 'loan', room: l.room?.name });
      events.push({ date: l.expected_return_at, title: `Rückgabe fällig: ${l.teacher?.full_name ?? 'Unbekannt'}`, type: 'loan', room: l.room?.name });
    });
    (requests ?? []).forEach((r) => {
      if (r.pickup_at) events.push({ date: r.pickup_at, title: `Abholung: ${r.teacher?.full_name ?? 'Unbekannt'}`, type: 'request', room: r.room?.name });
      if (r.return_at) events.push({ date: r.return_at, title: `Rückgabe: ${r.teacher?.full_name ?? 'Unbekannt'}`, type: 'request', room: r.room?.name });
    });
    return events;
  }, [loans, requests]);

  if (loanLoading || reqLoading) return <LoadingScreen message="Kalender wird geladen..." />;

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

  const eventsForDay = (date: Date) =>
    allEvents.filter((e) => {
      const ed = new Date(e.date);
      return ed.getDate() === date.getDate() && ed.getMonth() === date.getMonth() && ed.getFullYear() === date.getFullYear();
    });

  const weekStart = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [currentDate]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [weekStart],
  );

  const prev = () => {
    if (view === 'week') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
    else setCurrentDate(new Date(year, month - 1, 1));
  };
  const next = () => {
    if (view === 'week') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));
    else setCurrentDate(new Date(year, month + 1, 1));
  };
  const today = () => setCurrentDate(new Date());

  const headerLabel = view === 'week'
    ? `${weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const days = view === 'week' ? weekDays : monthDays;

  const selectedDateObj = selectedDate ? new Date(selectedDate) : null;
  const selectedEvents = selectedDateObj ? eventsForDay(selectedDateObj) : [];
  const selectedHoliday = selectedDateObj ? holidayForDate(selectedDateObj, holidays) : null;

  const openNewLoan = (roomId?: string | null) => {
    if (!isStaff) {
      toast('Nur Personal kann Ausleihen erstellen', 'error');
      return;
    }
    setPresetRoomId(roomId ?? null);
    setLoanModalOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Verfügbarkeitskalender"
        subtitle="Echtzeit-Überblick über Ausleihen, Reservierungen und Ferien"
        actions={
          <div className="flex gap-2">
            <div className="flex gap-1 rounded-lg bg-slate-800/50 p-1">
              <button onClick={() => setView('month')} className={cn('rounded-md px-3 py-1 text-xs', view === 'month' ? 'bg-slate-700 text-slate-100' : 'text-slate-400')}>Monat</button>
              <button onClick={() => setView('week')} className={cn('rounded-md px-3 py-1 text-xs', view === 'week' ? 'bg-slate-700 text-slate-100' : 'text-slate-400')}>Woche</button>
            </div>
            {isStaff && (
              <button onClick={() => openNewLoan()} className="btn-primary text-xs">
                <Plus className="h-4 w-4" /> Neue Ausleihe
              </button>
            )}
            <button onClick={today} className="btn-secondary text-xs">Heute</button>
          </div>
        }
      />

      {/* Active holidays banner */}
      {!holidayLoading && holidays.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 p-3 text-xs">
          <span className="font-medium text-slate-300">Aktuelle Ferien &amp; Feiertage:</span>
          {holidays.slice(0, 4).map((h) => {
            const meta = HOLIDAY_TYPE_META[h.type];
            return (
              <span key={h.id} className={cn('badge', meta.bg, meta.border, meta.color)}>
                <meta.icon className="h-3 w-3" /> {h.name} ({formatShortRange(h)})
              </span>
            );
          })}
          {holidays.length > 4 && <span className="text-slate-500">+{holidays.length - 4} weitere</span>}
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-100">{headerLabel}</h3>
          <div className="flex gap-2">
            <button onClick={prev} className="btn-icon"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={next} className="btn-icon"><ChevronRight className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>
          ))}
          {days.map((date, i) => {
            if (!date) return <div key={i} />;
            const events = eventsForDay(date);
            const isToday = date.toDateString() === new Date().toDateString();
            const isSelected = selectedDate === date.toISOString();
            const holiday = holidayForDate(date, holidays);
            const holidayMeta = holiday ? HOLIDAY_TYPE_META[holiday.type] : null;
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(date.toISOString())}
                className={cn(
                  'min-h-[80px] rounded-lg border p-2 text-left transition-colors',
                  holiday
                    ? cn(holidayMeta!.bg, holidayMeta!.border)
                    : isToday ? 'border-blue-500 bg-blue-600/10' : 'border-slate-800 hover:bg-slate-800/30',
                  isSelected && 'ring-1 ring-blue-500',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className={cn('text-xs font-medium', holiday ? holidayMeta!.color : isToday ? 'text-blue-400' : 'text-slate-400')}>
                    {date.getDate()}
                  </div>
                  {holiday && (() => { const HolidayIcon = holidayMeta!.icon; return <HolidayIcon className={cn('h-3.5 w-3.5', holidayMeta!.color)} />; })()}
                </div>
                {holiday ? (
                  <div className={cn('mt-1 rounded px-1 py-0.5 text-[10px] truncate', holidayMeta!.bg, holidayMeta!.color)} title={`${holiday.name} — Ausleihe blockiert`}>
                    {holiday.name}
                  </div>
                ) : (
                  <div className="mt-1 space-y-0.5">
                    {events.slice(0, 3).map((e, j) => (
                      <div key={j} className={cn('rounded px-1 py-0.5 text-[10px] truncate', e.type === 'loan' ? 'bg-blue-500/15 text-blue-300' : 'bg-amber-500/15 text-amber-300')}>
                        {e.title}
                      </div>
                    ))}
                    {events.length > 3 && <div className="text-[10px] text-slate-500">+{events.length - 3} weitere</div>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">
            Termine am {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>

          {selectedHoliday && (
            <div className={cn('mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', HOLIDAY_TYPE_META[selectedHoliday.type].border, HOLIDAY_TYPE_META[selectedHoliday.type].bg, HOLIDAY_TYPE_META[selectedHoliday.type].color)}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">{selectedHoliday.name} — {HOLIDAY_TYPE_META[selectedHoliday.type].label}</div>
                <div className="text-xs opacity-90">Die Ausleihe ist während Ferien/Feiertagen blockiert.</div>
              </div>
            </div>
          )}

          {selectedEvents.length === 0 && !selectedHoliday ? (
            <EmptyState icon={Calendar} title="Keine Termine" message="Keine Ausleihen oder Reservierungen an diesem Tag" />
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

          {isStaff && !selectedHoliday && (
            <div className="mt-3 flex justify-end">
              <button onClick={() => openNewLoan(presetRoomId)} className="btn-primary text-xs">
                <Plus className="h-4 w-4" /> Ausleihe für diesen Tag
              </button>
            </div>
          )}
        </div>
      )}

      {/* Room availability overview */}
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Raum-Verfügbarkeit heute</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(rooms ?? []).map((room) => {
            const todayLoans = (loans ?? []).filter((l) => l.room_id === room.id && l.status === 'active');
            return (
              <div key={room.id} className="rounded-lg border border-slate-800 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-200">{room.name}</span>
                  <span className={cn('badge', todayLoans.length > 0 ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300')}>
                    {todayLoans.length > 0 ? `${todayLoans.length} aktiv` : 'Frei'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{room.room_number} · {room.room_type}</div>
                {isStaff && (
                  <button onClick={() => openNewLoan(room.id)} className="mt-2 text-xs text-blue-400 hover:text-blue-300">
                    <Plus className="inline h-3 w-3" /> Ausleihe erstellen
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {loanModalOpen && (
        <NewLoanModal
          open={loanModalOpen}
          onClose={() => setLoanModalOpen(false)}
          roomId={presetRoomId}
          rooms={rooms ?? []}
          holidays={holidays}
          defaultDate={selectedDateObj ?? new Date()}
          onSaved={() => {
            setLoanModalOpen(false);
            toast('Ausleihe erstellt', 'success');
          }}
        />
      )}
    </div>
  );
}

function formatShortRange(h: Holiday): string {
  const s = holidayDate(h.start_date);
  const e = holidayDate(h.end_date);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
  return s.toDateString() === e.toDateString() ? fmt(s) : `${fmt(s)}–${fmt(e)}`;
}

// ---------- New loan modal with Von-Bis range picker ----------

interface NewLoanModalProps {
  open: boolean;
  onClose: () => void;
  roomId: string | null;
  rooms: { id: string; name: string; room_number: string; room_type: string }[];
  holidays: Holiday[];
  defaultDate: Date;
  onSaved: () => void;
}

function NewLoanModal({ open, onClose, roomId, rooms, holidays, defaultDate, onSaved }: NewLoanModalProps) {
  const { profile } = useAuth();
  const toast = useToast();
  const [periods, setPeriods] = useState<LendingPeriod[]>([]);

  // Range picker state: Von (from) and Bis (to) — date + time parts.
  const start = useMemo(() => {
    const d = new Date(defaultDate);
    d.setSeconds(0, 0);
    return d;
  }, [defaultDate]);

  const [fromDate, setFromDate] = useState(toLocalDateInput(start));
  const [fromTime, setFromTime] = useState(toLocalTimeInput(start));
  // Default "Bis": start + 1 hour
  const [toDate, setToDate] = useState(toLocalDateInput(new Date(start.getTime() + 60 * 60 * 1000)));
  const [toTime, setToTime] = useState(toLocalTimeInput(new Date(start.getTime() + 60 * 60 * 1000)));

  const [selectedRoomId, setSelectedRoomId] = useState<string>(roomId ?? '');
  const [periodId, setPeriodId] = useState<string>('');
  const [signatureName, setSignatureName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from('lending_periods').select('*').order('sort_order').then(({ data, error }: any) => {
      if (error) toast('Zeiträume konnten nicht geladen werden', 'error');
      else setPeriods((data ?? []) as LendingPeriod[]);
    });
  }, [open, toast]);

  // Reset fields whenever the modal (re)opens.
  useEffect(() => {
    if (!open) return;
    const s = new Date(defaultDate);
    s.setSeconds(0, 0);
    const e = new Date(s.getTime() + 60 * 60 * 1000);
    setFromDate(toLocalDateInput(s));
    setFromTime(toLocalTimeInput(s));
    setToDate(toLocalDateInput(e));
    setToTime(toLocalTimeInput(e));
    setSelectedRoomId(roomId ?? '');
    setPeriodId('');
    setSignatureName('');
  }, [open, defaultDate, roomId]);

  const fromDateTime = useMemo(() => combineDateTime(fromDate, fromTime), [fromDate, fromTime]);
  const toDateTime = useMemo(() => combineDateTime(toDate, toTime), [toDate, toTime]);

  // Validation against holidays / vacation / closed days.
  const blockingHoliday = useMemo(
    () => rangeOverlapsHoliday(fromDateTime, toDateTime, holidays),
    [fromDateTime, toDateTime, holidays],
  );

  const durationError = useMemo(() => {
    if (isNaN(fromDateTime.getTime()) || isNaN(toDateTime.getTime())) return 'Ungültiges Datum oder Uhrzeit.';
    if (toDateTime.getTime() <= fromDateTime.getTime()) return 'Der Bis-Zeitpunkt muss nach dem Von-Zeitpunkt liegen.';
    return null;
  }, [fromDateTime, toDateTime]);

  const canSubmit = !blockingHoliday && !durationError && !!signatureName.trim() && !!profile?.id && !submitting;

  // Quick presets for the Von-Bis picker.
  const applyPreset = (minutes: number) => {
    const base = new Date(fromDateTime);
    if (isNaN(base.getTime())) return;
    const end = new Date(base.getTime() + minutes * 60_000);
    setToDate(toLocalDateInput(end));
    setToTime(toLocalTimeInput(end));
  };

  const submit = async () => {
    if (!profile?.id) { toast('Nicht angemeldet', 'error'); return; }
    if (blockingHoliday) { toast('Ausleihe während Ferien/Feiertagen blockiert', 'error'); return; }
    if (durationError) { toast(durationError, 'error'); return; }
    if (!signatureName.trim()) { toast('Unterschriftsname ist erforderlich', 'error'); return; }

    setSubmitting(true);
    const { data: loan, error } = await supabase.from('lending_loans').insert({
      teacher_id: profile.id,
      staff_id: profile.id,
      room_id: selectedRoomId || null,
      period_id: periodId || null,
      checkout_at: fromDateTime.toISOString(),
      expected_return_at: toDateTime.toISOString(),
      status: 'active',
      signature_name: signatureName.trim(),
    }).select().single();

    if (error) {
      toast(error.message, 'error');
      setSubmitting(false);
      return;
    }

    await supabase.from('activity_logs').insert({
      action: 'loan.create',
      entity_type: 'loan',
      entity_id: loan.id,
      details: { from: fromDateTime.toISOString(), to: toDateTime.toISOString() },
    });

    setSubmitting(false);
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Neue Ausleihe — Von / Bis"
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Wird erstellt…' : 'Ausleihe erstellen'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Von-Bis range picker */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-200">Zeitraum (Von – Bis)</h4>
            <div className="flex gap-1">
              <button type="button" onClick={() => applyPreset(45)} className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700">45 Min</button>
              <button type="button" onClick={() => applyPreset(90)} className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700">90 Min</button>
              <button type="button" onClick={() => applyPreset(180)} className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700">3 Std</button>
              <button type="button" onClick={() => applyPreset(480)} className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700">Ganzer Tag</button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Von (from) */}
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                <Clock className="h-3.5 w-3.5" /> Von
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label text-[11px]">Datum</label>
                  <input type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div>
                  <label className="label text-[11px]">Uhrzeit</label>
                  <input type="time" className="input" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Bis (to) */}
            <div className="rounded-lg border border-slate-800 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                <Clock className="h-3.5 w-3.5" /> Bis
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label text-[11px]">Datum</label>
                  <input type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} min={fromDate} />
                </div>
                <div>
                  <label className="label text-[11px]">Uhrzeit</label>
                  <input type="time" className="input" value={toTime} onChange={(e) => setToTime(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Summary + validation */}
          <div className="mt-3 rounded-lg bg-slate-800/40 px-3 py-2 text-xs text-slate-400">
            <span className="text-slate-300">Dauer:</span>{' '}
            {durationError ? (
              <span className="text-red-400">{durationError}</span>
            ) : (
              <span className="text-slate-200">
                {formatDateTime(fromDateTime)} – {formatDateTime(toDateTime)}{' '}
                ({Math.round((toDateTime.getTime() - fromDateTime.getTime()) / 60_000)} Min)
              </span>
            )}
          </div>

          {/* Holiday blocking warning */}
          {blockingHoliday && (
            <div className={cn('mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', HOLIDAY_TYPE_META[blockingHoliday.type].border, HOLIDAY_TYPE_META[blockingHoliday.type].bg, HOLIDAY_TYPE_META[blockingHoliday.type].color)}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Ausleihe blockiert: {blockingHoliday.name}</div>
                <div className="text-xs opacity-90">
                  Der gewählte Zeitraum überschneidet sich mit {HOLIDAY_TYPE_META[blockingHoliday.type].label.toLowerCase()} ({formatShortRange(blockingHoliday)}).
                  Während Ferien/Feiertagen ist die Ausleihe nicht möglich.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Room + period + signature name */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Raum</label>
            <select className="input" value={selectedRoomId} onChange={(e) => setSelectedRoomId(e.target.value)}>
              <option value="">— kein Raum —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.room_number})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Zeitraum-Vorlage</label>
            <select className="input" value={periodId} onChange={(e) => {
              setPeriodId(e.target.value);
              const p = periods.find((x) => x.id === e.target.value);
              if (p) applyPreset(p.duration_minutes);
            }}>
              <option value="">— benutzerdefiniert —</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.duration_minutes} Min)</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Unterschriftsname</label>
          <input className="input" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Vollständiger Name" />
        </div>
      </div>
    </Modal>
  );
}
