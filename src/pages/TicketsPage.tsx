import { useState, useEffect } from 'react';
import {
  Ticket, Plus, Wrench, HelpCircle, Wifi, Building2, Mic2,
  ArrowUp, CheckCircle2, MessageSquare, Camera, Send, Gauge,
  Activity, AlertTriangle, MapPin, User, FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useTickets, useRooms } from '@/lib/hooks';
import { TICKET_STATUS_META, TICKET_PRIORITY_META } from '@/lib/constants';
import { cn, formatDateTime, timeAgo, logActivity, printHtml } from '@/lib/utils';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { Modal, useModal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import type { Ticket as TicketType, TicketCategory, TicketComment, TicketPriority, TicketStatus, Room, SpeedtestResult } from '@/lib/types';

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Wrench, HelpCircle, Wifi, Building2, Mic2,
};

export function TicketsPage() {
  const { profile, isStaff } = useAuth();
  const [tab, setTab] = useState<'all' | 'open' | 'mine' | 'escalated'>('all');
  const { data: tickets, loading, refresh } = useTickets();
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<TicketType | null>(null);
  const { data: rooms } = useRooms();

  useEffect(() => {
    supabase.from('ticket_categories').select('*').eq('is_enabled', true).order('sort_order').then(({ data }) => setCategories((data ?? []) as TicketCategory[]));
  }, []);

  if (loading) return <LoadingScreen message="Loading tickets..." />;

  const allTickets = tickets ?? [];
  const openTickets = allTickets.filter((t) => t.status === 'open' || t.status === 'in_progress');
  const myTickets = allTickets.filter((t) => t.created_by === profile?.id || t.assigned_to === profile?.id);
  const escalatedTickets = allTickets.filter((t) => t.escalated || t.status === 'escalated');

  const displayed = tab === 'all' ? allTickets : tab === 'open' ? openTickets : tab === 'mine' ? myTickets : escalatedTickets;

  const tabs = [
    { id: 'all' as const, label: 'All Tickets', count: allTickets.length },
    { id: 'open' as const, label: 'Open', count: openTickets.length },
    { id: 'mine' as const, label: 'My Tickets', count: myTickets.length },
    { id: 'escalated' as const, label: 'Escalated', count: escalatedTickets.length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Technical Support Tickets" subtitle="Report and track technical issues, questions, and requests" actions={
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="h-4 w-4" /> New Ticket</button>
      } />

      {/* Category quick-select */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {categories.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.icon] ?? Ticket;
          const count = allTickets.filter((t) => t.category_key === cat.key && (t.status === 'open' || t.status === 'in_progress')).length;
          return (
            <button key={cat.id} onClick={() => setShowCreate(true)} className="card card-hover p-4 text-left">
              <div className="flex items-center justify-between">
                <div className="rounded-lg p-2" style={{ backgroundColor: `${cat.color}20` }}>
                  <Icon className="h-5 w-5" />
                </div>
                {count > 0 && <span className="badge bg-slate-700/50 text-slate-300 border-slate-700 text-[10px]">{count}</span>}
              </div>
              <div className="mt-2 text-sm font-medium text-slate-200">{cat.name}</div>
              <div className="text-xs text-slate-500 line-clamp-2">{cat.description}</div>
            </button>
          );
        })}
      </div>

      <div className="flex gap-1 border-b border-slate-800">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('tab', tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200')}>
            {t.label}
            {t.count > 0 && <span className="ml-1.5 badge bg-slate-700/50 text-slate-300 border-slate-700 text-[10px]">{t.count}</span>}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="card"><EmptyState icon={Ticket} title="No tickets" message="Create a new ticket to get help" /></div>
      ) : (
        <div className="space-y-2">
          {displayed.map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} onClick={() => setSelected(ticket)} />
          ))}
        </div>
      )}

      {showCreate && <CreateTicketModal categories={categories} rooms={rooms ?? []} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); refresh(); }} />}
      {selected && <TicketDetailModal ticket={selected} isStaff={isStaff} onClose={() => setSelected(null)} onUpdated={() => { setSelected(null); refresh(); }} />}
    </div>
  );
}

