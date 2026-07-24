import { useState, useMemo, useEffect } from 'react';
import {
  HandHelping, Plus, Check, X, Clock, Calendar, Package, Sparkles,
  PenTool, ArrowLeft, Search, AlertCircle, MapPin,
} from 'lucide-react';
import { supabase } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { useDevices, useLoans, useRequests, useRooms } from '@/lib/hooks';
import { LOAN_STATUS_META, REQUEST_STATUS_META } from '@/lib/constants';
import { cn, formatDateTime, timeAgo, isOverdue, logActivity } from '@/lib/utils';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { SignaturePad } from '@/components/SignaturePad';
import type { LendingRequest, LendingLoan, Device, LendingPeriod, DeviceBundle } from '@/lib/types';

type Tab = 'requests' | 'active' | 'history' | 'create';

export function LendingPage() {
  const { profile, isStaff } = useAuth();
  const [tab, setTab] = useState<Tab>('requests');
  const { data: requests, loading: reqLoading, refresh: refreshReq } = useRequests();
  const { data: loans, loading: loanLoading, refresh: refreshLoans } = useLoans();
  const { data: devices } = useDevices();
  const [showCreate, setShowCreate] = useState(false);
  const [showFulfill, setShowFulfill] = useState<LendingRequest | null>(null);
  const [showReturn, setShowReturn] = useState<LendingLoan | null>(null);

  if (reqLoading || loanLoading) return <LoadingScreen message="Loading lending data..." />;

  const myRequests = (requests ?? []).filter((r) => r.teacher_id === profile?.id);
  const pendingRequests = (requests ?? []).filter((r) => r.status === 'pending');
  const activeLoans = (loans ?? []).filter((l) => l.status === 'active');

  const tabs: { id: Tab; label: string; count?: number; icon: React.ComponentType<{ className?: string }> }[] = [
    ...(isStaff ? [{ id: 'requests' as Tab, label: 'Requests', count: pendingRequests.length, icon: HandHelping }] : [{ id: 'requests' as Tab, label: 'My Requests', count: myRequests.length, icon: HandHelping }]),
    { id: 'active', label: 'Active Loans', count: activeLoans.length, icon: Clock },
    { id: 'history', label: 'History', icon: Calendar },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lending System"
        subtitle="Borrow, return, and manage device loans"
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> New Request
          </button>
        }
      />

      <div className="flex gap-1 border-b border-slate-800 overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('tab whitespace-nowrap', tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200')}>
            <t.icon className="mr-1.5 inline h-4 w-4" />
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="ml-1.5 badge bg-blue-500/15 border-blue-500/30 text-blue-300 text-[10px]">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'requests' && (
        isStaff ? (
          <RequestList requests={requests ?? []} onFulfill={(r) => setShowFulfill(r)} onApprove={async (r) => { await supabase.from('lending_requests').update({ status: 'approved', approved_by: profile?.id, approved_at: new Date().toISOString() }).eq('id', r.id); await logActivity('request.approve', 'request', r.id); refreshReq(); }} onReject={async (r, reason) => { await supabase.from('lending_requests').update({ status: 'rejected', rejection_reason: reason }).eq('id', r.id); refreshReq(); }} />
        ) : (
          <RequestList requests={myRequests} onFulfill={() => {}} onApprove={() => {}} onReject={() => {}} readOnly />
        )
      )}

      {tab === 'active' && <ActiveLoansList loans={activeLoans} onReturn={(l) => setShowReturn(l)} />}

      {tab === 'history' && <HistoryList loans={(loans ?? []).filter((l) => l.status === 'returned')} requests={(requests ?? []).filter((r) => r.status === 'fulfilled' || r.status === 'rejected' || r.status === 'cancelled')} />}

      {showCreate && <CreateRequestModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); refreshReq(); }} />}
      {showFulfill && <FulfillModal request={showFulfill} devices={devices ?? []} onClose={() => setShowFulfill(null)} onSaved={() => { setShowFulfill(null); refreshReq(); refreshLoans(); }} />}
      {showReturn && <ReturnModal loan={showReturn} onClose={() => setShowReturn(null)} onSaved={() => { setShowReturn(null); refreshLoans(); }} />}
    </div>
  );
}

