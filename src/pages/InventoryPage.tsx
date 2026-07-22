import { useState, useMemo, useEffect } from 'react';
import {
  Package, Plus, Search, QrCode, Tag, MapPin, Wrench, AlertTriangle,
  Boxes, ClipboardCheck, Printer, Eye, Edit, Trash2, ScanLine,
  Battery, CassetteTape, Cable, Cpu, Download, ChevronRight, Camera, FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useDevices, useRooms } from '@/lib/hooks';
import { DEVICE_STATUS_META, CONDITION_META } from '@/lib/constants';
import { cn, formatCurrency, formatDate, formatNumber, logActivity, printHtml, downloadFile } from '@/lib/utils';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { Modal, ConfirmDialog, useModal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { generateDeviceLabel, generateBarcodeValue, generateNfcTagId, generateInventoryNumber } from '@/lib/qr';
import type { Device, DeviceStatus, TrackingMethod, ConditionRating, InventoryCategory, Room, Cabinet, Shelf, Consumable, DamageReport, RepairRecord } from '@/lib/types';

type Tab = 'devices' | 'storage' | 'audits' | 'consumables' | 'damage' | 'repairs';

export function InventoryPage() {
  const { profile } = useAuth();
  const { data: devices, loading, refresh } = useDevices();
  const { data: rooms } = useRooms();
  const [tab, setTab] = useState<Tab>('devices');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [selected, setSelected] = useState<Device | null>(null);
  const [editing, setEditing] = useState<Device | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showLabel, setShowLabel] = useState<Device | null>(null);
  const [showStorage, setShowStorage] = useState<Device | null>(null);
  const [scanMode, setScanMode] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const toast = useToast();
  const deleteModal = useModal();

  useEffect(() => {
    supabase.from('inventory_categories').select('*').order('sort_order').then(({ data }) => {
      if (data) setCategories(data as InventoryCategory[]);
    });
  }, []);

  const filtered = useMemo(() => {
    let result = devices ?? [];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        d.inventory_number.toLowerCase().includes(q) ||
        d.barcode?.toLowerCase().includes(q) ||
        d.nfc_tag_id?.toLowerCase().includes(q) ||
        d.serial_number?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') result = result.filter((d) => d.status === statusFilter);
    if (categoryFilter !== 'all') result = result.filter((d) => d.category_id === categoryFilter);
    return result;
  }, [devices, search, statusFilter, categoryFilter]);

  const handleScan = () => {
    if (!scanInput.trim()) return;
    const found = (devices ?? []).find((d) => d.barcode === scanInput || d.nfc_tag_id === scanInput || d.inventory_number === scanInput || d.qr_code === scanInput);
    if (found) {
      setSelected(found);
      setShowStorage(found);
      toast(`Found: ${found.name}`, 'success');
    } else {
      toast('No device found with that code', 'error');
    }
    setScanInput('');
    setScanMode(false);
  };

  const handleDelete = async () => {
    if (!selected) return;
    const { error } = await supabase.from('devices').delete().eq('id', selected.id);
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('device.delete', 'device', selected.id, { name: selected.name });
    toast('Device deleted', 'success');
    setSelected(null);
    refresh();
  };

  if (loading) return <LoadingScreen message="Loading inventory..." />;

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'devices', label: 'Devices', icon: Package },
    { id: 'storage', label: 'Storage Map', icon: MapPin },
    { id: 'audits', label: 'Audits', icon: ClipboardCheck },
    { id: 'consumables', label: 'Consumables', icon: Boxes },
    { id: 'damage', label: 'Damage Reports', icon: AlertTriangle },
    { id: 'repairs', label: 'Repairs', icon: Wrench },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory Management"
        subtitle={`${(devices ?? []).length} devices registered`}
        actions={
          <>
            <button onClick={() => setScanMode(!scanMode)} className={cn('btn-secondary', scanMode && 'bg-blue-600 text-white')}>
              <ScanLine className="h-4 w-4" /> Scan
            </button>
            <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary">
              <Plus className="h-4 w-4" /> Add Device
            </button>
          </>
        }
      />

      {scanMode && (
        <div className="card flex items-center gap-3 p-4 animate-slide-up">
          <ScanLine className="h-5 w-5 text-blue-400 animate-pulse" />
          <input
            autoFocus
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            placeholder="Scan or enter barcode / NFC tag / inventory number..."
            className="input flex-1"
          />
          <button onClick={handleScan} className="btn-primary">Find</button>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-800 overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn('tab whitespace-nowrap', tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200')}
          >
            <t.icon className="mr-1.5 inline h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'devices' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, inventory #, barcode, NFC, serial..." className="input pl-10" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="select w-auto">
              <option value="all">All Status</option>
              {(Object.keys(DEVICE_STATUS_META) as DeviceStatus[]).map((s) => (
                <option key={s} value={s}>{DEVICE_STATUS_META[s].label}</option>
              ))}
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="select w-auto">
              <option value="all">All Categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="card overflow-hidden">
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/50">
                  <tr>
                    <th className="table-header">Device</th>
                    <th className="table-header">Inv. Number</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Tracking</th>
                    <th className="table-header">Location</th>
                    <th className="table-header">Value</th>
                    <th className="table-header">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7}><EmptyState icon={Package} title="No devices found" message="Add a device or adjust your filters" /></td></tr>
                  ) : (
                    filtered.map((device) => (
                      <tr key={device.id} className="hover:bg-slate-800/30 cursor-pointer" onClick={() => setSelected(device)}>
                        <td className="table-cell">
                          <div className="font-medium text-slate-200">{device.name}</div>
                          <div className="text-xs text-slate-500">{device.category?.name ?? 'Uncategorized'} · {device.manufacturer ?? '—'}</div>
                        </td>
                        <td className="table-cell font-mono text-xs">{device.inventory_number}</td>
                        <td className="table-cell">
                          <span className={cn('badge', DEVICE_STATUS_META[device.status].bg, DEVICE_STATUS_META[device.status].color)}>
                            <span className={cn('status-dot', DEVICE_STATUS_META[device.status].dot)} />
                            {DEVICE_STATUS_META[device.status].label}
                          </span>
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center gap-1.5">
                            {device.tracking_method === 'nfc' ? <Tag className="h-3.5 w-3.5 text-cyan-400" /> : <QrCode className="h-3.5 w-3.5 text-blue-400" />}
                            <span className="text-xs">{device.tracking_method.toUpperCase()}</span>
                            {device.is_high_value && <span className="badge bg-amber-500/15 border-amber-500/30 text-amber-300 text-[10px]">High Value</span>}
                          </div>
                        </td>
                        <td className="table-cell text-xs text-slate-400">{device.room?.name ?? '—'}</td>
                        <td className="table-cell">{device.value > 0 ? formatCurrency(device.value) : '—'}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => setShowLabel(device)} className="btn-icon" title="Print label"><Printer className="h-4 w-4" /></button>
                            <button onClick={() => { setEditing(device); setShowForm(true); }} className="btn-icon" title="Edit"><Edit className="h-4 w-4" /></button>
                            {profile?.role === 'admin' && <button onClick={() => { setSelected(device); deleteModal.openModal(); }} className="btn-icon text-red-400" title="Delete"><Trash2 className="h-4 w-4" /></button>}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'storage' && <StorageMapTab devices={devices ?? []} rooms={rooms ?? []} onSelectDevice={(d) => setShowStorage(d)} />}
      {tab === 'audits' && <AuditsTab devices={devices ?? []} />}
      {tab === 'consumables' && <ConsumablesTab />}
      {tab === 'damage' && <DamageReportsTab devices={devices ?? []} />}
      {tab === 'repairs' && <RepairsTab />}

      {/* Device detail */}
      {selected && !showForm && (
        <DeviceDetailModal
          device={selected}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setShowForm(true); setSelected(null); }}
          onPrintLabel={() => setShowLabel(selected)}
          onViewStorage={() => setShowStorage(selected)}
        />
      )}

      {/* Add/edit form */}
      {showForm && (
        <DeviceFormModal
          device={editing}
          categories={categories}
          rooms={rooms ?? []}
          existingCount={(devices ?? []).length}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); refresh(); }}
        />
      )}

      {/* Label printing */}
      {showLabel && <LabelPrintModal device={showLabel} onClose={() => setShowLabel(null)} />}

      {/* Storage view */}
      {showStorage && <StorageViewModal device={showStorage} onClose={() => setShowStorage(null)} />}

      <ConfirmDialog
        open={deleteModal.open}
        onClose={deleteModal.closeModal}
        onConfirm={handleDelete}
        title="Delete Device"
        message={`Are you sure you want to delete "${selected?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

// ===== Storage Map Tab =====
function StorageMapTab({ devices, rooms, onSelectDevice }: { devices: Device[]; rooms: Room[]; onSelectDevice: (d: Device) => void }) {
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [cabinets, setCabinets] = useState<Cabinet[]>([]);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [selectedCabinet, setSelectedCabinet] = useState<Cabinet | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCabinets = async (roomId: string) => {
    setLoading(true);
    let q = supabase.from('cabinets').select('*, room:rooms(*)');
    if (roomId !== 'all') q = q.eq('room_id', roomId);
    const { data } = await q.order('code');
    setCabinets((data ?? []) as Cabinet[]);
    setLoading(false);
  };

  useEffect(() => { loadCabinets(selectedRoom); }, [selectedRoom]);

  const loadShelves = async (cabinet: Cabinet) => {
    setSelectedCabinet(cabinet);
    const { data } = await supabase.from('shelves').select('*').eq('cabinet_id', cabinet.id).order('row_index').order('col_index');
    setShelves((data ?? []) as Shelf[]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)} className="select w-auto">
          <option value="all">All Rooms</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.room_number})</option>)}
        </select>
        {selectedCabinet && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <ChevronRight className="h-4 w-4" />
            <span>Cabinet {selectedCabinet.code}</span>
            <span className="badge bg-blue-500/15 border-blue-500/30 text-blue-300">{selectedCabinet.rows}×{selectedCabinet.columns}</span>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">Cabinets</h3>
          {loading ? <LoadingScreen message="Loading cabinets..." /> : cabinets.length === 0 ? (
            <EmptyState icon={MapPin} title="No cabinets" message="Add cabinets in room settings" />
          ) : (
            <div className="space-y-2">
              {cabinets.map((c) => {
                const count = devices.filter((d) => d.cabinet_id === c.id).length;
                return (
                  <button
                    key={c.id}
                    onClick={() => loadShelves(c)}
                    className={cn('flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors',
                      selectedCabinet?.id === c.id ? 'border-blue-500 bg-blue-600/10' : 'border-slate-800 hover:bg-slate-800/30')}
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-200">{c.label}</div>
                      <div className="text-xs text-slate-500">{c.room?.name ?? 'No room'}</div>
                    </div>
                    <span className="badge bg-slate-700/50 text-slate-300 border-slate-700">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-4">
          {selectedCabinet ? (
            <div>
              <h3 className="mb-4 text-sm font-semibold text-slate-200">Shelf Layout — {selectedCabinet.label}</h3>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${selectedCabinet.columns}, minmax(0, 1fr))` }}>
                {Array.from({ length: selectedCabinet.rows * selectedCabinet.columns }).map((_, i) => {
                  const row = Math.floor(i / selectedCabinet.columns);
                  const col = i % selectedCabinet.columns;
                  const shelf = shelves.find((s) => s.row_index === row && s.col_index === col);
                  const deviceOnShelf = devices.find((d) => d.shelf_id === shelf?.id);
                  return (
                    <div
                      key={i}
                      className={cn(
                        'aspect-square rounded-lg border-2 p-2 transition-all',
                        deviceOnShelf ? 'border-blue-500/50 bg-blue-600/10' : 'border-slate-800 bg-slate-900/30',
                      )}
                    >
                      {deviceOnShelf ? (
                        <button onClick={() => onSelectDevice(deviceOnShelf)} className="flex h-full w-full flex-col items-center justify-center text-center">
                          <Package className="h-5 w-5 text-blue-400 mb-1" />
                          <div className="text-[10px] font-medium text-slate-200 truncate w-full">{deviceOnShelf.name}</div>
                          <div className="text-[8px] text-slate-500 font-mono">{deviceOnShelf.inventory_number}</div>
                        </button>
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-slate-600">
                          R{row} C{col}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState icon={MapPin} title="Select a cabinet" message="Choose a cabinet to view its shelf layout" />
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Audits Tab =====
function AuditsTab({ devices }: { devices: Device[] }) {
  const [audits, setAudits] = useState<InventoryAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [activeAudit, setActiveAudit] = useState<InventoryAudit | null>(null);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('inventory_audits').select('*, items:inventory_audit_items(*, device:devices(*))').order('created_at', { ascending: false });
    setAudits((data ?? []) as InventoryAudit[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startAudit = async (name: string) => {
    const { data: profile } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('inventory_audits').insert({
      name,
      started_by: profile.user?.id,
      expected_count: devices.length,
      status: 'in_progress',
    }).select().single();
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('audit.start', 'audit', data.id, { name });
    setShowNew(false);
    load();
    setActiveAudit(data as InventoryAudit);
  };

  if (activeAudit) return <AuditRunner audit={activeAudit} devices={devices} onExit={() => { setActiveAudit(null); load(); }} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Inventory Audits</h3>
        <button onClick={() => setShowNew(true)} className="btn-primary"><Plus className="h-4 w-4" /> New Audit</button>
      </div>

      {loading ? <LoadingScreen message="Loading audits..." /> : audits.length === 0 ? (
        <div className="card"><EmptyState icon={ClipboardCheck} title="No audits yet" message="Start an audit to compare expected vs actual inventory" /></div>
      ) : (
        <div className="space-y-3">
          {audits.map((audit) => (
            <div key={audit.id} className="card card-hover p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-200">{audit.name}</div>
                  <div className="text-xs text-slate-500">Started {formatDate(audit.started_at)} · {audit.expected_count} expected</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Found: {audit.actual_count}/{audit.expected_count}</div>
                    <div className="text-xs text-red-400">Missing: {audit.missing_count}</div>
                  </div>
                  {audit.status === 'in_progress' && <button onClick={() => setActiveAudit(audit)} className="btn-secondary">Continue</button>}
                  {audit.status === 'completed' && <button onClick={() => setActiveAudit(audit)} className="btn-ghost"><Eye className="h-4 w-4" /> View</button>}
                </div>
              </div>
              {audit.risk_level !== 'none' && audit.status === 'completed' && (
                <div className={cn('mt-3 rounded-lg px-3 py-2 text-xs', audit.risk_level === 'high' ? 'bg-red-500/15' : audit.risk_level === 'medium' ? 'bg-amber-500/15' : 'bg-blue-500/15')}>
                  <strong>Risk: {audit.risk_level.toUpperCase()}</strong> — {audit.risk_notes ?? 'See audit items for details'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <Modal open onClose={() => setShowNew(false)} title="Start New Audit" size="sm"
          footer={<><button className="btn-secondary" onClick={() => setShowNew(false)}>Cancel</button><button className="btn-primary" onClick={() => startAudit(`Audit ${formatDate(new Date())}`)}>Start</button></>}>
          <p className="text-sm text-slate-300">This will create a new audit session comparing {devices.length} expected devices against scanned inventory. You can scan devices to mark them as present.</p>
        </Modal>
      )}
    </div>
  );
}

function AuditRunner({ audit, devices, onExit }: { audit: InventoryAudit; devices: Device[]; onExit: () => void }) {
  const [scanned, setScanned] = useState<string[]>(audit.items?.filter((i) => i.item_status === 'present').map((i) => i.device_id).filter(Boolean) as string[] ?? []);
  const [scanInput, setScanInput] = useState('');
  const [items, setItems] = useState(audit.items ?? []);
  const toast = useToast();

  const handleScan = async () => {
    if (!scanInput.trim()) return;
    const device = devices.find((d) => d.barcode === scanInput || d.nfc_tag_id === scanInput || d.inventory_number === scanInput || d.qr_code === scanInput);
    if (!device) { toast('Device not found in inventory', 'error'); setScanInput(''); return; }
    if (scanned.includes(device.id)) { toast('Already scanned', 'info'); setScanInput(''); return; }

    const { data: profile } = await supabase.auth.getUser();
    await supabase.from('inventory_audit_items').insert({
      audit_id: audit.id,
      device_id: device.id,
      inventory_number: device.inventory_number,
      expected_status: device.status,
      actual_status: device.status,
      item_status: 'present',
      scanned_at: new Date().toISOString(),
      scanned_by: profile.user?.id,
    });
    setScanned([...scanned, device.id]);
    setItems([...items, { id: crypto.randomUUID(), audit_id: audit.id, device_id: device.id, inventory_number: device.inventory_number, expected_status: device.status, actual_status: device.status, item_status: 'present', scanned_at: new Date().toISOString(), scanned_by: null, notes: null, created_at: new Date().toISOString(), device }]);
    toast(`${device.name} marked present`, 'success');
    setScanInput('');
  };

  const completeAudit = async () => {
    const missing = devices.filter((d) => !scanned.includes(d.id));
    const highValueMissing = missing.filter((d) => d.is_high_value);
    const risk = highValueMissing.length > 0 ? 'high' : missing.length > 5 ? 'medium' : missing.length > 0 ? 'low' : 'none';
    const riskNotes = highValueMissing.length > 0
      ? `${highValueMissing.length} high-value devices missing!`
      : missing.length > 0 ? `${missing.length} devices not found during scan` : 'All devices accounted for';

    for (const d of missing) {
      const { data: profile } = await supabase.auth.getUser();
      await supabase.from('inventory_audit_items').insert({
        audit_id: audit.id, device_id: d.id, inventory_number: d.inventory_number,
        expected_status: d.status, item_status: 'missing', notes: d.is_high_value ? 'HIGH VALUE' : null,
        scanned_by: profile.user?.id,
      });
    }

    const { error } = await supabase.from('inventory_audits').update({
      status: 'completed', actual_count: scanned.length, missing_count: missing.length,
      risk_level: risk, risk_notes: riskNotes, completed_at: new Date().toISOString(),
    }).eq('id', audit.id);

    if (error) { toast(error.message, 'error'); return; }
    await logActivity('audit.complete', 'audit', audit.id, { missing: missing.length, risk });
    toast('Audit completed', 'success');
    onExit();
  };

  const missing = devices.filter((d) => !scanned.includes(d.id));
  const report = `INVENTORY AUDIT REPORT\n========================\n\nAudit: ${audit.name}\nDate: ${formatDate(audit.started_at)}\n\nExpected: ${devices.length}\nFound: ${scanned.length}\nMissing: ${missing.length}\nRisk: ${audit.risk_level}\n\n--- Missing Devices ---\n${missing.map((d) => `${d.inventory_number} | ${d.name} | ${d.is_high_value ? 'HIGH VALUE' : 'normal'} | ${formatCurrency(d.value)}`).join('\n')}\n`;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">{audit.name}</h3>
            <div className="text-xs text-slate-400">Scanned {scanned.length} of {devices.length} · {missing.length} missing</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => downloadFile(report, `audit-${audit.id}.txt`)} className="btn-secondary"><Download className="h-4 w-4" /> Report</button>
            <button onClick={completeAudit} className="btn-primary">Complete Audit</button>
            <button onClick={onExit} className="btn-ghost">Exit</button>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full bg-emerald-400 transition-all" style={{ width: `${(scanned.length / devices.length) * 100}%` }} />
        </div>
      </div>

      <div className="card flex items-center gap-3 p-4">
        <ScanLine className="h-5 w-5 text-blue-400 animate-pulse" />
        <input autoFocus value={scanInput} onChange={(e) => setScanInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleScan()} placeholder="Scan device to mark present..." className="input flex-1" />
        <button onClick={handleScan} className="btn-primary">Scan</button>
      </div>

      {missing.length > 0 && (
        <div className="card">
          <div className="border-b border-slate-800 px-4 py-2 text-sm font-semibold text-red-300">Missing Devices ({missing.length})</div>
          <div className="scrollbar-thin max-h-60 overflow-y-auto">
            {missing.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-4 py-2 border-b border-slate-800/50">
                <div>
                  <span className="text-sm text-slate-200">{d.name}</span>
                  <span className="ml-2 text-xs text-slate-500 font-mono">{d.inventory_number}</span>
                </div>
                <div className="flex items-center gap-2">
                  {d.is_high_value && <span className="badge bg-amber-500/15 border-amber-500/30 text-amber-300 text-[10px]">High Value</span>}
                  <span className="text-xs text-slate-400">{formatCurrency(d.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Consumables Tab =====
function ConsumablesTab() {
  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Consumable | null>(null);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('consumables').select('*').order('name');
    setConsumables((data ?? []) as Consumable[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async (data: Partial<Consumable>) => {
    if (editing) {
      const { error } = await supabase.from('consumables').update(data).eq('id', editing.id);
      if (error) { toast(error.message, 'error'); return; }
      toast('Consumable updated', 'success');
    } else {
      const { error } = await supabase.from('consumables').insert(data);
      if (error) { toast(error.message, 'error'); return; }
      toast('Consumable added', 'success');
    }
    setShowForm(false); setEditing(null); load();
  };

  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    filament: Cpu, battery: Battery, tape: CassetteTape, adapter: Cable, other: Package,
  };

  if (loading) return <LoadingScreen message="Loading consumables..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Consumables & Supplies</h3>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary"><Plus className="h-4 w-4" /> Add Consumable</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {consumables.map((c) => {
          const low = c.current_stock <= c.min_stock;
          const Icon = icons[c.type] ?? Package;
          return (
            <div key={c.id} className={cn('card p-4', low && 'border-amber-500/30')}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn('rounded-lg p-2', low ? 'bg-amber-500/15' : 'bg-slate-800/50')}>
                    <Icon className={cn('h-5 w-5', low ? 'text-amber-400' : 'text-slate-400')} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-200">{c.name}</div>
                    <div className="text-xs text-slate-500 capitalize">{c.type}</div>
                  </div>
                </div>
                <button onClick={() => { setEditing(c); setShowForm(true); }} className="btn-icon"><Edit className="h-4 w-4" /></button>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-slate-100">{formatNumber(c.current_stock)}</span>
                  <span className="text-xs text-slate-500">{c.unit}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className={cn('h-full transition-all', low ? 'bg-amber-400' : 'bg-emerald-400')} style={{ width: `${Math.min(100, (c.current_stock / Math.max(c.min_stock * 3, 1)) * 100)}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Min: {c.min_stock}</span>
                  {low ? <span className="text-amber-400 font-medium">Low stock!</span> : <span className="text-emerald-400">OK</span>}
                </div>
                {low && c.reorder_link && (
                  <a href={c.reorder_link} target="_blank" rel="noreferrer" className="btn-secondary mt-3 w-full text-xs">Reorder now</a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {consumables.length === 0 && <div className="card"><EmptyState icon={Boxes} title="No consumables" message="Add filament, batteries, tape, adapters and more" /></div>}

      {showForm && <ConsumableFormModal consumable={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSave={save} />}
    </div>
  );
}

function ConsumableFormModal({ consumable, onClose, onSave }: { consumable: Consumable | null; onClose: () => void; onSave: (d: Partial<Consumable>) => void }) {
  const [name, setName] = useState(consumable?.name ?? '');
  const [type, setType] = useState(consumable?.type ?? 'other');
  const [unit, setUnit] = useState(consumable?.unit ?? 'pcs');
  const [currentStock, setCurrentStock] = useState(consumable?.current_stock ?? 0);
  const [minStock, setMinStock] = useState(consumable?.min_stock ?? 0);
  const [reorderQty, setReorderQty] = useState(consumable?.reorder_qty ?? 0);
  const [reorderLink, setReorderLink] = useState(consumable?.reorder_link ?? '');

  return (
    <Modal open onClose={onClose} title={consumable ? 'Edit Consumable' : 'Add Consumable'} size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave({ name, type, unit, current_stock: currentStock, min_stock: minStock, reorder_qty: reorderQty, reorder_link: reorderLink })}>Save</button></>}>
      <div className="space-y-4">
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PLA Filament Black" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Type</label>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="filament">Filament</option><option value="battery">Battery</option>
              <option value="tape">Gaffa Tape</option><option value="adapter">Adapter</option><option value="other">Other</option>
            </select>
          </div>
          <div><label className="label">Unit</label><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs, kg, m" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="label">Current Stock</label><input type="number" className="input" value={currentStock} onChange={(e) => setCurrentStock(Number(e.target.value))} /></div>
          <div><label className="label">Min Stock</label><input type="number" className="input" value={minStock} onChange={(e) => setMinStock(Number(e.target.value))} /></div>
          <div><label className="label">Reorder Qty</label><input type="number" className="input" value={reorderQty} onChange={(e) => setReorderQty(Number(e.target.value))} /></div>
        </div>
        <div><label className="label">Reorder Link</label><input className="input" value={reorderLink} onChange={(e) => setReorderLink(e.target.value)} placeholder="https://..." /></div>
      </div>
    </Modal>
  );
}

// ===== Damage Reports Tab =====
function DamageReportsTab({ devices }: { devices: Device[] }) {
  const [reports, setReports] = useState<DamageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('damage_reports').select('*, device:devices(*), reporter:profiles(*)').order('created_at', { ascending: false });
    setReports((data ?? []) as DamageReport[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createRepair = async (report: DamageReport) => {
    const { data: profile } = await supabase.auth.getUser();
    const { error } = await supabase.from('repair_records').insert({
      device_id: report.device_id,
      damage_report_id: report.id,
      reported_by: profile.user?.id,
      issue_description: report.description,
      repair_status: 'intake',
      intake_form_data: { inventory_number: report.inventory_number, serial_number: report.serial_number, photos: report.photos, severity: report.severity },
    });
    if (error) { toast(error.message, 'error'); return; }
    await supabase.from('devices').update({ status: 'maintenance' }).eq('id', report.device_id);
    toast('Repair intake created and device set to maintenance', 'success');
    load();
  };

  if (loading) return <LoadingScreen message="Loading damage reports..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Damage Reports</h3>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="h-4 w-4" /> Report Damage</button>
      </div>

      {reports.length === 0 ? <div className="card"><EmptyState icon={AlertTriangle} title="No damage reports" /></div> : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{r.device?.name ?? 'Unknown device'}</span>
                    <span className="badge bg-slate-700/50 text-slate-300 border-slate-700 capitalize">{r.severity}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{r.description}</p>
                  <div className="mt-1.5 text-xs text-slate-500">
                    Inv: {r.inventory_number ?? '—'} · SN: {r.serial_number ?? '—'} · {formatDate(r.created_at)}
                  </div>
                  {r.photos.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {r.photos.slice(0, 4).map((url, i) => <img key={i} src={url} alt={`Damage ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border border-slate-700" />)}
                    </div>
                  )}
                </div>
                <button onClick={() => createRepair(r)} className="btn-secondary"><Wrench className="h-4 w-4" /> Create Repair</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <DamageFormModal devices={devices} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}

function DamageFormModal({ devices, onClose, onSaved }: { devices: Device[]; onClose: () => void; onSaved: () => void }) {
  const [deviceId, setDeviceId] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [photos, setPhotos] = useState<string[]>([]);
  const toast = useToast();

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).slice(0, 4).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPhotos((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const save = async () => {
    const device = devices.find((d) => d.id === deviceId);
    if (!device || !description) { toast('Select device and describe the damage', 'error'); return; }
    const { data: profile } = await supabase.auth.getUser();
    const { error } = await supabase.from('damage_reports').insert({
      device_id: deviceId, reported_by: profile.user?.id, inventory_number: device.inventory_number,
      serial_number: device.serial_number, description, photos, severity,
    });
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('damage.report', 'device', deviceId, { description });
    toast('Damage report filed', 'success');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Report Device Damage" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Submit Report</button></>}>
      <div className="space-y-4">
        <div><label className="label">Device</label>
          <select className="select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">Select device...</option>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.inventory_number})</option>)}
          </select>
        </div>
        <div><label className="label">Description</label><textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the damage..." /></div>
        <div><label className="label">Severity</label>
          <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="minor">Minor</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
          </select>
        </div>
        <div><label className="label">Photos (max 4)</label>
          <div className="flex items-center gap-3">
            <label className="btn-secondary cursor-pointer">
              <Camera className="h-4 w-4" /> Upload
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhoto} />
            </label>
            {photos.map((p, i) => <img key={i} src={p} alt="" className="h-16 w-16 rounded-lg object-cover border border-slate-700" />)}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ===== Repairs Tab =====
function RepairsTab() {
  const [repairs, setRepairs] = useState<RepairRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('repair_records').select('*, device:devices(*)').order('created_at', { ascending: false });
    setRepairs((data ?? []) as RepairRecord[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    const updates: Record<string, unknown> = { repair_status: status };
    if (status === 'resolved') { updates.resolved_at = new Date().toISOString(); }
    const { error } = await supabase.from('repair_records').update(updates).eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    if (status === 'resolved') {
      const repair = repairs.find((r) => r.id === id);
      if (repair) await supabase.from('devices').update({ status: 'available', condition: 'good' }).eq('id', repair.device_id);
    }
    toast('Repair status updated', 'success');
    load();
  };

  const printIntake = (repair: RepairRecord) => {
    const html = `<html><head><style>body{font-family:Arial;margin:40px;color:#333}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:20px}td{padding:8px;border:1px solid #ddd}.header{text-align:center;border-bottom:2px solid #333;padding-bottom:10px}</style></head><body>
    <div class="header"><h1>Repair Intake Form</h1><p>School TEC Hub</p></div>
    <table><tr><td><strong>Device</strong></td><td>${repair.device?.name ?? '—'}</td></tr>
    <tr><td><strong>Inventory #</strong></td><td>${repair.device?.inventory_number ?? '—'}</td></tr>
    <tr><td><strong>Serial #</strong></td><td>${repair.device?.serial_number ?? '—'}</td></tr>
    <tr><td><strong>Issue</strong></td><td>${repair.issue_description}</td></tr>
    <tr><td><strong>Date</strong></td><td>${formatDate(repair.created_at)}</td></tr>
    <tr><td><strong>Status</strong></td><td>${repair.repair_status}</td></tr>
    <tr><td><strong>Cost</strong></td><td>${formatCurrency(repair.cost)}</td></tr></table>
    <p style="margin-top:30px">Signature: ______________________________</p>
    </body></html>`;
    printHtml(html);
  };

  if (loading) return <LoadingScreen message="Loading repairs..." />;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-200">Repair Records</h3>
      {repairs.length === 0 ? <div className="card"><EmptyState icon={Wrench} title="No repair records" /></div> : (
        <div className="space-y-3">
          {repairs.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{r.device?.name ?? 'Unknown'}</span>
                    <span className="badge bg-slate-700/50 text-slate-300 border-slate-700 capitalize">{r.repair_status}</span>
                    {r.is_recurring && <span className="badge bg-amber-500/15 border-amber-500/30 text-amber-300">Recurring</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{r.issue_description}</p>
                  <div className="mt-1.5 text-xs text-slate-500">{formatDate(r.created_at)} · Cost: {formatCurrency(r.cost)}</div>
                  {r.resolution && <div className="mt-2 rounded-lg bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-300">Resolved: {r.resolution}</div>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button onClick={() => printIntake(r)} className="btn-ghost"><FileText className="h-4 w-4" /> Print Intake</button>
                  {r.repair_status !== 'resolved' && (
                    <select className="select w-auto text-xs" value={r.repair_status} onChange={(e) => updateStatus(r.id, e.target.value)}>
                      <option value="intake">Intake</option><option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option><option value="written_off">Written Off</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Device Detail Modal =====
function DeviceDetailModal({ device, onClose, onEdit, onPrintLabel, onViewStorage }: {
  device: Device; onClose: () => void; onEdit: () => void; onPrintLabel: () => void; onViewStorage: () => void;
}) {
  const [notes, setNotes] = useState<DeviceNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const toast = useToast();

  useEffect(() => {
    supabase.from('device_notes').select('*, author:profiles(*)').eq('device_id', device.id).order('created_at', { ascending: false }).then(({ data }) => {
      setNotes((data ?? []) as DeviceNote[]);
    });
  }, [device.id]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    const { data: profile } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('device_notes').insert({ device_id: device.id, author_id: profile.user?.id, note: newNote }).select('*, author:profiles(*)').single();
    if (error) { toast(error.message, 'error'); return; }
    setNotes([data as DeviceNote, ...notes]);
    setNewNote('');
  };

  return (
    <Modal open onClose={onClose} title={device.name} size="lg"
      footer={<><button className="btn-secondary" onClick={onViewStorage}><MapPin className="h-4 w-4" /> View Storage</button><button className="btn-secondary" onClick={onPrintLabel}><Printer className="h-4 w-4" /> Print Label</button><button className="btn-primary" onClick={onEdit}><Edit className="h-4 w-4" /> Edit</button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-3"><div className="text-xs text-slate-500">Inventory Number</div><div className="font-mono text-sm text-slate-200">{device.inventory_number}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Status</div><span className={cn('badge', DEVICE_STATUS_META[device.status].bg, DEVICE_STATUS_META[device.status].color)}>{DEVICE_STATUS_META[device.status].label}</span></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Category</div><div className="text-sm text-slate-200">{device.category?.name ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Condition</div><div className={cn('text-sm', CONDITION_META[device.condition].color)}>{CONDITION_META[device.condition].label}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Manufacturer</div><div className="text-sm text-slate-200">{device.manufacturer ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Model</div><div className="text-sm text-slate-200">{device.model ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Serial Number</div><div className="text-sm text-slate-200">{device.serial_number ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Value</div><div className="text-sm text-slate-200">{device.value > 0 ? formatCurrency(device.value) : '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Tracking Method</div><div className="text-sm text-slate-200">{device.tracking_method.toUpperCase()}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Room</div><div className="text-sm text-slate-200">{device.room?.name ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Barcode</div><div className="font-mono text-xs text-slate-200">{device.barcode ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">NFC Tag</div><div className="font-mono text-xs text-slate-200">{device.nfc_tag_id ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Purchase Date</div><div className="text-sm text-slate-200">{formatDate(device.purchase_date)}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Warranty Until</div><div className="text-sm text-slate-200">{formatDate(device.warranty_until)}</div></div>
        </div>

        {device.notes && <div className="card p-3"><div className="text-xs text-slate-500">Notes</div><div className="text-sm text-slate-300">{device.notes}</div></div>}

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-200">Internal Notes</h4>
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="card p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">{n.author?.full_name ?? 'Unknown'}</span>
                  <span className="text-[10px] text-slate-500">{formatDate(n.created_at)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-400">{n.note}</p>
              </div>
            ))}
            {notes.length === 0 && <p className="text-xs text-slate-500">No notes yet</p>}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="input" value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} placeholder="Add internal note..." />
            <button onClick={addNote} className="btn-secondary">Add</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ===== Storage View Modal (Visual Storage Assistant) =====
function StorageViewModal({ device, onClose }: { device: Device; onClose: () => void }) {
  const [cabinet, setCabinet] = useState<Cabinet | null>(null);
  const [shelves, setShelves] = useState<Shelf[]>([]);

  useEffect(() => {
    if (!device.cabinet_id) return;
    supabase.from('cabinets').select('*').eq('id', device.cabinet_id).single().then(({ data }) => setCabinet(data as Cabinet | null));
    supabase.from('shelves').select('*').eq('cabinet_id', device.cabinet_id).order('row_index').order('col_index').then(({ data }) => setShelves((data ?? []) as Shelf[]));
  }, [device.cabinet_id]);

  const shelf = shelves.find((s) => s.id === device.shelf_id);

  return (
    <Modal open onClose={onClose} title="Storage Location" size="md">
      <div className="space-y-4">
        <div className="card p-4 text-center">
          <Package className="mx-auto h-8 w-8 text-blue-400 mb-2" />
          <div className="text-sm font-medium text-slate-200">{device.name}</div>
          <div className="font-mono text-xs text-slate-500">{device.inventory_number}</div>
        </div>

        {cabinet ? (
          <div className="card p-4">
            <div className="mb-3 text-sm text-slate-300">
              Located in <strong className="text-blue-400">{cabinet.label}</strong>
              {shelf && <> at position <strong className="text-blue-400">Row {shelf.row_index + 1}, Column {shelf.col_index + 1}</strong></>}
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cabinet.columns}, minmax(0, 1fr))` }}>
              {Array.from({ length: cabinet.rows * cabinet.columns }).map((_, i) => {
                const row = Math.floor(i / cabinet.columns);
                const col = i % cabinet.columns;
                const isTarget = shelf && shelf.row_index === row && shelf.col_index === col;
                return (
                  <div key={i} className={cn('aspect-square rounded-lg border-2 flex items-center justify-center transition-all', isTarget ? 'border-emerald-500 bg-emerald-500/20 animate-pulse' : 'border-slate-800 bg-slate-900/30')}>
                    {isTarget && <Package className="h-6 w-6 text-emerald-400" />}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card p-4 text-center text-sm text-slate-500">No storage location assigned. Edit the device to assign a cabinet and shelf.</div>
        )}
      </div>
    </Modal>
  );
}

// ===== Label Print Modal =====
function LabelPrintModal({ device, onClose }: { device: Device; onClose: () => void }) {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [barcodeUrl, setBarcodeUrl] = useState<string>('');

  useEffect(() => {
    generateDeviceLabel(device).then(({ qrUrl, barcodeUrl }) => { setQrUrl(qrUrl); setBarcodeUrl(barcodeUrl); });
  }, [device]);

  const handlePrint = () => {
    generateDeviceLabel(device).then(({ html }) => printHtml(html));
  };

  return (
    <Modal open onClose={onClose} title="Device Label" size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" onClick={handlePrint}><Printer className="h-4 w-4" /> Print</button></>}>
      <div className="space-y-4">
        <div className="card p-4 text-center">
          <div className="text-sm font-medium text-slate-200">{device.name}</div>
          <div className="font-mono text-xs text-slate-500">{device.inventory_number}</div>
        </div>
        <div className="flex justify-center gap-4">
          <div className="text-center">
            {qrUrl && <img src={qrUrl} alt="QR Code" className="rounded-lg border border-slate-700" />}
            <div className="mt-1 text-xs text-slate-500">QR Code</div>
          </div>
          <div className="text-center">
            {barcodeUrl && <img src={barcodeUrl} alt="Barcode" className="rounded-lg border border-slate-700" />}
            <div className="mt-1 text-xs text-slate-500">Barcode</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ===== Device Form Modal =====
function DeviceFormModal({ device, categories, rooms, existingCount, onClose, onSaved }: {
  device: Device | null; categories: InventoryCategory[]; rooms: Room[]; existingCount: number; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(device?.name ?? '');
  const [categoryId, setCategoryId] = useState(device?.category_id ?? '');
  const [manufacturer, setManufacturer] = useState(device?.manufacturer ?? '');
  const [model, setModel] = useState(device?.model ?? '');
  const [serialNumber, setSerialNumber] = useState(device?.serial_number ?? '');
  const [status, setStatus] = useState<DeviceStatus>(device?.status ?? 'available');
  const [trackingMethod, setTrackingMethod] = useState<TrackingMethod>(device?.tracking_method ?? 'barcode');
  const [value, setValue] = useState(device?.value ?? 0);
  const [isHighValue, setIsHighValue] = useState(device?.is_high_value ?? false);
  const [roomId, setRoomId] = useState(device?.room_id ?? '');
  const [notes, setNotes] = useState(device?.notes ?? '');
  const [condition, setCondition] = useState<ConditionRating>(device?.condition ?? 'good');
  const toast = useToast();

  const handleSave = async () => {
    if (!name) { toast('Device name is required', 'error'); return; }
    const category = categories.find((c) => c.id === categoryId);
    const prefix = category?.name.slice(0, 3).toUpperCase() ?? 'DEV';
    const inventoryNumber = device?.inventory_number ?? generateInventoryNumber(prefix, existingCount);
    const barcode = device?.barcode ?? generateBarcodeValue(prefix);
    const nfcTagId = trackingMethod === 'nfc' ? (device?.nfc_tag_id ?? generateNfcTagId()) : null;
    const qrCode = device?.qr_code ?? inventoryNumber;

    const data: Record<string, unknown> = {
      name, inventory_number: inventoryNumber, category_id: categoryId || null,
      manufacturer: manufacturer || null, model: model || null, serial_number: serialNumber || null,
      status, tracking_method: trackingMethod, barcode, nfc_tag_id: nfcTagId, qr_code: qrCode,
      value, is_high_value: isHighValue, room_id: roomId || null, notes: notes || null, condition,
    };

    if (device) {
      const { error } = await supabase.from('devices').update(data).eq('id', device.id);
      if (error) { toast(error.message, 'error'); return; }
      await logActivity('device.update', 'device', device.id, { name });
      toast('Device updated', 'success');
    } else {
      const { error } = await supabase.from('devices').insert(data);
      if (error) { toast(error.message, 'error'); return; }
      await logActivity('device.create', 'device', undefined, { name, inventoryNumber });
      toast('Device added', 'success');
    }
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={device ? 'Edit Device' : 'Add Device'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={handleSave}>Save</button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Beamer Epson EB-X51" /></div>
          <div><label className="label">Category</label>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Select...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="label">Manufacturer</label><input className="input" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} /></div>
          <div><label className="label">Model</label><input className="input" value={model} onChange={(e) => setModel(e.target.value)} /></div>
          <div><label className="label">Serial Number</label><input className="input" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="label">Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as DeviceStatus)}>
              {(Object.keys(DEVICE_STATUS_META) as DeviceStatus[]).map((s) => <option key={s} value={s}>{DEVICE_STATUS_META[s].label}</option>)}
            </select>
          </div>
          <div><label className="label">Condition</label>
            <select className="select" value={condition} onChange={(e) => setCondition(e.target.value as ConditionRating)}>
              {(Object.keys(CONDITION_META) as ConditionRating[]).map((c) => <option key={c} value={c}>{CONDITION_META[c].label}</option>)}
            </select>
          </div>
          <div><label className="label">Value (EUR)</label><input type="number" className="input" value={value} onChange={(e) => setValue(Number(e.target.value))} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Tracking Method</label>
            <select className="select" value={trackingMethod} onChange={(e) => setTrackingMethod(e.target.value as TrackingMethod)}>
              <option value="barcode">Barcode (standard devices)</option>
              <option value="nfc">NFC (high-value devices)</option>
            </select>
          </div>
          <div><label className="label">Room</label>
            <select className="select" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">No room</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.room_number})</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="highValue" checked={isHighValue} onChange={(e) => setIsHighValue(e.target.checked)} className="rounded" />
          <label htmlFor="highValue" className="text-sm text-slate-300">High-value device (requires NFC tracking)</label>
        </div>
        <div><label className="label">Notes</label><textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        {!device && (
          <div className="rounded-lg bg-blue-950/30 border border-blue-500/20 px-3 py-2 text-xs text-blue-300">
            Inventory number, barcode, NFC tag ID, and QR code will be auto-generated on save.
          </div>
        )}
      </div>
    </Modal>
  );
}

// Types needed for inline imports
import type { DeviceNote, InventoryAudit } from '@/lib/types';