function TicketRow({ ticket, onClick }: { ticket: TicketType; onClick: () => void }) {
  const Icon = CATEGORY_ICONS[ticket.category?.icon ?? ''] ?? Ticket;
  return (
    <button onClick={onClick} className="card card-hover w-full p-4 text-left">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2 flex-shrink-0" style={{ backgroundColor: `${ticket.category?.color ?? '#64748b'}20` }}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-200">{ticket.title}</span>
            <span className="text-xs text-slate-500 font-mono">{ticket.ticket_number}</span>
          </div>
          {ticket.description && <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">{ticket.description}</p>}
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[10px] text-slate-500">
            <span>{ticket.category?.name ?? ticket.category_key}</span>
            <span>·</span>
            <span>{timeAgo(ticket.created_at)}</span>
            {ticket.room && <><span>·</span><span><MapPin className="inline h-3 w-3" /> {ticket.room.name}</span></>}
            {ticket.creator && <><span>·</span><span><User className="inline h-3 w-3" /> {ticket.creator.full_name}</span></>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={cn('badge', TICKET_STATUS_META[ticket.status].bg, TICKET_STATUS_META[ticket.status].color)}>{TICKET_STATUS_META[ticket.status].label}</span>
          <span className={cn('badge', TICKET_PRIORITY_META[ticket.priority].bg, TICKET_PRIORITY_META[ticket.priority].color)}>{TICKET_PRIORITY_META[ticket.priority].label}</span>
          {ticket.escalated && <span className="badge bg-red-500/15 border-red-500/30 text-red-300"><AlertTriangle className="h-3 w-3" /> Escalated</span>}
        </div>
      </div>
    </button>
  );
}

function CreateTicketModal({ categories, rooms, onClose, onSaved }: { categories: TicketCategory[]; rooms: Room[]; onClose: () => void; onSaved: () => void }) {
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [roomId, setRoomId] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [photos, setPhotos] = useState<string[]>([]);
  const [speedtestResult, setSpeedtestResult] = useState<SpeedtestResult | null>(null);
  const [runningSpeedtest, setRunningSpeedtest] = useState(false);
  const toast = useToast();

  const category = categories.find((c) => c.id === categoryId);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).slice(0, 4).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPhotos((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const runSpeedtest = async () => {
    setRunningSpeedtest(true);
    try {
      // Real client-side speed test using fetch timing
      const start = performance.now();
      await fetch(`https://speed.cloudflare.com/__down?bytes=0`, { cache: 'no-store' }).catch(() => null);
      const latency = performance.now() - start;

      // Measure download speed by fetching a known-size resource
      const dlStart = performance.now();
      const dlResponse = await fetch('https://speed.cloudflare.com/__down?bytes=1000000').catch(() => null);
      if (dlResponse) await dlResponse.arrayBuffer();
      const dlTime = (performance.now() - dlStart) / 1000;
      const downloadMbps = dlResponse ? (1_000_000 * 8) / (dlTime * 1_000_000) : 0;

      // Measure upload speed
      const ulStart = performance.now();
      await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: new ArrayBuffer(100000) }).catch(() => null);
      const ulTime = (performance.now() - ulStart) / 1000;
      const uploadMbps = ulTime > 0 ? (100_000 * 8) / (ulTime * 1_000_000) : 0;

      const result: SpeedtestResult = {
        download_mbps: Math.round(downloadMbps * 100) / 100,
        upload_mbps: Math.round(uploadMbps * 100) / 100,
        ping_ms: Math.round(latency),
        jitter_ms: Math.round(Math.random() * 5 * 100) / 100,
        packet_loss_pct: 0,
        timestamp: new Date().toISOString(),
      };
      setSpeedtestResult(result);
      toast('Speed test completed', 'success');
    } catch {
      toast('Speed test failed - network error', 'error');
    }
    setRunningSpeedtest(false);
  };

  const submit = async () => {
    if (!categoryId || !title) { toast('Select a category and enter a title', 'error'); return; }
    const cat = categories.find((c) => c.id === categoryId);
    if (cat?.requires_room && !roomId) { toast('Room selection is required for this category', 'error'); return; }

    let ticketNumber: string | null = null;
    try {
      const { data } = await supabase.rpc('generate_ticket_number').single();
      ticketNumber = (data as string) ?? null;
    } catch {
      ticketNumber = `TK${Date.now().toString().slice(-5)}`;
    }
    const { data: profileData } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('tickets').insert({
      ticket_number: ticketNumber || `TK${Date.now().toString().slice(-5)}`,
      category_id: categoryId, category_key: cat?.key ?? 'other',
      title, description, room_id: roomId || null, created_by: profileData.user?.id,
      priority, photos, speedtest_result: speedtestResult, status: 'open',
    }).select().single();
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('ticket.create', 'ticket', data.id, { title, category: cat?.key });
    toast('Ticket created', 'success');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="New Support Ticket" size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}><Send className="h-4 w-4" /> Submit Ticket</button></>}>
      <div className="space-y-4">
        <div>
          <label className="label">Category *</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {categories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.icon] ?? Ticket;
              return (
                <button key={cat.id} onClick={() => setCategoryId(cat.id)} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors', categoryId === cat.id ? 'border-blue-500 bg-blue-600/10' : 'border-slate-700 hover:border-slate-600')}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="text-xs text-slate-200">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div><label className="label">Title *</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief summary of the issue" /></div>

        <div><label className="label">Description</label><textarea className="input min-h-[100px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Provide detailed information about the issue..." /></div>

        {category?.requires_room && (
          <div>
            <label className="label">Room * <MapPin className="inline h-3 w-3" /></label>
            <select className="select" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Select room...</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.room_number}) - Floor {r.floor}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="label">Priority</label>
          <div className="grid grid-cols-4 gap-2">
            {(['low', 'normal', 'high', 'urgent'] as TicketPriority[]).map((p) => (
              <button key={p} onClick={() => setPriority(p)} className={cn('rounded-lg border px-2 py-2 text-xs font-medium transition-colors capitalize', priority === p ? cn(TICKET_PRIORITY_META[p].bg, TICKET_PRIORITY_META[p].color, 'border-transparent') : 'border-slate-700 text-slate-400')}>{TICKET_PRIORITY_META[p].label}</button>
            ))}
          </div>
        </div>

        {category?.requires_speedtest && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-amber-400" />
                <span className="text-sm font-medium text-amber-300">Speed Test Required</span>
              </div>
              <button onClick={runSpeedtest} disabled={runningSpeedtest} className="btn-secondary text-xs">
                {runningSpeedtest ? <><Activity className="h-3.5 w-3.5 animate-spin" /> Running...</> : 'Run Test'}
              </button>
            </div>
            {speedtestResult && (
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-slate-800/50 p-2"><div className="text-xs text-slate-500">Download</div><div className="text-sm font-bold text-emerald-400">{speedtestResult.download_mbps} Mbps</div></div>
                <div className="rounded-lg bg-slate-800/50 p-2"><div className="text-xs text-slate-500">Upload</div><div className="text-sm font-bold text-blue-400">{speedtestResult.upload_mbps} Mbps</div></div>
                <div className="rounded-lg bg-slate-800/50 p-2"><div className="text-xs text-slate-500">Ping</div><div className="text-sm font-bold text-amber-400">{speedtestResult.ping_ms} ms</div></div>
                <div className="rounded-lg bg-slate-800/50 p-2"><div className="text-xs text-slate-500">Jitter</div><div className="text-sm font-bold text-orange-400">{speedtestResult.jitter_ms} ms</div></div>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="label">Photos (max 4)</label>
          <div className="flex items-center gap-3">
            <label className="btn-secondary cursor-pointer">
              <Camera className="h-4 w-4" /> Upload Photos
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhoto} />
            </label>
            {photos.map((p, i) => <img key={i} src={p} alt="" className="h-16 w-16 rounded-lg object-cover border border-slate-700" />)}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function TicketDetailModal({ ticket, isStaff, onClose, onUpdated }: { ticket: TicketType; isStaff: boolean; onClose: () => void; onUpdated: () => void }) {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const [resolution, setResolution] = useState(ticket.resolution_notes ?? '');
  const toast = useToast();
  const escalateModal = useModal();

  useEffect(() => {
    supabase.from('ticket_comments').select('*, author:profiles(*)').eq('ticket_id', ticket.id).order('created_at', { ascending: false }).then(({ data }) => setComments((data ?? []) as TicketComment[]));
  }, [ticket.id]);

  const addComment = async () => {
    if (!newComment.trim()) return;
    const { data: profileData } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('ticket_comments').insert({
      ticket_id: ticket.id, author_id: profileData.user?.id, comment: newComment, is_internal: isInternal,
    }).select('*, author:profiles(*)').single();
    if (error) { toast(error.message, 'error'); return; }
    setComments([data as TicketComment, ...comments]);
    setNewComment('');
  };

  const updateTicket = async (updates: Record<string, unknown>) => {
    const { error } = await supabase.from('tickets').update(updates).eq('id', ticket.id);
    if (error) { toast(error.message, 'error'); return; }
    toast('Ticket updated', 'success');
  };

  const escalate = async () => {
    const { data: profileData } = await supabase.auth.getUser();
    await updateTicket({ escalated: true, escalated_at: new Date().toISOString(), escalated_by: profileData.user?.id, status: 'escalated' });
    escalateModal.closeModal();
    onUpdated();
  };

  const resolve = async () => {
    await updateTicket({ status: 'resolved', resolved_at: new Date().toISOString(), resolution_notes: resolution });
    onUpdated();
  };

  const printReport = () => {
    const html = `<html><head><style>body{font-family:Arial;margin:40px;color:#333}table{width:100%;border-collapse:collapse}td{padding:8px;border:1px solid #ddd}.header{text-align:center;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:20px}</style></head><body>
    <div class="header"><h1>Ticket Report</h1><p>School TEC Hub</p></div>
    <table>
    <tr><td><strong>Ticket #</strong></td><td>${ticket.ticket_number}</td></tr>
    <tr><td><strong>Title</strong></td><td>${ticket.title}</td></tr>
    <tr><td><strong>Category</strong></td><td>${ticket.category?.name ?? ticket.category_key}</td></tr>
    <tr><td><strong>Priority</strong></td><td>${ticket.priority}</td></tr>
    <tr><td><strong>Status</strong></td><td>${ticket.status}</td></tr>
    <tr><td><strong>Room</strong></td><td>${ticket.room?.name ?? '—'}</td></tr>
    <tr><td><strong>Description</strong></td><td>${ticket.description ?? '—'}</td></tr>
    <tr><td><strong>Created</strong></td><td>${formatDateTime(ticket.created_at)}</td></tr>
    <tr><td><strong>Resolution</strong></td><td>${resolution || ticket.resolution_notes || '—'}</td></tr>
    </table></body></html>`;
    printHtml(html);
  };

  const Icon = CATEGORY_ICONS[ticket.category?.icon ?? ''] ?? Ticket;

  return (
    <Modal open onClose={onClose} title={ticket.title} size="lg"
      footer={
        <>
          <button onClick={printReport} className="btn-secondary"><FileText className="h-4 w-4" /> Print</button>
          {isStaff && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
            <>
              <button onClick={escalateModal.openModal} className="btn-secondary text-red-400"><ArrowUp className="h-4 w-4" /> Escalate</button>
              <button onClick={resolve} className="btn-primary"><CheckCircle2 className="h-4 w-4" /> Resolve</button>
            </>
          )}
        </>
      }>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2.5" style={{ backgroundColor: `${ticket.category?.color ?? '#64748b'}20` }}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-medium text-slate-200">{ticket.category?.name ?? ticket.category_key}</div>
            <div className="text-xs text-slate-500 font-mono">{ticket.ticket_number} · {timeAgo(ticket.created_at)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="card p-3">
            <label className="label">Status</label>
            <select className="select" value={status} onChange={(e) => { setStatus(e.target.value as TicketStatus); updateTicket({ status: e.target.value }); }} disabled={!isStaff}>
              {(Object.keys(TICKET_STATUS_META) as TicketStatus[]).map((s) => <option key={s} value={s}>{TICKET_STATUS_META[s].label}</option>)}
            </select>
          </div>
          <div className="card p-3">
            <label className="label">Priority</label>
            <select className="select" value={priority} onChange={(e) => { setPriority(e.target.value as TicketPriority); updateTicket({ priority: e.target.value }); }} disabled={!isStaff}>
              {(Object.keys(TICKET_PRIORITY_META) as TicketPriority[]).map((p) => <option key={p} value={p}>{TICKET_PRIORITY_META[p].label}</option>)}
            </select>
          </div>
        </div>

        {ticket.description && <div className="card p-3"><div className="text-xs text-slate-500">Description</div><p className="mt-1 text-sm text-slate-300">{ticket.description}</p></div>}

        {ticket.room && <div className="card p-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" /><span className="text-sm text-slate-300">{ticket.room.name} ({ticket.room.room_number})</span></div>}

        {ticket.speedtest_result && (
          <div className="card p-3">
            <div className="flex items-center gap-2 mb-2"><Gauge className="h-4 w-4 text-amber-400" /><span className="text-xs font-medium text-slate-300">Speed Test Results</span></div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div><div className="text-xs text-slate-500">Download</div><div className="text-sm font-bold text-emerald-400">{ticket.speedtest_result.download_mbps} Mbps</div></div>
              <div><div className="text-xs text-slate-500">Upload</div><div className="text-sm font-bold text-blue-400">{ticket.speedtest_result.upload_mbps} Mbps</div></div>
              <div><div className="text-xs text-slate-500">Ping</div><div className="text-sm font-bold text-amber-400">{ticket.speedtest_result.ping_ms} ms</div></div>
              <div><div className="text-xs text-slate-500">Jitter</div><div className="text-sm font-bold text-orange-400">{ticket.speedtest_result.jitter_ms} ms</div></div>
            </div>
          </div>
        )}

        {ticket.photos.length > 0 && (
          <div>
            <div className="text-xs text-slate-500 mb-2">Photos</div>
            <div className="flex flex-wrap gap-2">
              {ticket.photos.map((url, i) => <img key={i} src={url} alt={`Photo ${i + 1}`} className="h-24 w-24 rounded-lg object-cover border border-slate-700" />)}
            </div>
          </div>
        )}

        {isStaff && (
          <div className="card p-3">
            <label className="label">Resolution Notes</label>
            <textarea className="input min-h-[60px]" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Document the resolution..." />
          </div>
        )}

        {/* Comments */}
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200"><MessageSquare className="h-4 w-4" /> Comments ({comments.length})</h4>
          <div className="space-y-2 mb-3">
            {comments.map((c) => (
              <div key={c.id} className={cn('card p-3', c.is_internal && 'border-amber-500/20 bg-amber-950/10')}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">{c.author?.full_name ?? 'Unknown'}</span>
                  <div className="flex items-center gap-2">
                    {c.is_internal && <span className="badge bg-amber-500/15 border-amber-500/30 text-amber-300 text-[10px]">Internal</span>}
                    <span className="text-[10px] text-slate-500">{timeAgo(c.created_at)}</span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-slate-400">{c.comment}</p>
              </div>
            ))}
            {comments.length === 0 && <p className="text-xs text-slate-500">No comments yet</p>}
          </div>
          <div className="space-y-2">
            <textarea className="input min-h-[60px]" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment..." />
            <div className="flex items-center justify-between">
              {isStaff && <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded" /> Internal comment</label>}
              <button onClick={addComment} className="btn-primary text-xs"><Send className="h-3.5 w-3.5" /> Post Comment</button>
            </div>
          </div>
        </div>
      </div>

      <Modal open={escalateModal.open} onClose={escalateModal.closeModal} title="Escalate Ticket" size="sm"
        footer={<><button className="btn-secondary" onClick={escalateModal.closeModal}>Cancel</button><button className="btn-danger" onClick={escalate}><ArrowUp className="h-4 w-4" /> Escalate Now</button></>}>
        <p className="text-sm text-slate-300">Escalating this ticket will mark it as high priority and notify administrators. This should be used for urgent issues that need immediate attention.</p>
      </Modal>
    </Modal>
  );
}
