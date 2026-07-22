import { useState, useEffect } from 'react';
import {
  Mic2, Plus, Calendar, CheckSquare, Square, Trash2, Edit,
  MapPin, Clock, Package, User,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRooms } from '@/lib/hooks';
import { EVENT_STATUS_META } from '@/lib/constants';
import { cn, formatDateTime, formatDate, logActivity } from '@/lib/utils';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import type { SchoolEvent, EventTask, Room, Profile, EventStatus } from '@/lib/types';

export function EventsPage() {
  const { data: rooms } = useRooms();
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SchoolEvent | null>(null);
  const [selected, setSelected] = useState<SchoolEvent | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('events').select('*, room:rooms(*), organizer:profiles(*), tasks:event_tasks(*)').order('start_at', { ascending: true });
    setEvents((data ?? []) as SchoolEvent[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingScreen message="Loading events..." />;

  const upcoming = events.filter((e) => new Date(e.start_at) >= new Date());
  const past = events.filter((e) => new Date(e.start_at) < new Date());

  return (
    <div className="space-y-5">
      <PageHeader title="Events & Auditorium Planning" subtitle="Plan events, manage technical prep, and coordinate teams" actions={
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary"><Plus className="h-4 w-4" /> New Event</button>
      } />

      {upcoming.length === 0 ? (
        <div className="card"><EmptyState icon={Mic2} title="No upcoming events" message="Create a new event to start planning" /></div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">Upcoming Events</h3>
          {upcoming.map((event) => <EventCard key={event.id} event={event} onClick={() => setSelected(event)} onEdit={() => { setEditing(event); setShowForm(true); }} />)}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-400">Past Events</h3>
          {past.map((event) => <EventCard key={event.id} event={event} onClick={() => setSelected(event)} />)}
        </div>
      )}

      {showForm && <EventFormModal event={editing} rooms={rooms ?? []} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); load(); }} />}
      {selected && <EventDetailModal event={selected} onClose={() => setSelected(null)} onUpdated={load} />}
    </div>
  );
}

function EventCard({ event, onClick, onEdit }: { event: SchoolEvent; onClick: () => void; onEdit?: () => void }) {
  return (
    <div className="card card-hover p-4">
      <div className="flex items-start justify-between gap-4">
        <button onClick={onClick} className="flex-1 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-200">{event.title}</span>
            <span className={cn('badge', EVENT_STATUS_META[event.status].bg, EVENT_STATUS_META[event.status].color)}>{EVENT_STATUS_META[event.status].label}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
            <span><Calendar className="inline h-3 w-3" /> {formatDate(event.start_at)}</span>
            <span><Clock className="inline h-3 w-3" /> {formatDateTime(event.start_at)}</span>
            {event.room && <span><MapPin className="inline h-3 w-3" /> {event.room.name}</span>}
          </div>
          {event.description && <p className="mt-1 text-xs text-slate-400 line-clamp-1">{event.description}</p>}
          {event.tasks && event.tasks.length > 0 && (
            <div className="mt-2 text-xs text-slate-500">
              {event.tasks.filter((t) => t.is_completed).length}/{event.tasks.length} tasks completed
            </div>
          )}
        </button>
        {onEdit && <button onClick={onEdit} className="btn-icon"><Edit className="h-4 w-4" /></button>}
      </div>
    </div>
  );
}

