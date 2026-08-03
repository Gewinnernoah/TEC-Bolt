import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Package, Plus, Search, QrCode, Tag, MapPin, Wrench, AlertTriangle,
  Boxes, ClipboardCheck, Printer, Eye, Edit, Trash2, ScanLine,
  Battery, CassetteTape, Cable, Cpu, Download, ChevronRight, Camera, FileText,
  Layers, MessageSquare, Clock, X, Send, Lock, Zap,
} from 'lucide-react';
import { supabase } from '@/lib/database';
import { useAuth } from '@/lib/auth';
import { useDevices, useRooms } from '@/lib/hooks';
import { DEVICE_STATUS_META, CONDITION_META } from '@/lib/constants';
import { cn, formatCurrency, formatDate, formatNumber, logActivity, printHtml, downloadFile } from '@/lib/utils';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { Modal, ConfirmDialog, useModal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { generateDeviceLabel, generateBarcodeValue, generateNfcTagId, generateInventoryNumber, generateQRCodeDataUrl, generateBarcodeDataUrl } from '@/lib/qr';
import type { Device, DeviceStatus, TrackingMethod, ConditionRating, InventoryCategory, Room, Cabinet, Shelf, Consumable, DamageReport, RepairRecord } from '@/lib/types';
import type { DeviceNote, InventoryAudit, RepairComment } from '@/lib/types';

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
  const [showBulk, setShowBulk] = useState(false);
  const [showLabel, setShowLabel] = useState<Device | null>(null);
  const [showStorage, setShowStorage] = useState<Device | null>(null);
  const [scanMode, setScanMode] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const toast = useToast();
  const deleteModal = useModal();

  useEffect(() => {
    supabase.from('inventory_categories').select('*').order('sort_order').then(({ data }: any) => {
      if (data) setCategories(data as InventoryCategory[]);
    });
  }, []);

  // Realtime: subscribe to device status changes so the list auto-updates
  // without a manual refresh. useDevices already subscribes via useLiveData,
  // but we add an explicit "devices-changes" channel to surface a toast and
  // ensure the working copy stays current for the detail/bulk modals.
  const realtimeRef = useRef<any>(null);
  useEffect(() => {
    const channel = supabase
      .channel('devices-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, (payload: any) => {
        refresh();
        if (payload.eventType === 'UPDATE' && payload.new && selected) {
          if (payload.new.id === selected.id && payload.new.status !== payload.old?.status) {
            toast(`Status aktualisiert: ${payload.new.name}`, 'info');
          }
        }
      })
      .subscribe();
    realtimeRef.current = channel;
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

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
      toast(`Gefunden: ${found.name}`, 'success');
    } else {
      toast('Kein Gerät mit diesem Code gefunden', 'error');
    }
    setScanInput('');
    setScanMode(false);
  };

  const handleDelete = async () => {
    if (!selected) return;
    const { error } = await supabase.from('devices').delete().eq('id', selected.id);
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('device.delete', 'device', selected.id, { name: selected.name });
    toast('Gerät gelöscht', 'success');
    setSelected(null);
    refresh();
  };

  if (loading) return <LoadingScreen message="Inventar wird geladen..." />;

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'devices', label: 'Geräte', icon: Package },
    { id: 'storage', label: 'Lagerkarte', icon: MapPin },
    { id: 'audits', label: 'Prüfungen', icon: ClipboardCheck },
    { id: 'consumables', label: 'Verbrauchsmaterialien', icon: Boxes },
    { id: 'damage', label: 'Schadensberichte', icon: AlertTriangle },
    { id: 'repairs', label: 'Reparaturen', icon: Wrench },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventarverwaltung"
        subtitle={`${(devices ?? []).length} Geräte registriert`}
        actions={
          <>
            <button onClick={() => setScanMode(!scanMode)} className={cn('btn-secondary', scanMode && 'bg-blue-600 text-white')}>
              <ScanLine className="h-4 w-4" /> Scannen
            </button>
            <button onClick={() => setShowBulk(true)} className="btn-secondary">
              <Layers className="h-4 w-4" /> Massen-Erfassung
            </button>
            <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary">
              <Plus className="h-4 w-4" /> Gerät hinzufügen
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
            placeholder="Barcode / NFC-Tag / Inventarnummer scannen oder eingeben..."
            className="input flex-1"
          />
          <button onClick={handleScan} className="btn-primary">Suchen</button>
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
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nach Name, Inventar-Nr., Barcode, NFC, Seriennummer suchen..." className="input pl-10" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="select w-auto">
              <option value="all">Alle Status</option>
              {(Object.keys(DEVICE_STATUS_META) as DeviceStatus[]).map((s) => (
                <option key={s} value={s}>{DEVICE_STATUS_META[s].label}</option>
              ))}
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="select w-auto">
              <option value="all">Alle Kategorien</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="card overflow-hidden">
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/50">
                  <tr>
                    <th className="table-header">Gerät</th>
                    <th className="table-header">Inv.-Nr.</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Tracking</th>
                    <th className="table-header">Standort</th>
                    <th className="table-header">Wert</th>
                    <th className="table-header">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7}><EmptyState icon={Package} title="Keine Geräte gefunden" message="Gerät hinzufügen oder Filter anpassen" /></td></tr>
                  ) : (
                    filtered.map((device) => (
                      <tr key={device.id} className="hover:bg-slate-800/30 cursor-pointer" onClick={() => setSelected(device)}>
                        <td className="table-cell">
                          <div className="font-medium text-slate-200">{device.name}</div>
                          <div className="text-xs text-slate-500">{device.category?.name ?? 'Ohne Kategorie'} · {device.manufacturer ?? '—'}</div>
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
                            {device.is_high_value && <span className="badge bg-amber-500/15 border-amber-500/30 text-amber-300 text-[10px]">Hoher Wert</span>}
                          </div>
                        </td>
                        <td className="table-cell text-xs text-slate-400">{device.room?.name ?? '—'}</td>
                        <td className="table-cell">{device.value > 0 ? formatCurrency(device.value) : '—'}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => setShowLabel(device)} className="btn-icon" title="Etikett drucken"><Printer className="h-4 w-4" /></button>
                            <button onClick={() => { setEditing(device); setShowForm(true); }} className="btn-icon" title="Bearbeiten"><Edit className="h-4 w-4" /></button>
                            {profile?.role === 'admin' && <button onClick={() => { setSelected(device); deleteModal.openModal(); }} className="btn-icon text-red-400" title="Löschen"><Trash2 className="h-4 w-4" /></button>}
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
      {tab === 'repairs' && <RepairsTab devices={devices ?? []} />}

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

      {/* Bulk creation */}
      {showBulk && (
        <BulkCreateModal
          categories={categories}
          rooms={rooms ?? []}
          existingCount={(devices ?? []).length}
          onClose={() => setShowBulk(false)}
          onSaved={() => { setShowBulk(false); refresh(); }}
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
        title="Gerät löschen"
        message={`Möchten Sie "${selected?.name}" wirklich löschen? Dies kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
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
          <option value="all">Alle Räume</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.room_number})</option>)}
        </select>
        {selectedCabinet && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <ChevronRight className="h-4 w-4" />
            <span>Schrank {selectedCabinet.code}</span>
            <span className="badge bg-blue-500/15 border-blue-500/30 text-blue-300">{selectedCabinet.rows}×{selectedCabinet.columns}</span>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">Schränke</h3>
          {loading ? <LoadingScreen message="Schränke werden geladen..." /> : cabinets.length === 0 ? (
            <EmptyState icon={MapPin} title="Keine Schränke" message="Schränke in den Raumeinstellungen hinzufügen" />
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
                      <div className="text-xs text-slate-500">{c.room?.name ?? 'Kein Raum'}</div>
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
              <h3 className="mb-4 text-sm font-semibold text-slate-200">Regal-Layout — {selectedCabinet.label}</h3>
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
            <EmptyState icon={MapPin} title="Schrank auswählen" message="Wählen Sie einen Schrank, um das Regal-Layout zu sehen" />
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
        <h3 className="text-sm font-semibold text-slate-200">Inventarprüfungen</h3>
        <button onClick={() => setShowNew(true)} className="btn-primary"><Plus className="h-4 w-4" /> Neue Prüfung</button>
      </div>

      {loading ? <LoadingScreen message="Prüfungen werden geladen..." /> : audits.length === 0 ? (
        <div className="card"><EmptyState icon={ClipboardCheck} title="Noch keine Prüfungen" message="Prüfung starten, um Soll- mit Ist-Bestand zu vergleichen" /></div>
      ) : (
        <div className="space-y-3">
          {audits.map((audit) => (
            <div key={audit.id} className="card card-hover p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-200">{audit.name}</div>
                  <div className="text-xs text-slate-500">Gestartet {formatDate(audit.started_at)} · {audit.expected_count} erwartet</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Gefunden: {audit.actual_count}/{audit.expected_count}</div>
                    <div className="text-xs text-red-400">Fehlend: {audit.missing_count}</div>
                  </div>
                  {audit.status === 'in_progress' && <button onClick={() => setActiveAudit(audit)} className="btn-secondary">Fortsetzen</button>}
                  {audit.status === 'completed' && <button onClick={() => setActiveAudit(audit)} className="btn-ghost"><Eye className="h-4 w-4" /> Ansehen</button>}
                </div>
              </div>
              {audit.risk_level !== 'none' && audit.status === 'completed' && (
                <div className={cn('mt-3 rounded-lg px-3 py-2 text-xs', audit.risk_level === 'high' ? 'bg-red-500/15' : audit.risk_level === 'medium' ? 'bg-amber-500/15' : 'bg-blue-500/15')}>
                  <strong>Risiko: {audit.risk_level.toUpperCase()}</strong> — {audit.risk_notes ?? 'Details in den Prüfungspunkten'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <Modal open onClose={() => setShowNew(false)} title="Neue Prüfung starten" size="sm"
          footer={<><button className="btn-secondary" onClick={() => setShowNew(false)}>Abbrechen</button><button className="btn-primary" onClick={() => startAudit(`Prüfung ${formatDate(new Date())}`)}>Starten</button></>}>
          <p className="text-sm text-slate-300">Dies erstellt eine neue Prüfungssession, die {devices.length} erwartete Geräte mit dem gescannten Inventar vergleicht. Sie können Geräte scannen, um sie als vorhanden zu markieren.</p>
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
    if (!device) { toast('Gerät nicht im Inventar gefunden', 'error'); setScanInput(''); return; }
    if (scanned.includes(device.id)) { toast('Bereits gescannt', 'info'); setScanInput(''); return; }

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
    toast(`${device.name} als vorhanden markiert`, 'success');
    setScanInput('');
  };

  const completeAudit = async () => {
    const missing = devices.filter((d) => !scanned.includes(d.id));
    const highValueMissing = missing.filter((d) => d.is_high_value);
    const risk = highValueMissing.length > 0 ? 'high' : missing.length > 5 ? 'medium' : missing.length > 0 ? 'low' : 'none';
    const riskNotes = highValueMissing.length > 0
      ? `${highValueMissing.length} Geräte mit hohem Wert fehlen!`
      : missing.length > 0 ? `${missing.length} Geräte beim Scan nicht gefunden` : 'Alle Geräte erfasst';

    for (const d of missing) {
      const { data: profile } = await supabase.auth.getUser();
      await supabase.from('inventory_audit_items').insert({
        audit_id: audit.id, device_id: d.id, inventory_number: d.inventory_number,
        expected_status: d.status, item_status: 'missing', notes: d.is_high_value ? 'HOHER WERT' : null,
        scanned_by: profile.user?.id,
      });
    }

    const { error } = await supabase.from('inventory_audits').update({
      status: 'completed', actual_count: scanned.length, missing_count: missing.length,
      risk_level: risk, risk_notes: riskNotes, completed_at: new Date().toISOString(),
    }).eq('id', audit.id);

    if (error) { toast(error.message, 'error'); return; }
    await logActivity('audit.complete', 'audit', audit.id, { missing: missing.length, risk });
    toast('Prüfung abgeschlossen', 'success');
    onExit();
  };

  const missing = devices.filter((d) => !scanned.includes(d.id));
  const report = `INVENTARPRÜFUNGSBERICHT\n========================\n\nPrüfung: ${audit.name}\nDatum: ${formatDate(audit.started_at)}\n\nErwartet: ${devices.length}\nGefunden: ${scanned.length}\nFehlend: ${missing.length}\nRisiko: ${audit.risk_level}\n\n--- Fehlende Geräte ---\n${missing.map((d) => `${d.inventory_number} | ${d.name} | ${d.is_high_value ? 'HOHER WERT' : 'normal'} | ${formatCurrency(d.value)}`).join('\n')}\n`;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">{audit.name}</h3>
            <div className="text-xs text-slate-400">Gescannt: {scanned.length} von {devices.length} · {missing.length} fehlend</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => downloadFile(report, `audit-${audit.id}.txt`)} className="btn-secondary"><Download className="h-4 w-4" /> Bericht</button>
            <button onClick={completeAudit} className="btn-primary">Prüfung abschließen</button>
            <button onClick={onExit} className="btn-ghost">Beenden</button>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full bg-emerald-400 transition-all" style={{ width: `${(scanned.length / devices.length) * 100}%` }} />
        </div>
      </div>

      <div className="card flex items-center gap-3 p-4">
        <ScanLine className="h-5 w-5 text-blue-400 animate-pulse" />
        <input autoFocus value={scanInput} onChange={(e) => setScanInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleScan()} placeholder="Gerät scannen, um als vorhanden zu markieren..." className="input flex-1" />
        <button onClick={handleScan} className="btn-primary">Scannen</button>
      </div>

      {missing.length > 0 && (
        <div className="card">
          <div className="border-b border-slate-800 px-4 py-2 text-sm font-semibold text-red-300">Fehlende Geräte ({missing.length})</div>
          <div className="scrollbar-thin max-h-60 overflow-y-auto">
            {missing.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-4 py-2 border-b border-slate-800/50">
                <div>
                  <span className="text-sm text-slate-200">{d.name}</span>
                  <span className="ml-2 text-xs text-slate-500 font-mono">{d.inventory_number}</span>
                </div>
                <div className="flex items-center gap-2">
                  {d.is_high_value && <span className="badge bg-amber-500/15 border-amber-500/30 text-amber-300 text-[10px]">Hoher Wert</span>}
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
      toast('Verbrauchsmaterial aktualisiert', 'success');
    } else {
      const { error } = await supabase.from('consumables').insert(data);
      if (error) { toast(error.message, 'error'); return; }
      toast('Verbrauchsmaterial hinzugefügt', 'success');
    }
    setShowForm(false); setEditing(null); load();
  };

  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    filament: Cpu, battery: Battery, tape: CassetteTape, adapter: Cable, other: Package,
  };

  if (loading) return <LoadingScreen message="Verbrauchsmaterialien werden geladen..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Verbrauchsmaterialien & Zubehör</h3>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary"><Plus className="h-4 w-4" /> Verbrauchsmaterial hinzufügen</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {consumables.map((c) => {
          const low = c.current_stock <= c.min_stock;
          // "Voll" (full) is only true when a maximum is defined and stock has
          // reached it. A max_stock of 0 means "no maximum defined".
          const hasMax = c.max_stock > 0;
          const full = hasMax && c.current_stock >= c.max_stock;
          const Icon = icons[c.type] ?? Package;
          // Progress bar should scale toward max_stock when defined, otherwise
          // toward 3× min_stock as a visual fallback.
          const progressTarget = hasMax ? c.max_stock : Math.max(c.min_stock * 3, 1);
          const progressPct = Math.min(100, (c.current_stock / progressTarget) * 100);
          return (
            <div key={c.id} className={cn('card p-4', low && 'border-amber-500/30', full && !low && 'border-emerald-500/30')}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn('rounded-lg p-2', low ? 'bg-amber-500/15' : full ? 'bg-emerald-500/15' : 'bg-slate-800/50')}>
                    <Icon className={cn('h-5 w-5', low ? 'text-amber-400' : full ? 'text-emerald-400' : 'text-slate-400')} />
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
                  <span className="text-xs text-slate-500">{c.unit}{hasMax ? ` / ${formatNumber(c.max_stock)}` : ''}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className={cn('h-full transition-all', low ? 'bg-amber-400' : full ? 'bg-emerald-400' : 'bg-emerald-400')} style={{ width: `${progressPct}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Min: {c.min_stock}{hasMax ? ` · Max: ${c.max_stock}` : ''}</span>
                  {low ? (
                    <span className="text-amber-400 font-medium">Niedriger Bestand!</span>
                  ) : full ? (
                    <span className="text-emerald-400 font-medium">Voll</span>
                  ) : (
                    <span className="text-emerald-400">OK</span>
                  )}
                </div>
                {low && c.reorder_link && (
                  <a href={c.reorder_link} target="_blank" rel="noreferrer" className="btn-secondary mt-3 w-full text-xs">Jetzt nachbestellen</a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {consumables.length === 0 && <div className="card"><EmptyState icon={Boxes} title="Keine Verbrauchsmaterialien" message="Filament, Batterien, Klebeband, Adapter und mehr hinzufügen" /></div>}

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
  const [maxStock, setMaxStock] = useState(consumable?.max_stock ?? 0);
  const [reorderQty, setReorderQty] = useState(consumable?.reorder_qty ?? 0);
  const [reorderLink, setReorderLink] = useState(consumable?.reorder_link ?? '');

  return (
    <Modal open onClose={onClose} title={consumable ? 'Verbrauchsmaterial bearbeiten' : 'Verbrauchsmaterial hinzufügen'} size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Abbrechen</button><button className="btn-primary" onClick={() => onSave({ name, type, unit, current_stock: currentStock, min_stock: minStock, max_stock: maxStock, reorder_qty: reorderQty, reorder_link: reorderLink })}>Speichern</button></>}>
      <div className="space-y-4">
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. PLA Filament Schwarz" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Typ</label>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="filament">Filament</option><option value="battery">Batterie</option>
              <option value="tape">Gaffa-Klebeband</option><option value="adapter">Adapter</option><option value="other">Sonstige</option>
            </select>
          </div>
          <div><label className="label">Einheit</label><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Stk, kg, m" /></div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div><label className="label">Akt. Bestand</label><input type="number" className="input" value={currentStock} onChange={(e) => setCurrentStock(Number(e.target.value))} /></div>
          <div><label className="label">Mindestbestand</label><input type="number" className="input" value={minStock} onChange={(e) => setMinStock(Number(e.target.value))} /></div>
          <div><label className="label">Maximalbestand</label><input type="number" className="input" value={maxStock} onChange={(e) => setMaxStock(Number(e.target.value))} placeholder="0 = keiner" /></div>
          <div><label className="label">Nachbestellmenge</label><input type="number" className="input" value={reorderQty} onChange={(e) => setReorderQty(Number(e.target.value))} /></div>
        </div>
        <div><label className="label">Nachbestell-Link</label><input className="input" value={reorderLink} onChange={(e) => setReorderLink(e.target.value)} placeholder="https://..." /></div>
      </div>
    </Modal>
  );
}

// ===== Damage Reports Tab =====
function DamageReportsTab({ devices }: { devices: Device[] }) {
  const [reports, setReports] = useState<DamageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const { profile } = useAuth();
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('damage_reports').select('*, device:devices(*), reporter:profiles(*)').order('created_at', { ascending: false });
    setReports((data ?? []) as DamageReport[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createRepair = async (report: DamageReport) => {
    if (!profile) return;
    const { error } = await supabase.from('repair_records').insert({
      device_id: report.device_id,
      damage_report_id: report.id,
      reported_by: profile.id,
      issue_description: report.description,
      repair_status: 'intake',
      intake_form_data: { inventory_number: report.inventory_number, serial_number: report.serial_number, photos: report.photos, severity: report.severity },
      maintenance_started_at: new Date().toISOString(),
    });
    if (error) { toast(error.message, 'error'); return; }
    await supabase.from('devices').update({ status: 'maintenance' }).eq('id', report.device_id);
    toast('Reparaturaufnahme erstellt und Gerät auf Wartung gesetzt', 'success');
    load();
  };

  if (loading) return <LoadingScreen message="Schadensberichte werden geladen..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Schadensberichte</h3>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="h-4 w-4" /> Schaden melden</button>
      </div>

      {reports.length === 0 ? <div className="card"><EmptyState icon={AlertTriangle} title="Keine Schadensberichte" /></div> : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{r.device?.name ?? 'Unbekanntes Gerät'}</span>
                    <span className="badge bg-slate-700/50 text-slate-300 border-slate-700 capitalize">{r.severity}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{r.description}</p>
                  <div className="mt-1.5 text-xs text-slate-500">
                    Inv: {r.inventory_number ?? '—'} · SN: {r.serial_number ?? '—'} · {formatDate(r.created_at)}
                  </div>
                  {r.photos.length > 0 && (
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {r.photos.map((url, i) => (
                        <button key={i} onClick={() => setLightboxPhoto(url)} className="cursor-zoom-in group relative" title="Klicken zum Vergrößern">
                          <img src={url} alt={`Schaden ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border border-slate-700 transition-all group-hover:border-blue-500 group-hover:ring-2 group-hover:ring-blue-500/30" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => createRepair(r)} className="btn-secondary"><Wrench className="h-4 w-4" /> Reparatur erstellen</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <DamageFormModal devices={devices} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {lightboxPhoto && <PhotoLightbox src={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />}
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
    if (!device || !description) { toast('Gerät auswählen und Schaden beschreiben', 'error'); return; }
    const { data: profile } = await supabase.auth.getUser();
    const { error } = await supabase.from('damage_reports').insert({
      device_id: deviceId, reported_by: profile.user?.id, inventory_number: device.inventory_number,
      serial_number: device.serial_number, description, photos, severity,
    });
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('damage.report', 'device', deviceId, { description });
    toast('Schadensbericht eingereicht', 'success');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Gerätschaden melden" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>Abbrechen</button><button className="btn-primary" onClick={save}>Bericht senden</button></>}>
      <div className="space-y-4">
        <div><label className="label">Gerät</label>
          <select className="select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">Gerät auswählen...</option>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.inventory_number})</option>)}
          </select>
        </div>
        <div><label className="label">Beschreibung</label><textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Schaden beschreiben..." /></div>
        <div><label className="label">Schweregrad</label>
          <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="minor">Gering</option><option value="moderate">Mittel</option><option value="severe">Schwer</option>
          </select>
        </div>
        <div><label className="label">Fotos (max 4)</label>
          <div className="flex items-center gap-3">
            <label className="btn-secondary cursor-pointer">
              <Camera className="h-4 w-4" /> Hochladen
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhoto} />
            </label>
            {photos.map((p, i) => <img key={i} src={p} alt="" className="h-16 w-16 rounded-lg object-cover border border-slate-700" />)}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ===== Photo Lightbox =====
function PhotoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors" onClick={onClose}>
        <X className="h-8 w-8" />
      </button>
      <img src={src} alt="Schadensfoto" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
      <a href={src} target="_blank" rel="noopener noreferrer" className="absolute bottom-4 right-4 text-xs text-white/60 hover:text-white underline" onClick={(e) => e.stopPropagation()}>
        In neuem Tab öffnen
      </a>
    </div>
  );
}

// ===== Maintenance Overdue Helper =====
const MAINTENANCE_OVERDUE_HOURS = 48;

function isMaintenanceOverdue(repair: RepairRecord): boolean {
  if (!repair.maintenance_started_at) return false;
  if (repair.repair_status === 'resolved' || repair.repair_status === 'written_off') return false;
  const started = new Date(repair.maintenance_started_at).getTime();
  const hoursElapsed = (Date.now() - started) / (1000 * 60 * 60);
  return hoursElapsed > MAINTENANCE_OVERDUE_HOURS;
}

// ===== Repairs Tab =====
function RepairsTab({ devices }: { devices: Device[] }) {
  const [repairs, setRepairs] = useState<RepairRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRepair, setSelectedRepair] = useState<RepairRecord | null>(null);
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const toast = useToast();

  const notifyAdminsOverdue = async (repair: RepairRecord) => {
    // Avoid duplicate notifications — check if one already exists for this repair
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('entity_type', 'repair_overdue')
      .eq('entity_id', repair.id)
      .limit(1);
    if (existing && existing.length > 0) return;

    // Find all active admin users to notify
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true);
    if (!admins || admins.length === 0) return;

    const notifications = (admins as { id: string }[]).map((admin) => ({
      user_id: admin.id,
      type: 'repair_overdue',
      title: 'Wartung überfällig',
      message: `Gerät "${repair.device?.name ?? 'Unbekannt'}" ist seit mehr als 48 Stunden in Wartung.`,
      priority: 'high',
      entity_type: 'repair_overdue',
      entity_id: repair.id,
    }));
    await supabase.from('notifications').insert(notifications);
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('repair_records').select('*, device:devices(*)').order('created_at', { ascending: false });
    const loaded = (data ?? []) as RepairRecord[];
    setRepairs(loaded);
    setLoading(false);

    // Insert overdue maintenance notifications for admins (fire-and-forget)
    loaded.filter(isMaintenanceOverdue).forEach(notifyAdminsOverdue);
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
    toast('Reparaturstatus aktualisiert', 'success');
    load();
  };

  const printIntake = (repair: RepairRecord) => {
    const html = `<html><head><style>body{font-family:Arial;margin:40px;color:#333}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:20px}td{padding:8px;border:1px solid #ddd}.header{text-align:center;border-bottom:2px solid #333;padding-bottom:10px}</style></head><body>
    <div class="header"><h1>Reparaturaufnahme-Formular</h1><p>School TEC Hub</p></div>
    <table><tr><td><strong>Gerät</strong></td><td>${repair.device?.name ?? '—'}</td></tr>
    <tr><td><strong>Inventar-Nr.</strong></td><td>${repair.device?.inventory_number ?? '—'}</td></tr>
    <tr><td><strong>Serien-Nr.</strong></td><td>${repair.device?.serial_number ?? '—'}</td></tr>
    <tr><td><strong>Problem</strong></td><td>${repair.issue_description}</td></tr>
    <tr><td><strong>Datum</strong></td><td>${formatDate(repair.created_at)}</td></tr>
    <tr><td><strong>Status</strong></td><td>${repair.repair_status}</td></tr>
    <tr><td><strong>Kosten</strong></td><td>${formatCurrency(repair.cost)}</td></tr></table>
    <p style="margin-top:30px">Unterschrift: ______________________________</p>
    </body></html>`;
    printHtml(html);
  };

  if (loading) return <LoadingScreen message="Reparaturen werden geladen..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Reparaturaufzeichnungen</h3>
        <button onClick={() => setShowIntakeForm(true)} className="btn-primary"><Plus className="h-4 w-4" /> Neue Reparatur</button>
      </div>
      {repairs.length === 0 ? <div className="card"><EmptyState icon={Wrench} title="Keine Reparaturaufzeichnungen" /></div> : (
        <div className="space-y-3">
          {repairs.map((r) => {
            const overdue = isMaintenanceOverdue(r);
            return (
            <div key={r.id} className="card p-4 cursor-pointer hover:border-blue-500/50 transition-colors" onClick={() => setSelectedRepair(r)}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-200">{r.device?.name ?? 'Unbekannt'}</span>
                    <span className="badge bg-slate-700/50 text-slate-300 border-slate-700 capitalize">{r.repair_status}</span>
                    {r.is_recurring && <span className="badge bg-amber-500/15 border-amber-500/30 text-amber-300">Wiederkehrend</span>}
                    {overdue && (
                      <span className="badge bg-red-500/15 border-red-500/30 text-red-300 inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Wartung überfällig
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{r.issue_description}</p>
                  <div className="mt-1.5 text-xs text-slate-500">
                    {formatDate(r.created_at)} · Kosten: {formatCurrency(r.cost)}
                    {r.maintenance_started_at && !overdue && r.repair_status !== 'resolved' && r.repair_status !== 'written_off' && (
                      <span className="ml-2 inline-flex items-center gap-1 text-blue-400">
                        <Clock className="h-3 w-3" /> In Wartung seit {formatDate(r.maintenance_started_at)}
                      </span>
                    )}
                  </div>
                  {r.resolution && <div className="mt-2 rounded-lg bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-300">Gelöst: {r.resolution}</div>}
                </div>
                <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => printIntake(r)} className="btn-ghost"><FileText className="h-4 w-4" /> Aufnahme drucken</button>
                  {r.repair_status !== 'resolved' && (
                    <select className="select w-auto text-xs" value={r.repair_status} onChange={(e) => updateStatus(r.id, e.target.value)}>
                      <option value="intake">Aufnahme</option><option value="in_progress">In Bearbeitung</option>
                      <option value="resolved">Gelöst</option><option value="written_off">Abgeschrieben</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          );})}
        </div>
      )}
      {selectedRepair && <RepairDetailModal repair={selectedRepair} onClose={() => setSelectedRepair(null)} onUpdated={load} />}
      {showIntakeForm && <RepairIntakeFormModal devices={devices} onClose={() => setShowIntakeForm(false)} onSaved={() => { setShowIntakeForm(false); load(); }} />}
    </div>
  );
}

// ===== Repair Detail Modal (with comments) =====
function RepairDetailModal({ repair, onClose, onUpdated }: { repair: RepairRecord; onClose: () => void; onUpdated: () => void }) {
  const { profile } = useAuth();
  const [comments, setComments] = useState<RepairComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [status, setStatus] = useState(repair.repair_status);
  const [resolution, setResolution] = useState(repair.resolution ?? '');
  const [cost, setCost] = useState(repair.cost);
  const toast = useToast();

  useEffect(() => {
    setLoadingComments(true);
    supabase
      .from('repair_comments')
      .select('*, author:profiles(*)')
      .eq('repair_id', repair.id)
      .order('created_at', { ascending: true })
      .then(({ data }: any) => {
        setComments((data ?? []) as RepairComment[]);
        setLoadingComments(false);
      });
  }, [repair.id]);

  const addComment = async () => {
    if (!newComment.trim() || !profile) return;
    const { data, error } = await supabase
      .from('repair_comments')
      .insert({
        repair_id: repair.id,
        author_id: profile.id,
        comment: newComment.trim(),
        is_internal: isInternal,
      })
      .select('*, author:profiles(*)')
      .single();
    if (error) { toast(error.message, 'error'); return; }
    setComments([...comments, data as RepairComment]);
    setNewComment('');
    setIsInternal(false);
  };

  const saveDetails = async () => {
    const updates: Record<string, unknown> = { repair_status: status, cost };
    if (status === 'resolved') {
      updates.resolved_at = new Date().toISOString();
      updates.resolution = resolution || null;
    }
    const { error } = await supabase.from('repair_records').update(updates).eq('id', repair.id);
    if (error) { toast(error.message, 'error'); return; }
    if (status === 'resolved') {
      await supabase.from('devices').update({ status: 'available', condition: 'good' }).eq('id', repair.device_id);
    }
    toast('Reparatur aktualisiert', 'success');
    onUpdated();
    onClose();
  };

  const overdue = isMaintenanceOverdue(repair);

  return (
    <Modal open onClose={onClose} title={`Reparatur: ${repair.device?.name ?? 'Unbekannt'}`} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Schließen</button><button className="btn-primary" onClick={saveDetails}>Speichern</button></>}>
      <div className="space-y-4">
        {/* Status & Maintenance Section */}
        <div className="card p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-200 flex items-center gap-2"><Wrench className="h-4 w-4" /> Reparaturstatus</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Status</label>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="intake">Aufnahme</option>
                <option value="in_progress">In Bearbeitung</option>
                <option value="resolved">Gelöst</option>
                <option value="written_off">Abgeschrieben</option>
              </select>
            </div>
            <div>
              <label className="label">Kosten (EUR)</label>
              <input type="number" className="input" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
            </div>
          </div>
          {overdue && (
            <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Wartung seit mehr als 48 Stunden überfällig!
            </div>
          )}
          {repair.maintenance_started_at && (
            <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Wartung begonnen am {formatDate(repair.maintenance_started_at)}
            </div>
          )}
          {status === 'resolved' && (
            <div className="mt-3">
              <label className="label">Lösungsbeschreibung</label>
              <textarea className="input min-h-[60px]" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Beschreiben Sie die durchgeführte Reparatur..." />
            </div>
          )}
        </div>

        {/* Issue Description */}
        <div className="card p-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-200">Problembeschreibung</h4>
          <p className="text-sm text-slate-400">{repair.issue_description}</p>
        </div>

        {/* Comments Section */}
        <div className="card p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-200 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Kommentare ({comments.length})
          </h4>
          {loadingComments ? (
            <p className="text-xs text-slate-500">Kommentare werden geladen...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-slate-500">Noch keine Kommentare</p>
          ) : (
            <div className="space-y-2 mb-3">
              {comments.map((c) => (
                <div key={c.id} className={cn('rounded-lg border px-3 py-2', c.is_internal ? 'bg-amber-950/20 border-amber-500/20' : 'bg-slate-800/30 border-slate-700')}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-300">{c.author?.full_name ?? 'Unbekannt'}</span>
                      {c.is_internal && <span className="badge bg-amber-500/15 border-amber-500/30 text-amber-300 text-[10px] inline-flex items-center gap-1"><Lock className="h-2.5 w-2.5" /> Intern</span>}
                    </div>
                    <span className="text-[10px] text-slate-500">{formatDate(c.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{c.comment}</p>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2 border-t border-slate-700 pt-3">
            <textarea className="input min-h-[60px]" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Kommentar hinzufügen..." />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded" />
                <Lock className="h-3 w-3" /> Intern (nur für Personal)
              </label>
              <button onClick={addComment} disabled={!newComment.trim()} className="btn-primary disabled:opacity-50">
                <Send className="h-4 w-4" /> Kommentar senden
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ===== Repair Intake Form Modal (improved design) =====
function RepairIntakeFormModal({ devices, onClose, onSaved }: { devices: Device[]; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [deviceId, setDeviceId] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [isRecurring, setIsRecurring] = useState(false);
  const [internalNotes, setInternalNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const save = async () => {
    if (!deviceId) { toast('Bitte ein Gerät auswählen', 'error'); return; }
    if (!issueDescription.trim()) { toast('Bitte das Problem beschreiben', 'error'); return; }
    if (!profile) { toast('Nicht angemeldet', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('repair_records').insert({
      device_id: deviceId,
      reported_by: profile.id,
      issue_description: issueDescription.trim(),
      repair_status: 'intake',
      intake_form_data: { severity, estimated_cost: estimatedCost, internal_notes: internalNotes, intake_date: new Date().toISOString() },
      cost: estimatedCost,
      is_recurring: isRecurring,
      maintenance_started_at: new Date().toISOString(),
    });
    if (error) { toast(error.message, 'error'); setSaving(false); return; }
    await supabase.from('devices').update({ status: 'maintenance' }).eq('id', deviceId);
    await logActivity('repair.create', 'device', deviceId, { issue_description: issueDescription.trim() });
    toast('Reparaturaufnahme erstellt und Gerät auf Wartung gesetzt', 'success');
    setSaving(false);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Neue Reparaturaufnahme" size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Abbrechen</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Wird gespeichert...' : 'Reparatur erstellen'}</button></>}>
      <div className="space-y-4">
        {/* Section: Gerät auswählen */}
        <div className="card p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-200 flex items-center gap-2"><Package className="h-4 w-4" /> Gerät</h4>
          <label className="label">Betroffenes Gerät *</label>
          <select className="select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">Gerät auswählen...</option>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.inventory_number})</option>)}
          </select>
          {deviceId && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
              <div>Inv-Nr: {devices.find((d) => d.id === deviceId)?.inventory_number ?? '—'}</div>
              <div>SN: {devices.find((d) => d.id === deviceId)?.serial_number ?? '—'}</div>
            </div>
          )}
        </div>

        {/* Section: Problembeschreibung */}
        <div className="card p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-200 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Problem</h4>
          <div className="space-y-3">
            <div>
              <label className="label">Problembeschreibung *</label>
              <textarea className="input min-h-[80px]" value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} placeholder="Beschreiben Sie das Problem im Detail..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Schweregrad</label>
                <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  <option value="minor">Gering</option>
                  <option value="moderate">Mittel</option>
                  <option value="severe">Schwer</option>
                </select>
              </div>
              <div>
                <label className="label">Geschätzte Kosten (EUR)</label>
                <input type="number" className="input" value={estimatedCost} onChange={(e) => setEstimatedCost(Number(e.target.value))} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="rounded" />
              Wiederkehrendes Problem
            </label>
          </div>
        </div>

        {/* Section: Interne Notizen */}
        <div className="card p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-200 flex items-center gap-2"><FileText className="h-4 w-4" /> Interne Notizen</h4>
          <label className="label">Notizen für das Wartungspersonal</label>
          <textarea className="input min-h-[60px]" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Zusätzliche Informationen für die Wartung..." />
        </div>

        <div className="rounded-lg bg-blue-950/30 border border-blue-500/20 px-3 py-2 text-xs text-blue-300 flex items-center gap-2">
          <Zap className="h-4 w-4" /> Das Gerät wird automatisch auf "Wartung" gesetzt und die Wartungszeit beginnt ab Aufnahme.
        </div>
      </div>
    </Modal>
  );
}

// ===== Device Detail Modal =====
function DeviceDetailModal({ device, onClose, onEdit, onPrintLabel, onViewStorage }: {
  device: Device; onClose: () => void; onEdit: () => void; onPrintLabel: () => void; onViewStorage: () => void;
}) {
  const [notes, setNotes] = useState<DeviceNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [qrUrl, setQrUrl] = useState<string>('');
  const [barcodeUrl, setBarcodeUrl] = useState<string>('');
  const toast = useToast();

  useEffect(() => {
    supabase.from('device_notes').select('*, author:profiles(*)').eq('device_id', device.id).order('created_at', { ascending: false }).then(({ data }: any) => {
      setNotes((data ?? []) as DeviceNote[]);
    });
    // Render the device's qr_code (fallback to inventory_number) and barcode
    // as actual QR codes so staff can scan directly from the detail view.
    const qrText = device.qr_code || device.inventory_number;
    generateQRCodeDataUrl(qrText).then(setQrUrl).catch(() => setQrUrl(''));
    if (device.barcode) {
      generateBarcodeDataUrl(device.barcode).then(setBarcodeUrl).catch(() => setBarcodeUrl(''));
    } else {
      setBarcodeUrl('');
    }
  }, [device]);

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
      footer={<><button className="btn-secondary" onClick={onViewStorage}><MapPin className="h-4 w-4" /> Standort anzeigen</button><button className="btn-secondary" onClick={onPrintLabel}><Printer className="h-4 w-4" /> Etikett drucken</button><button className="btn-primary" onClick={onEdit}><Edit className="h-4 w-4" /> Bearbeiten</button></>}>
      <div className="space-y-4">
        {/* QR / Barcode codes */}
        {(qrUrl || barcodeUrl) && (
          <div className="card p-4">
            <div className="flex flex-wrap justify-center gap-6">
              {qrUrl && (
                <div className="text-center">
                  <img src={qrUrl} alt="QR-Code" className="rounded-lg border border-slate-700 bg-white p-2" style={{ width: 160, height: 160 }} />
                  <div className="mt-1 text-xs text-slate-400">QR-Code</div>
                  <div className="font-mono text-[10px] text-slate-500 break-all">{device.qr_code || device.inventory_number}</div>
                </div>
              )}
              {barcodeUrl && (
                <div className="text-center">
                  <img src={barcodeUrl} alt="Barcode" className="rounded-lg border border-slate-700 bg-white p-2" style={{ width: 140, height: 140 }} />
                  <div className="mt-1 text-xs text-slate-400">Barcode</div>
                  <div className="font-mono text-[10px] text-slate-500 break-all">{device.barcode}</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="card p-3"><div className="text-xs text-slate-500">Inventarnummer</div><div className="font-mono text-sm text-slate-200">{device.inventory_number}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Status</div><span className={cn('badge', DEVICE_STATUS_META[device.status].bg, DEVICE_STATUS_META[device.status].color)}>{DEVICE_STATUS_META[device.status].label}</span></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Kategorie</div><div className="text-sm text-slate-200">{device.category?.name ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Zustand</div><div className={cn('text-sm', CONDITION_META[device.condition].color)}>{CONDITION_META[device.condition].label}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Hersteller</div><div className="text-sm text-slate-200">{device.manufacturer ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Modell</div><div className="text-sm text-slate-200">{device.model ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Seriennummer</div><div className="text-sm text-slate-200">{device.serial_number ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Betriebssystem</div><div className="text-sm text-slate-200">{device.operating_system ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Wert</div><div className="text-sm text-slate-200">{device.value > 0 ? formatCurrency(device.value) : '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Tracking-Methode</div><div className="text-sm text-slate-200">{device.tracking_method.toUpperCase()}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Raum</div><div className="text-sm text-slate-200">{device.room?.name ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">NFC-Tag</div><div className="font-mono text-xs text-slate-200">{device.nfc_tag_id ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Kaufdatum</div><div className="text-sm text-slate-200">{formatDate(device.purchase_date)}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Garantie bis</div><div className="text-sm text-slate-200">{formatDate(device.warranty_until)}</div></div>
        </div>

        {device.notes && <div className="card p-3"><div className="text-xs text-slate-500">Notizen</div><div className="text-sm text-slate-300">{device.notes}</div></div>}

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-200">Interne Notizen</h4>
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="card p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">{n.author?.full_name ?? 'Unbekannt'}</span>
                  <span className="text-[10px] text-slate-500">{formatDate(n.created_at)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-400">{n.note}</p>
              </div>
            ))}
            {notes.length === 0 && <p className="text-xs text-slate-500">Noch keine Notizen</p>}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="input" value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} placeholder="Interne Notiz hinzufügen..." />
            <button onClick={addNote} className="btn-secondary">Hinzufügen</button>
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
    supabase.from('cabinets').select('*').eq('id', device.cabinet_id).single().then(({ data }: any) => setCabinet(data as Cabinet | null));
    supabase.from('shelves').select('*').eq('cabinet_id', device.cabinet_id).order('row_index').order('col_index').then(({ data }: any) => setShelves((data ?? []) as Shelf[]));
  }, [device.cabinet_id]);

  const shelf = shelves.find((s) => s.id === device.shelf_id);

  return (
    <Modal open onClose={onClose} title="Lagerort" size="md">
      <div className="space-y-4">
        <div className="card p-4 text-center">
          <Package className="mx-auto h-8 w-8 text-blue-400 mb-2" />
          <div className="text-sm font-medium text-slate-200">{device.name}</div>
          <div className="font-mono text-xs text-slate-500">{device.inventory_number}</div>
        </div>

        {cabinet ? (
          <div className="card p-4">
            <div className="mb-3 text-sm text-slate-300">
              Befindet sich in <strong className="text-blue-400">{cabinet.label}</strong>
              {shelf && <> an Position <strong className="text-blue-400">Reihe {shelf.row_index + 1}, Spalte {shelf.col_index + 1}</strong></>}
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
          <div className="card p-4 text-center text-sm text-slate-500">Kein Lagerort zugewiesen. Bearbeiten Sie das Gerät, um Schrank und Regal zuzuweisen.</div>
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
    <Modal open onClose={onClose} title="Gerät-Etikett" size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>Schließen</button><button className="btn-primary" onClick={handlePrint}><Printer className="h-4 w-4" /> Drucken</button></>}>
      <div className="space-y-4">
        <div className="card p-4 text-center">
          <div className="text-sm font-medium text-slate-200">{device.name}</div>
          <div className="font-mono text-xs text-slate-500">{device.inventory_number}</div>
        </div>
        <div className="flex justify-center gap-4">
          <div className="text-center">
            {qrUrl && <img src={qrUrl} alt="QR-Code" className="rounded-lg border border-slate-700" />}
            <div className="mt-1 text-xs text-slate-500">QR-Code</div>
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
  const [operatingSystem, setOperatingSystem] = useState(device?.operating_system ?? '');
  const [status, setStatus] = useState<DeviceStatus>(device?.status ?? 'available');
  const [trackingMethod, setTrackingMethod] = useState<TrackingMethod>(device?.tracking_method ?? 'barcode');
  const [value, setValue] = useState(device?.value ?? 0);
  const [isHighValue, setIsHighValue] = useState(device?.is_high_value ?? false);
  const [roomId, setRoomId] = useState(device?.room_id ?? '');
  const [notes, setNotes] = useState(device?.notes ?? '');
  const [condition, setCondition] = useState<ConditionRating>(device?.condition ?? 'good');
  const [purchaseDate, setPurchaseDate] = useState(device?.purchase_date ?? '');
  const [warrantyUntil, setWarrantyUntil] = useState(device?.warranty_until ?? '');
  const [errors, setErrors] = useState<{ purchaseDate?: string; warrantyUntil?: string }>({});
  const toast = useToast();

  const handleSave = async () => {
    // Validate required purchase_date and warranty_until on creation.
    if (!device) {
      const errs: typeof errors = {};
      if (!purchaseDate) errs.purchaseDate = 'Kaufdatum ist erforderlich';
      if (!warrantyUntil) errs.warrantyUntil = 'Garantiedatum ist erforderlich';
      if (Object.keys(errs).length) {
        setErrors(errs);
        toast('Bitte alle Pflichtfelder ausfüllen', 'error');
        return;
      }
    }
    setErrors({});

    if (!name) { toast('Gerätename ist erforderlich', 'error'); return; }
    const category = categories.find((c) => c.id === categoryId);
    const prefix = category?.name.slice(0, 3).toUpperCase() ?? 'DEV';
    const inventoryNumber = device?.inventory_number ?? generateInventoryNumber(prefix, existingCount);
    const barcode = device?.barcode ?? generateBarcodeValue(prefix);
    const nfcTagId = trackingMethod === 'nfc' ? (device?.nfc_tag_id ?? generateNfcTagId()) : null;
    const qrCode = device?.qr_code ?? inventoryNumber;

    const data: Record<string, unknown> = {
      name, inventory_number: inventoryNumber, category_id: categoryId || null,
      manufacturer: manufacturer || null, model: model || null, serial_number: serialNumber || null,
      operating_system: operatingSystem || null,
      status, tracking_method: trackingMethod, barcode, nfc_tag_id: nfcTagId, qr_code: qrCode,
      value, is_high_value: isHighValue, room_id: roomId || null, notes: notes || null, condition,
      purchase_date: purchaseDate || null, warranty_until: warrantyUntil || null,
    };

    if (device) {
      const { error } = await supabase.from('devices').update(data).eq('id', device.id);
      if (error) { toast(error.message, 'error'); return; }
      await logActivity('device.update', 'device', device.id, { name });
      toast('Gerät aktualisiert', 'success');
    } else {
      const { error } = await supabase.from('devices').insert(data);
      if (error) { toast(error.message, 'error'); return; }
      await logActivity('device.create', 'device', undefined, { name, inventoryNumber });
      toast('Gerät hinzugefügt', 'success');
    }
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={device ? 'Gerät bearbeiten' : 'Gerät hinzufügen'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Abbrechen</button><button className="btn-primary" onClick={handleSave}>Speichern</button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Beamer Epson EB-X51" /></div>
          <div><label className="label">Kategorie</label>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Auswählen...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Hersteller</label><input className="input" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} /></div>
          <div><label className="label">Modell</label><input className="input" value={model} onChange={(e) => setModel(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Seriennummer</label><input className="input" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} /></div>
          <div><label className="label">Betriebssystem</label><input className="input" value={operatingSystem} onChange={(e) => setOperatingSystem(e.target.value)} placeholder="z.B. Windows 11, macOS 14, Android 13, none" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="label">Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as DeviceStatus)}>
              {(Object.keys(DEVICE_STATUS_META) as DeviceStatus[]).map((s) => <option key={s} value={s}>{DEVICE_STATUS_META[s].label}</option>)}
            </select>
          </div>
          <div><label className="label">Zustand</label>
            <select className="select" value={condition} onChange={(e) => setCondition(e.target.value as ConditionRating)}>
              {(Object.keys(CONDITION_META) as ConditionRating[]).map((c) => <option key={c} value={c}>{CONDITION_META[c].label}</option>)}
            </select>
          </div>
          <div><label className="label">Wert (EUR)</label><input type="number" className="input" value={value} onChange={(e) => setValue(Number(e.target.value))} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Kaufdatum {!device && '*'}</label>
            <input type="date" className={cn('input', errors.purchaseDate && 'border-red-500')} value={purchaseDate} onChange={(e) => { setPurchaseDate(e.target.value); setErrors((p) => ({ ...p, purchaseDate: undefined })); }} />
            {errors.purchaseDate && <p className="mt-1 text-xs text-red-400">{errors.purchaseDate}</p>}
          </div>
          <div>
            <label className="label">Garantie bis {!device && '*'}</label>
            <input type="date" className={cn('input', errors.warrantyUntil && 'border-red-500')} value={warrantyUntil} onChange={(e) => { setWarrantyUntil(e.target.value); setErrors((p) => ({ ...p, warrantyUntil: undefined })); }} />
            {errors.warrantyUntil && <p className="mt-1 text-xs text-red-400">{errors.warrantyUntil}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Tracking-Methode</label>
            <select className="select" value={trackingMethod} onChange={(e) => setTrackingMethod(e.target.value as TrackingMethod)}>
              <option value="barcode">Barcode (Standardgeräte)</option>
              <option value="nfc">NFC (hochwertige Geräte)</option>
            </select>
          </div>
          <div><label className="label">Raum</label>
            <select className="select" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Kein Raum</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.room_number})</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="highValue" checked={isHighValue} onChange={(e) => setIsHighValue(e.target.checked)} className="rounded" />
          <label htmlFor="highValue" className="text-sm text-slate-300">Hochwertiges Gerät (erfordert NFC-Tracking)</label>
        </div>
        <div><label className="label">Notizen</label><textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        {!device && (
          <div className="rounded-lg bg-blue-950/30 border border-blue-500/20 px-3 py-2 text-xs text-blue-300">
            Inventarnummer, Barcode, NFC-Tag-ID und QR-Code werden beim Speichern automatisch generiert. Kaufdatum und Garantiedatum sind Pflichtfelder.
          </div>
        )}
      </div>
    </Modal>
  );
}

// ===== Bulk Create Modal (Massen-Erfassung) =====
function BulkCreateModal({ categories, rooms, existingCount, onClose, onSaved }: {
  categories: InventoryCategory[]; rooms: Room[]; existingCount: number; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [categoryId, setCategoryId] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [operatingSystem, setOperatingSystem] = useState('');
  const [roomId, setRoomId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [warrantyUntil, setWarrantyUntil] = useState('');
  const [value, setValue] = useState(0);
  const [status, setStatus] = useState<DeviceStatus>('available');
  const [condition, setCondition] = useState<ConditionRating>('good');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ purchaseDate?: string; warrantyUntil?: string; name?: string; quantity?: string }>({});
  const toast = useToast();

  const handleCreate = async () => {
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = 'Gerätename ist erforderlich';
    if (!purchaseDate) errs.purchaseDate = 'Kaufdatum ist erforderlich';
    if (!warrantyUntil) errs.warrantyUntil = 'Garantiedatum ist erforderlich';
    if (quantity < 1) errs.quantity = 'Menge muss mindestens 1 sein';
    if (quantity > 500) errs.quantity = 'Maximal 500 Geräte pro Vorgang';
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast('Bitte alle Pflichtfelder ausfüllen', 'error');
      return;
    }
    setErrors({});
    setSaving(true);

    const category = categories.find((c) => c.id === categoryId);
    const prefix = category?.name.slice(0, 3).toUpperCase() ?? 'DEV';
    const count = Math.max(existingCount, 0);

    // Build all rows with auto-incrementing inventory numbers, barcodes and
    // NFC tag ids. We insert them in a single batch for speed.
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < quantity; i++) {
      const idx = count + i + 1;
      const inventoryNumber = `${prefix}-${String(idx).padStart(5, '0')}`;
      rows.push({
        name: quantity > 1 ? `${name} #${i + 1}` : name,
        inventory_number: inventoryNumber,
        category_id: categoryId || null,
        manufacturer: manufacturer || null,
        operating_system: operatingSystem || null,
        status,
        tracking_method: 'barcode',
        barcode: generateBarcodeValue(prefix),
        nfc_tag_id: null,
        qr_code: inventoryNumber,
        value,
        is_high_value: false,
        room_id: roomId || null,
        notes: quantity > 1 ? `Massen-Erfassung (${quantity} Stück)` : null,
        condition,
        purchase_date: purchaseDate || null,
        warranty_until: warrantyUntil || null,
      });
    }

    const { error } = await supabase.from('devices').insert(rows);
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('device.bulk_create', 'device', undefined, { name, quantity, prefix });
    toast(`${quantity} Gerät(e) erstellt`, 'success');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Massen-Erfassung" size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Abbrechen</button><button className="btn-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Wird erstellt...' : `${quantity} Gerät(e) erstellen`}</button></>}>
      <div className="space-y-4">
        <div className="rounded-lg bg-blue-950/30 border border-blue-500/20 px-3 py-2 text-xs text-blue-300">
          Erstellen Sie mehrere identische Geräte auf einmal (z. B. „30 LAN-Kabel à 1 m"). Die Inventarnummern werden automatisch hochgezählt. Bei einer Menge &gt; 1 wird jedem Gerät eine laufende Nummer angehängt.
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Name *</label>
            <input className={cn('input', errors.name && 'border-red-500')} value={name} onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }} placeholder="z.B. LAN-Kabel 1m" />
            {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
          </div>
          <div>
            <label className="label">Menge *</label>
            <input type="number" min={1} max={500} className={cn('input', errors.quantity && 'border-red-500')} value={quantity} onChange={(e) => { setQuantity(Number(e.target.value)); setErrors((p) => ({ ...p, quantity: undefined })); }} />
            {errors.quantity && <p className="mt-1 text-xs text-red-400">{errors.quantity}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Kategorie</label>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Auswählen...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Hersteller</label><input className="input" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Betriebssystem</label><input className="input" value={operatingSystem} onChange={(e) => setOperatingSystem(e.target.value)} placeholder="optional, z.B. Windows 11" /></div>
          <div><label className="label">Raum</label>
            <select className="select" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Kein Raum</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.room_number})</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="label">Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as DeviceStatus)}>
              {(Object.keys(DEVICE_STATUS_META) as DeviceStatus[]).map((s) => <option key={s} value={s}>{DEVICE_STATUS_META[s].label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Zustand</label>
            <select className="select" value={condition} onChange={(e) => setCondition(e.target.value as ConditionRating)}>
              {(Object.keys(CONDITION_META) as ConditionRating[]).map((c) => <option key={c} value={c}>{CONDITION_META[c].label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Wert (EUR)</label>
            <input type="number" className="input" value={value} onChange={(e) => setValue(Number(e.target.value))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Kaufdatum *</label>
            <input type="date" className={cn('input', errors.purchaseDate && 'border-red-500')} value={purchaseDate} onChange={(e) => { setPurchaseDate(e.target.value); setErrors((p) => ({ ...p, purchaseDate: undefined })); }} />
            {errors.purchaseDate && <p className="mt-1 text-xs text-red-400">{errors.purchaseDate}</p>}
          </div>
          <div>
            <label className="label">Garantie bis *</label>
            <input type="date" className={cn('input', errors.warrantyUntil && 'border-red-500')} value={warrantyUntil} onChange={(e) => { setWarrantyUntil(e.target.value); setErrors((p) => ({ ...p, warrantyUntil: undefined })); }} />
            {errors.warrantyUntil && <p className="mt-1 text-xs text-red-400">{errors.warrantyUntil}</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