function RequestList({ requests, onFulfill, onApprove, onReject, readOnly }: {
  requests: LendingRequest[];
  onFulfill: (r: LendingRequest) => void;
  onApprove: (r: LendingRequest) => void;
  onReject: (r: LendingRequest, reason: string) => void;
  readOnly?: boolean;
}) {
  const [rejecting, setRejecting] = useState<LendingRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const toast = useToast();

  if (requests.length === 0) return <div className="card"><EmptyState icon={HandHelping} title="No requests" message="Create a new lending request to get started" /></div>;

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-200">{r.teacher?.full_name ?? 'Unknown'}</span>
                <span className={cn('badge', REQUEST_STATUS_META[r.status].bg, REQUEST_STATUS_META[r.status].color)}>{REQUEST_STATUS_META[r.status].label}</span>
                {r.room && <span className="badge bg-slate-700/50 text-slate-300 border-slate-700"><MapPin className="h-3 w-3" />{r.room.name}</span>}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {r.period?.name ?? 'Custom'} · {timeAgo(r.created_at)}
                {r.pickup_at && <> · Pickup: {formatDateTime(r.pickup_at)}</>}
              </div>
              {r.items && r.items.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.items.map((item) => (
                    <span key={item.id} className="badge bg-slate-800 text-slate-300 border-slate-700 text-[10px]">
                      {item.bundle?.name ?? item.device?.name ?? item.category?.name ?? 'Item'} ×{item.quantity}
                    </span>
                  ))}
                </div>
              )}
              {r.rejection_reason && <div className="mt-2 text-xs text-red-400">Rejected: {r.rejection_reason}</div>}
              {r.notes && <div className="mt-2 text-xs text-slate-400">{r.notes}</div>}
            </div>
            {!readOnly && r.status === 'pending' && (
              <div className="flex items-center gap-2">
                <button onClick={() => onApprove(r)} className="btn-secondary text-xs"><Check className="h-4 w-4" /> Approve</button>
                <button onClick={() => { setRejecting(r); setRejectReason(''); }} className="btn-ghost text-red-400 text-xs"><X className="h-4 w-4" /></button>
              </div>
            )}
            {!readOnly && r.status === 'approved' && (
              <button onClick={() => onFulfill(r)} className="btn-primary text-xs"><Package className="h-4 w-4" /> Fulfill</button>
            )}
          </div>
        </div>
      ))}

      {rejecting && (
        <Modal open onClose={() => setRejecting(null)} title="Reject Request" size="sm"
          footer={<><button className="btn-secondary" onClick={() => setRejecting(null)}>Cancel</button>
          <button className="btn-danger" onClick={() => { if (!rejectReason.trim()) { toast('Please provide a reason', 'error'); return; } onReject(rejecting, rejectReason); setRejecting(null); }}>Reject</button></>}>
          <div><label className="label">Reason for rejection</label><textarea className="input min-h-[80px]" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Explain why the request is being rejected..." /></div>
        </Modal>
      )}
    </div>
  );
}