function EventFormModal({ event, rooms, onClose, onSaved }: { event: SchoolEvent | null; rooms: Room[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [eventType, setEventType] = useState(event?.event_type ?? 'auditorium');
  const [roomId, setRoomId] = useState(event?.room_id ?? '');
  const [startAt, setStartAt] = useState(event?.start_at?.slice(0, 16) ?? new Date().toISOString().slice(0, 16));
  const [endAt, setEndAt] = useState(event?.end_at?.slice(0, 16) ?? new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  const [notes, setNotes] = useState(event?.notes ?? '');
  const toast = useToast();

  const save = async () => {
    if (!title) { toast('Title is required', 'error'); return; }
    const { data: profileData } = await supabase.auth.getUser();
    const data: Record<string, unknown> = {
      title, description: description || null, event_type: eventType,
      room_id: roomId || null, start_at: startAt, end_at: endAt, notes: notes || null,
    };
    if (event) {
      const { error } = await supabase.from('events').update(data).eq('id', event.id);
      if (error) { toast(error.message, 'error'); return; }
    } else {
      data.organizer_id = profileData.user?.id;
      const { error } = await supabase.from('events').insert(data);
      if (error) { toast(error.message, 'error'); return; }
    }
    await logActivity('event.save', 'event', event?.id);
    toast('Event saved', 'success');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={event ? 'Edit Event' : 'New Event'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
      <div className="space-y-4">
        <div><label className="label">Title *</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Winter Concert" /></div>
        <div><label className="label">Description</label><textarea className="input min-h-[60px]" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Event Type</label>
            <select className="select" value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="auditorium">Auditorium</option><option value="concert">Concert</option>
              <option value="presentation">Presentation</option><option value="ceremony">Ceremony</option>
              <option value="meeting">Meeting</option><option value="other">Other</option>
            </select>
          </div>
          <div><label className="label">Room / Venue</label>
            <select className="select" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Select venue...</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.room_number})</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Start</label><input type="datetime-local" className="input" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></div>
          <div><label className="label">End</label><input type="datetime-local" className="input" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></div>
        </div>
        <div><label className="label">Notes</label><textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

function EventDetailModal({ event, onClose, onUpdated }: { event: SchoolEvent; onClose: () => void; onUpdated: () => void }) {
  const [tasks, setTasks] = useState<EventTask[]>(event.tasks ?? []);
  const [newTask, setNewTask] = useState('');
  const [status, setStatus] = useState<EventStatus>(event.status);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignedTo, setAssignedTo] = useState('');
  const toast = useToast();

  useEffect(() => {
    supabase.from('profiles').select('*').order('full_name').then(({ data }) => setProfiles((data ?? []) as Profile[]));
  }, []);

  const addTask = async () => {
    if (!newTask.trim()) return;
    const { data, error } = await supabase.from('event_tasks').insert({
      event_id: event.id, title: newTask, assigned_to: assignedTo || null, sort_order: tasks.length,
    }).select('*, assignee:profiles(*)').single();
    if (error) { toast(error.message, 'error'); return; }
    setTasks([...tasks, data as EventTask]);
    setNewTask('');
    setAssignedTo('');
  };

  const toggleTask = async (task: EventTask) => {
    const { data: profileData } = await supabase.auth.getUser();
    const updates = { is_completed: !task.is_completed, completed_at: !task.is_completed ? new Date().toISOString() : null, completed_by: !task.is_completed ? (profileData.user?.id ?? null) : null };
    const { error } = await supabase.from('event_tasks').update(updates).eq('id', task.id);
    if (error) { toast(error.message, 'error'); return; }
    setTasks(tasks.map((t) => t.id === task.id ? { ...t, ...updates } as EventTask : t));
  };

  const deleteTask = async (taskId: string) => {
    await supabase.from('event_tasks').delete().eq('id', taskId);
    setTasks(tasks.filter((t) => t.id !== taskId));
  };

  const updateStatus = async (newStatus: EventStatus) => {
    const { error } = await supabase.from('events').update({ status: newStatus }).eq('id', event.id);
    if (error) { toast(error.message, 'error'); return; }
    setStatus(newStatus);
    onUpdated();
  };

  const completedTasks = tasks.filter((t) => t.is_completed).length;

  return (
    <Modal open onClose={onClose} title={event.title} size="xl"
      footer={
        <>
          <select className="select w-auto" value={status} onChange={(e) => updateStatus(e.target.value as EventStatus)}>
            {(Object.keys(EVENT_STATUS_META) as EventStatus[]).map((s) => <option key={s} value={s}>{EVENT_STATUS_META[s].label}</option>)}
          </select>
        </>
      }>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-3"><div className="text-xs text-slate-500">Start</div><div className="text-sm text-slate-200">{formatDateTime(event.start_at)}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">End</div><div className="text-sm text-slate-200">{formatDateTime(event.end_at)}</div></div>
        </div>

        {event.description && <div className="card p-3"><div className="text-xs text-slate-500">Description</div><p className="mt-1 text-sm text-slate-300">{event.description}</p></div>}
        {event.room && <div className="card p-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" /><span className="text-sm text-slate-300">{event.room.name}</span></div>}

        {/* Task management */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-200">Technical Preparation Tasks</h4>
            <span className="badge bg-blue-500/15 border-blue-500/30 text-blue-300">{completedTasks}/{tasks.length} done</span>
          </div>

          {tasks.length > 0 && (
            <div className="space-y-2 mb-3">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 rounded-lg border border-slate-800 p-2.5">
                  <button onClick={() => toggleTask(task)} className={cn('flex-shrink-0', task.is_completed ? 'text-emerald-400' : 'text-slate-500')}>
                    {task.is_completed ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                  </button>
                  <div className="flex-1">
                    <div className={cn('text-sm', task.is_completed ? 'text-slate-500 line-through' : 'text-slate-200')}>{task.title}</div>
                    {task.assignee && <div className="text-xs text-slate-500"><User className="inline h-3 w-3" /> {task.assignee.full_name}</div>}
                  </div>
                  <button onClick={() => deleteTask(task.id)} className="btn-icon text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex gap-2">
              <input className="input" value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} placeholder="Add task..." />
              <select className="select w-auto" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
              <button onClick={addTask} className="btn-primary"><Plus className="h-4 w-4" /></button>
            </div>
          </div>
        </div>

        {/* Equipment plan */}
        {event.equipment_plan && event.equipment_plan.length > 0 && (
          <div className="card p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200"><Package className="h-4 w-4" /> Equipment Plan</h4>
            <div className="space-y-1">
              {event.equipment_plan.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{item.name} ×{item.qty}</span>
                  <span className={cn('badge', item.status === 'done' ? 'bg-emerald-500/15 text-emerald-300' : item.status === 'ready' ? 'bg-blue-500/15 text-blue-300' : 'bg-slate-700/50 text-slate-400', 'border-transparent capitalize')}>{item.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rehearsal schedule */}
        {event.rehearsal_schedule && event.rehearsal_schedule.length > 0 && (
          <div className="card p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200"><Mic2 className="h-4 w-4" /> Rehearsal Schedule</h4>
            <div className="space-y-1">
              {event.rehearsal_schedule.map((slot) => (
                <div key={slot.id} className="flex items-center gap-3 text-xs">
                  <Clock className="h-3 w-3 text-slate-400" />
                  <span className="text-slate-300">{slot.title}</span>
                  <span className="text-slate-500">{formatDateTime(slot.start)} - {formatDateTime(slot.end)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