function ActiveLoansList({ loans, onReturn }: { loans: LendingLoan[]; onReturn: (l: LendingLoan) => void }) {
  if (loans.length === 0) return <div className="card"><EmptyState icon={Clock} title="No active loans" /></div>;
  return (
    <div className="space-y-3">
      {loans.map((loan) => {
        const overdue = isOverdue(loan.expected_return_at);
        return (
          <div key={loan.id} className={cn('card p-4', overdue && 'border-red-500/30')}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-200">{loan.teacher?.full_name ?? 'Unknown'}</span>
                  <span className={cn('badge', LOAN_STATUS_META[loan.status].bg, LOAN_STATUS_META[loan.status].color)}>{LOAN_STATUS_META[loan.status].label}</span>
                  {overdue && <span className="badge bg-red-500/15 border-red-500/30 text-red-300"><AlertCircle className="h-3 w-3" /> Overdue</span>}
                  {loan.room && <span className="badge bg-slate-700/50 text-slate-300 border-slate-700"><MapPin className="h-3 w-3" />{loan.room.name}</span>}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Checkout: {formatDateTime(loan.checkout_at)} · Due: {formatDateTime(loan.expected_return_at)}
                </div>
                <div className="mt-2 text-xs text-slate-400">Staff: {loan.staff?.full_name ?? '—'}</div>
                {loan.items && loan.items.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {loan.items.map((item) => (
                      <span key={item.id} className="badge bg-slate-800 text-slate-300 border-slate-700 text-[10px]">
                        {item.device?.name ?? 'Device'} ({item.device?.inventory_number ?? '—'})
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => onReturn(loan)} className="btn-secondary"><ArrowLeft className="h-4 w-4" /> Return</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryList({ loans, requests }: { loans: LendingLoan[]; requests: LendingRequest[] }) {
  if (loans.length === 0 && requests.length === 0) return <div className="card"><EmptyState icon={Calendar} title="No history yet" /></div>;
  return (
    <div className="space-y-3">
      {loans.map((loan) => (
        <div key={loan.id} className="card p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-slate-200">{loan.teacher?.full_name ?? 'Unknown'}</span>
              <span className="ml-2 text-xs text-slate-500">{loan.items?.length ?? 0} device(s)</span>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>Returned {formatDateTime(loan.actual_return_at)}</div>
              <span className={cn('badge mt-0.5', LOAN_STATUS_META[loan.status].bg, LOAN_STATUS_META[loan.status].color)}>{LOAN_STATUS_META[loan.status].label}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CreateRequestModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const { data: devices } = useDevices();
  const { data: rooms } = useRooms();
  const [periods, setPeriods] = useState<LendingPeriod[]>([]);
  const [bundles, setBundles] = useState<DeviceBundle[]>([]);
  const [roomId, setRoomId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [selectedBundles, setSelectedBundles] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const toast = useToast();

  useEffect(() => {
    supabase.from('lending_periods').select('*').order('sort_order').then(({ data }: any) => setPeriods((data ?? []) as LendingPeriod[]));
    supabase.from('device_bundles').select('*, items:device_bundle_items(*)').order('name').then(({ data }: any) => setBundles((data ?? []) as DeviceBundle[]));
  }, []);

  // Smart recommendations based on room
  useEffect(() => {
    if (!roomId) { setRecommendations([]); return; }
    const room = (rooms ?? []).find((r) => r.id === roomId);
    if (!room) return;
    // Recommend based on room connections and historical usage
    const recs: string[] = [];
    const connections = room.available_connections ?? [];
    const hasHDMI = connections.some((c) => c.toLowerCase().includes('hdmi'));
    const hasVGA = connections.some((c) => c.toLowerCase().includes('vga'));
    const availableDevices = (devices ?? []).filter((d) => d.status === 'available');
    if (hasHDMI) {
      const adapter = availableDevices.find((d) => d.name.toLowerCase().includes('hdmi') && d.name.toLowerCase().includes('adapter'));
      if (adapter) recs.push(adapter.id);
    }
    if (hasVGA) {
      const adapter = availableDevices.find((d) => d.name.toLowerCase().includes('vga') && d.name.toLowerCase().includes('adapter'));
      if (adapter) recs.push(adapter.id);
    }
    // Always recommend extension cable and speaker for classrooms
    const cable = availableDevices.find((d) => d.name.toLowerCase().includes('extension') && d.name.toLowerCase().includes('cable'));
    if (cable) recs.push(cable.id);
    const speaker = availableDevices.find((d) => d.name.toLowerCase().includes('speaker'));
    if (speaker) recs.push(speaker.id);
    setRecommendations(recs);
  }, [roomId, rooms, devices]);

  const toggleDevice = (id: string) => setSelectedDevices((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);
  const toggleBundle = (id: string) => setSelectedBundles((prev) => prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]);

  const submit = async () => {
    if (!roomId || !periodId) { toast('Select a room and lending period', 'error'); return; }
    if (selectedDevices.length === 0 && selectedBundles.length === 0) { toast('Select at least one device or bundle', 'error'); return; }

    const { data: reqData, error: reqError } = await supabase.from('lending_requests').insert({
      teacher_id: profile?.id, room_id: roomId, period_id: periodId, status: 'pending', notes,
    }).select().single();
    if (reqError) { toast(reqError.message, 'error'); return; }

    const items = [
      ...selectedDevices.map((id) => ({ request_id: reqData.id, device_id: id, quantity: 1 })),
      ...selectedBundles.map((id) => ({ request_id: reqData.id, bundle_id: id, quantity: 1 })),
    ];
    if (items.length) await supabase.from('lending_request_items').insert(items);

    await logActivity('request.create', 'request', reqData.id, { room: roomId });
    toast('Lending request submitted', 'success');
    onSaved();
  };

  const availableDevices = (devices ?? []).filter((d) => d.status === 'available' && (!search || d.name.toLowerCase().includes(search.toLowerCase()) || d.inventory_number.toLowerCase().includes(search.toLowerCase())));

  return (
    <Modal open onClose={onClose} title="New Lending Request" size="xl"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Submit Request</button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Room (required)</label>
            <select className="select" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Select room...</option>
              {(rooms ?? []).map((r) => <option key={r.id} value={r.id}>{r.name} ({r.room_number})</option>)}
            </select>
            {roomId && (rooms ?? []).find((r) => r.id === roomId)?.available_connections && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(rooms ?? []).find((r) => r.id === roomId)?.available_connections.map((c) => <span key={c} className="badge bg-slate-800 text-slate-400 border-slate-700 text-[10px]">{c}</span>)}
              </div>
            )}
          </div>
          <div>
            <label className="label">Lending Period</label>
            <select className="select" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              <option value="">Select period...</option>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.duration_minutes}min)</option>)}
            </select>
          </div>
        </div>

        {recommendations.length > 0 && (
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-cyan-300 mb-2">
              <Sparkles className="h-4 w-4" /> Smart Recommendations
            </div>
            <p className="text-xs text-cyan-400/80 mb-2">Based on the selected room's connections, these accessories are recommended:</p>
            <div className="flex flex-wrap gap-2">
              {recommendations.map((id) => {
                const d = (devices ?? []).find((dev) => dev.id === id);
                if (!d) return null;
                const selected = selectedDevices.includes(id);
                return (
                  <button key={id} onClick={() => toggleDevice(id)} className={cn('badge border transition-colors', selected ? 'bg-cyan-600/20 border-cyan-500 text-cyan-300' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-cyan-500/50')}>
                    {selected && <Check className="h-3 w-3" />} {d.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {bundles.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-200">Device Bundles</h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {bundles.map((b) => (
                <button key={b.id} onClick={() => toggleBundle(b.id)} className={cn('card p-3 text-left transition-colors', selectedBundles.includes(b.id) ? 'border-blue-500 bg-blue-600/10' : 'hover:border-slate-700')}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-200">{b.name}</span>
                    {selectedBundles.includes(b.id) && <Check className="h-4 w-4 text-blue-400" />}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{b.items?.length ?? 0} items</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-200">Individual Devices</h4>
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input className="input pl-8 py-1.5 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." />
            </div>
          </div>
          <div className="scrollbar-thin max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-slate-800 p-2">
            {availableDevices.map((d) => (
              <button key={d.id} onClick={() => toggleDevice(d.id)} className={cn('flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors', selectedDevices.includes(d.id) ? 'border-blue-500 bg-blue-600/10' : 'border-slate-800 hover:bg-slate-800/30')}>
                <div>
                  <div className="text-sm text-slate-200">{d.name}</div>
                  <div className="text-xs text-slate-500">{d.inventory_number} · {d.category?.name}</div>
                </div>
                {selectedDevices.includes(d.id) && <Check className="h-4 w-4 text-blue-400" />}
              </button>
            ))}
            {availableDevices.length === 0 && <div className="py-4 text-center text-sm text-slate-500">No available devices found</div>}
          </div>
        </div>

        <div><label className="label">Notes (optional)</label><textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any special instructions..." /></div>
      </div>
    </Modal>
  );
}

function FulfillModal({ request, devices, onClose, onSaved }: { request: LendingRequest; devices: Device[]; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [periods, setPeriods] = useState<LendingPeriod[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState(request.teacher?.full_name ?? '');
  const toast = useToast();

  useEffect(() => {
    supabase.from('lending_periods').select('*').order('sort_order').then(({ data }: any) => setPeriods((data ?? []) as LendingPeriod[]));
  }, []);

  const period = periods.find((p) => p.id === request.period_id);
  const expectedReturn = useMemo(() => {
    const dur = period?.duration_minutes ?? 45;
    return new Date(Date.now() + dur * 60_000).toISOString();
  }, [period]);

  const toggleDevice = (id: string) => setSelectedDeviceIds((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);

  const fulfill = async () => {
    if (selectedDeviceIds.length === 0) { toast('Select at least one device to lend', 'error'); return; }
    if (!signature) { toast('Signature is required', 'error'); return; }
    if (!signatureName.trim()) { toast('Signature name is required', 'error'); return; }

    const { data: loan, error: loanError } = await supabase.from('lending_loans').insert({
      request_id: request.id, teacher_id: request.teacher_id, staff_id: profile?.id,
      room_id: request.room_id, period_id: request.period_id,
      expected_return_at: expectedReturn, status: 'active', signature_data: signature, signature_name: signatureName,
    }).select().single();
    if (loanError) { toast(loanError.message, 'error'); return; }

    await supabase.from('lending_loan_items').insert(selectedDeviceIds.map((id) => ({ loan_id: loan.id, device_id: id })));

    // Mark devices as borrowed
    for (const id of selectedDeviceIds) {
      await supabase.from('devices').update({ status: 'borrowed' }).eq('id', id);
    }

    // Mark request as fulfilled
    await supabase.from('lending_requests').update({ status: 'fulfilled' }).eq('id', request.id);

    await logActivity('loan.create', 'loan', loan.id, { teacher: request.teacher_id, devices: selectedDeviceIds.length });
    toast('Loan created successfully', 'success');
    onSaved();
  };

  // Show requested items as suggestions
  const requestedDevices = (request.items ?? []).filter((i) => i.device_id).map((i) => i.device_id);
  const availableDevices = devices.filter((d) => d.status === 'available' || requestedDevices.includes(d.id));

  return (
    <Modal open onClose={onClose} title="Fulfill Lending Request" size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={fulfill}><Check className="h-4 w-4" /> Complete Lending</button></>}>
      <div className="space-y-4">
        <div className="card p-3">
          <div className="text-sm font-medium text-slate-200">{request.teacher?.full_name}</div>
          <div className="text-xs text-slate-500">Room: {request.room?.name ?? '—'} · Period: {period?.name ?? '—'}</div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-200">Select Devices to Lend</h4>
          <div className="scrollbar-thin max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-slate-800 p-2">
            {availableDevices.map((d) => (
              <button key={d.id} onClick={() => toggleDevice(d.id)} className={cn('flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors', selectedDeviceIds.includes(d.id) ? 'border-blue-500 bg-blue-600/10' : 'border-slate-800 hover:bg-slate-800/30')}>
                <div>
                  <div className="text-sm text-slate-200">{d.name}</div>
                  <div className="text-xs text-slate-500">{d.inventory_number} · {d.barcode ?? 'No barcode'}</div>
                </div>
                <div className="flex items-center gap-2">
                  {requestedDevices.includes(d.id) && <span className="badge bg-cyan-500/15 border-cyan-500/30 text-cyan-300 text-[10px]">Requested</span>}
                  {selectedDeviceIds.includes(d.id) && <Check className="h-4 w-4 text-blue-400" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Expected Return</label>
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-300">{formatDateTime(expectedReturn)}</div>
          </div>
          <div><label className="label">Signature Name</label><input className="input" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} /></div>
        </div>

        <div>
          <label className="label flex items-center gap-1"><PenTool className="h-3.5 w-3.5" /> Signature Confirmation (required)</label>
          <SignaturePad onChange={setSignature} />
        </div>
      </div>
    </Modal>
  );
}

function ReturnModal({ loan, onClose, onSaved }: { loan: LendingLoan; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [condition, setCondition] = useState<'excellent' | 'good' | 'fair' | 'damaged' | 'defective'>('good');
  const [notes, setNotes] = useState('');
  const toast = useToast();

  const handleReturn = async () => {
    const { error } = await supabase.from('lending_loans').update({
      actual_return_at: new Date().toISOString(), status: 'returned',
      return_condition: condition, return_notes: notes, return_staff_id: profile?.id,
    }).eq('id', loan.id);
    if (error) { toast(error.message, 'error'); return; }

    // Mark devices as available again
    for (const item of loan.items ?? []) {
      const newStatus = condition === 'defective' ? 'defective' : condition === 'damaged' ? 'maintenance' : 'available';
      await supabase.from('devices').update({ status: newStatus, condition }).eq('id', item.device_id);
    }

    await logActivity('loan.return', 'loan', loan.id, { condition });
    toast('Device(s) returned successfully', 'success');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Return Devices" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={handleReturn}><ArrowLeft className="h-4 w-4" /> Confirm Return</button></>}>
      <div className="space-y-4">
        <div className="card p-3">
          <div className="text-sm font-medium text-slate-200">{loan.teacher?.full_name}</div>
          <div className="text-xs text-slate-500">Checked out: {formatDateTime(loan.checkout_at)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(loan.items ?? []).map((item) => <span key={item.id} className="badge bg-slate-800 text-slate-300 border-slate-700 text-[10px]">{item.device?.name}</span>)}
          </div>
        </div>
        <div>
          <label className="label">Device Condition After Return</label>
          <div className="grid grid-cols-5 gap-2">
            {([['excellent', 'Excellent', 'text-emerald-300'], ['good', 'Good', 'text-blue-300'], ['fair', 'Fair', 'text-amber-300'], ['damaged', 'Damaged', 'text-orange-300'], ['defective', 'Defective', 'text-red-300']] as const).map(([val, label, color]) => (
              <button key={val} onClick={() => setCondition(val)} className={cn('rounded-lg border px-2 py-2 text-xs font-medium transition-colors', condition === val ? 'border-blue-500 bg-blue-600/15 text-blue-300' : 'border-slate-700 text-slate-400 hover:border-slate-600', condition === val && color)}>{label}</button>
            ))}
          </div>
        </div>
        <div><label className="label">Return Notes (optional)</label><textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any issues noticed during return..." /></div>
        {(condition === 'damaged' || condition === 'defective') && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
            <AlertCircle className="inline h-4 w-4 mr-1" /> Device will be marked as {condition === 'defective' ? 'defective' : 'in maintenance'} and a damage report should be filed.
          </div>
        )}
      </div>
    </Modal>
  );
}
