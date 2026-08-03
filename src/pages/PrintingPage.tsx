import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Printer as PrinterIcon, Upload, File, CheckCircle2, XCircle, Layers, Clock,
  Play, Pause, AlertTriangle, FileBox, Cpu, BookOpen, ChevronDown, Wifi,
  ThumbsUp, ThumbsDown, Send, Settings,
} from 'lucide-react';
import { supabase } from '@/lib/database';
import { useAuth } from '@/lib/auth';
import { usePrintRequests } from '@/lib/hooks';
import { PRINT_STATUS_META } from '@/lib/constants';
import { cn, formatDateTime, timeAgo, formatBytes, logActivity } from '@/lib/utils';
import { useSetting } from '@/lib/settings';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import type { PrintRequest, FilamentCatalogEntry, FilamentInventory } from '@/lib/types';
const Printer = PrinterIcon;

type Tab = 'queue' | 'history' | 'filament' | 'faq';

// Statuses a staff member can advance a job to during the manual review workflow.
const STAFF_STATUS_FLOW: PrintRequest['status'][] = ['queued', 'validating', 'ready', 'printing', 'paused'];

export function PrintingPage() {
  const { profile, isStaff } = useAuth();
  const [tab, setTab] = useState<Tab>('queue');
  const { data: prints, loading, refresh } = usePrintRequests();
  const [showUpload, setShowUpload] = useState(false);
  const [showDetail, setShowDetail] = useState<PrintRequest | null>(null);

  if (loading) return <LoadingScreen message="Druck-Warteschlange wird geladen..." />;

  const myPrints = (prints ?? []).filter((p) => p.teacher_id === profile?.id);
  const queue = (prints ?? []).filter((p) => p.status === 'queued' || p.status === 'validating' || p.status === 'ready' || p.status === 'printing' || p.status === 'paused');
  const history = (prints ?? []).filter((p) => p.status === 'completed' || p.status === 'failed' || p.status === 'cancelled');

  const tabs: { id: Tab; label: string; count?: number; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'queue', label: 'Druck-Warteschlange', count: queue.length, icon: Layers },
    ...(isStaff ? [{ id: 'history' as Tab, label: 'Verlauf', icon: Clock }] : [{ id: 'history' as Tab, label: 'Meine Drucke', count: myPrints.length, icon: Clock }]),
    { id: 'filament', label: 'Filament', icon: Cpu },
    { id: 'faq', label: 'FAQ & Tutorials', icon: BookOpen },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="3D-Druck-System" subtitle="3D-Druckaufträge hochladen, verfolgen und verwalten" actions={
        <button onClick={() => setShowUpload(true)} className="btn-primary"><Upload className="h-4 w-4" /> Neuer Druckauftrag</button>
      } />

      <div className="flex gap-1 border-b border-slate-800 overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('tab whitespace-nowrap', tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200')}>
            <t.icon className="mr-1.5 inline h-4 w-4" />
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="ml-1.5 badge bg-blue-500/15 border-blue-500/30 text-blue-300 text-[10px]">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'queue' && <QueueTab prints={queue} isStaff={isStaff} onSelect={(p) => setShowDetail(p)} refresh={refresh} />}
      {tab === 'history' && <HistoryTab prints={isStaff ? history : myPrints} onSelect={(p) => setShowDetail(p)} />}
      {tab === 'filament' && <FilamentTab />}
      {tab === 'faq' && <PrintFaqTab />}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSaved={() => { setShowUpload(false); refresh(); }} />}
      {showDetail && <PrintDetailModal print={showDetail} isStaff={isStaff} onClose={() => setShowDetail(null)} onUpdated={() => { setShowDetail(null); refresh(); }} />}
    </div>
  );
}

/**
 * Shared helper: fetch a map of catalog_id -> remaining grams from filament_inventory.
 * Returns the raw records so callers can derive stock/total/spool_count as needed.
 */
async function fetchInventoryMap(): Promise<Map<string, FilamentInventory>> {
  const map = new Map<string, FilamentInventory>();
  const { data, error } = await supabase.from('filament_inventory').select('*');
  if (error || !data) return map;
  for (const row of data as FilamentInventory[]) {
    map.set(row.catalog_id, row);
  }
  return map;
}

function QueueTab({ prints, isStaff, onSelect, refresh }: { prints: PrintRequest[]; isStaff: boolean; onSelect: (p: PrintRequest) => void; refresh: () => void }) {
  const toast = useToast();

  const updateStatus = async (print: PrintRequest, status: PrintRequest['status'], extra?: Record<string, unknown>, activityDetails?: Record<string, unknown>) => {
    const { error } = await supabase.from('print_requests').update({ status, ...extra }).eq('id', print.id);
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('print.status', 'print', print.id, activityDetails ?? { status });
    refresh();
  };

  // ---- Manual approval workflow (staff only) ----
  const approve = (print: PrintRequest) => {
    // queued -> validating -> ready. Each step is a manual staff action.
    const next: PrintRequest['status'] = print.status === 'queued' ? 'validating' : 'ready';
    updateStatus(print, next, {}, { status: next, action: 'approve' });
    toast(next === 'validating' ? 'Auftrag zur Prüfung angenommen' : 'Auftrag freigegeben (bereit zum Druck)', 'success');
  };

  const reject = async (print: PrintRequest) => {
    const reason = window.prompt('Ablehnungsgrund angeben:');
    if (!reason) return;
    await updateStatus(print, 'cancelled', { failed_reason: reason }, { status: 'cancelled', action: 'reject', reason });
    toast('Auftrag abgelehnt', 'success');
  };

  const reportFailed = async (print: PrintRequest) => {
    const reason = window.prompt('Fehlergrund beschreiben:');
    if (!reason) return;
    await updateStatus(print, 'failed', { failed_reason: reason });
    toast('Druck als fehlgeschlagen markiert', 'success');
  };

  // ---- Bambu Lab integration (functional, but warns if server not configured) ----
  const startViaBambu = async (print: PrintRequest) => {
    // The actual printer dispatch would be an edge-function call to the Bambu Lab farm server.
    // Without configured credentials we record a pending job id and surface a notification
    // so the operator knows to finish setup in Settings.
    const pendingJobId = `pending-${print.id.slice(0, 8)}`;
    toast('Bambu Lab Server-Verbindung ist nicht konfiguriert. Bitte in den Einstellungen hinterlegen.', 'info');
    await updateStatus(
      print,
      'printing',
      {
        bambu_job_id: pendingJobId,
        bambu_printer_id: 'unassigned',
        started_at: new Date().toISOString(),
        progress_pct: 0,
        current_layer: 0,
        total_layers: Math.max(1, print.total_layers),
      },
      { status: 'printing', bambu_job_id: pendingJobId, configured: false },
    );
  };

  if (prints.length === 0) return <div className="card"><EmptyState icon={Printer} title="Warteschlange ist leer" message="Laden Sie ein 3D-Modell hoch, um mit dem Drucken zu beginnen" /></div>;

  return (
    <div className="space-y-3">
      {prints.map((print, idx) => {
        const meta = PRINT_STATUS_META[print.status];
        const canApprove = isStaff && (print.status === 'queued' || print.status === 'validating');
        const canReject = isStaff && STAFF_STATUS_FLOW.includes(print.status) && print.status !== 'printing';
        const canStart = isStaff && print.status === 'ready';
        const canBambu = isStaff && print.status === 'ready';
        return (
          <div key={print.id} className="card card-hover p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(print)}>
                <div className={cn('rounded-lg p-2.5', meta.bg)}>
                  <FileBox className={cn('h-5 w-5', meta.color)} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-200 truncate">{print.file_name}</div>
                  <div className="text-xs text-slate-500">
                    {print.teacher?.full_name ?? 'Unbekannt'} · {print.filament_material} {print.filament_color} · {print.copies} Kopie(n)
                  </div>
                  {print.status === 'printing' && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-emerald-300">Schicht {print.current_layer}/{print.total_layers}</span>
                        <span className="text-slate-500">{print.progress_pct}%</span>
                        {print.estimated_finish_at && <span className="text-slate-500">ETA: {formatDateTime(print.estimated_finish_at)}</span>}
                        {print.bambu_printer_id && print.bambu_printer_id !== 'unassigned' && (
                          <span className="text-cyan-300" title={print.bambu_job_id ?? undefined}>· Bambu {print.bambu_printer_id}</span>
                        )}
                      </div>
                      <div className="mt-1 h-2 w-full max-w-md rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all" style={{ width: `${print.progress_pct}%` }} />
                      </div>
                    </div>
                  )}
                  {print.status === 'queued' && <div className="mt-1 text-xs text-slate-500">Position Nr. {idx + 1} in Warteschlange · Eingereicht {timeAgo(print.created_at)}</div>}
                  {print.status === 'validating' && <div className="mt-1 text-xs text-blue-400">Wartet auf manuelle Freigabe durch das Team</div>}
                  {print.status === 'failed' && print.failed_reason && <div className="mt-1 text-xs text-red-400">Fehlgeschlagen: {print.failed_reason}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={cn('badge', meta.bg, meta.color)}>{meta.label}</span>
                {canApprove && <button onClick={() => approve(print)} className="btn-primary text-xs" title="Manuell prüfen und freigeben"><ThumbsUp className="h-3.5 w-3.5" /> Freigeben</button>}
                {canReject && <button onClick={() => reject(print)} className="btn-ghost text-red-400 text-xs"><ThumbsDown className="h-3.5 w-3.5" /> Ablehnen</button>}
                {canStart && <button onClick={() => updateStatus(print, 'printing', { started_at: new Date().toISOString(), progress_pct: 0 })} className="btn-primary text-xs"><Play className="h-3.5 w-3.5" /> Starten</button>}
                {canBambu && <button onClick={() => startViaBambu(print)} className="btn-secondary text-xs" title="An Bambu Lab Drucker senden"><Send className="h-3.5 w-3.5" /> Über Bambu Lab starten</button>}
                {isStaff && print.status === 'printing' && <button onClick={() => updateStatus(print, 'paused')} className="btn-secondary text-xs"><Pause className="h-3.5 w-3.5" /> Pause</button>}
                {isStaff && print.status === 'paused' && <button onClick={() => updateStatus(print, 'printing')} className="btn-primary text-xs"><Play className="h-3.5 w-3.5" /> Fortsetzen</button>}
                {isStaff && print.status === 'printing' && <button onClick={() => updateStatus(print, 'completed', { completed_at: new Date().toISOString(), progress_pct: 100 })} className="btn-secondary text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> Abschließen</button>}
                {print.status === 'printing' && <button onClick={() => reportFailed(print)} className="btn-ghost text-red-400 text-xs"><AlertTriangle className="h-3.5 w-3.5" /> Fehlgeschlagen</button>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryTab({ prints, onSelect }: { prints: PrintRequest[]; onSelect: (p: PrintRequest) => void }) {
  if (prints.length === 0) return <div className="card"><EmptyState icon={Clock} title="Kein Druckverlauf" /></div>;
  return (
    <div className="space-y-2">
      {prints.map((print) => (
        <button key={print.id} onClick={() => onSelect(print)} className="card card-hover w-full p-3 text-left">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-slate-200">{print.file_name}</span>
              <span className="ml-2 text-xs text-slate-500">{timeAgo(print.created_at)}</span>
            </div>
            <span className={cn('badge', PRINT_STATUS_META[print.status].bg, PRINT_STATUS_META[print.status].color)}>{PRINT_STATUS_META[print.status].label}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function FilamentTab() {
  const [catalog, setCatalog] = useState<FilamentCatalogEntry[]>([]);
  const [inventory, setInventory] = useState<Map<string, FilamentInventory>>(new Map());
  const [loading, setLoading] = useState(true);
  const { isStaff } = useAuth();
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    const [{ data: cat }, invMap] = await Promise.all([
      supabase.from('filament_catalog').select('*').order('sort_order'),
      fetchInventoryMap(),
    ]);
    setCatalog((cat ?? []) as FilamentCatalogEntry[]);
    setInventory(invMap);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleAvailable = async (entry: FilamentCatalogEntry) => {
    const { error } = await supabase.from('filament_catalog').update({ is_available: !entry.is_available }).eq('id', entry.id);
    if (error) { toast(error.message, 'error'); return; }
    load();
  };

  if (loading) return <LoadingScreen message="Filament-Katalog wird geladen..." />;

  const grouped = catalog.reduce<Record<string, FilamentCatalogEntry[]>>((acc, e) => {
    (acc[e.material] = acc[e.material] || []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-200">Verfügbare Filament-Farben & Materialien</h3>
      <p className="text-xs text-slate-500">Bestand wird aus <code className="text-slate-400">filament_inventory</code> ausgelesen. Farben mit 0 g Restbestand sind gesperrt.</p>
      {Object.entries(grouped).map(([material, entries]) => (
        <div key={material}>
          <div className="mb-2 text-xs font-medium text-slate-400 uppercase tracking-wider">{material}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {entries.map((entry) => {
              const inv = inventory.get(entry.id);
              const remaining = inv ? Number(inv.remaining_grams) : 0;
              const inStock = remaining > 0;
              return (
                <button
                  key={entry.id}
                  onClick={() => isStaff && toggleAvailable(entry)}
                  className={cn('card p-3 text-center transition-all', !inStock && 'opacity-40')}
                  title={inv ? `${remaining} g von ${Number(inv.total_grams)} g übrig` : 'Kein Bestand erfasst'}
                >
                  <div className="mx-auto mb-2 h-12 w-12 rounded-full border-2 border-slate-700" style={{ backgroundColor: entry.color_hex }} />
                  <div className="text-xs font-medium text-slate-200">{entry.color}</div>
                  <div className={cn('mt-1 text-[10px]', inStock ? 'text-emerald-400' : 'text-red-400')}>
                    {inStock ? `${remaining} g verfügbar` : 'Nicht vorrätig'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PrintFaqTab() {
  const faqs = [
    { q: 'Welche Dateiformate werden unterstützt?', a: 'STL, OBJ, 3MF und GCODE-Dateien werden unterstützt. STL ist das häufigste und empfohlene Format für 3D-Druck.' },
    { q: 'Wie lange dauert ein Druck?', a: 'Die Druckzeit hängt von der Modellgröße, Schichthöhe und Füllung ab. Kleine Objekte können 30 Minuten dauern, während große komplexe Modelle mehrere Stunden benötigen.' },
    { q: 'Was ist Slicing?', a: 'Slicing ist der Prozess der Umwandlung eines 3D-Modells (STL/OBJ) in Druckeranweisungen (GCODE). Der Slicer bestimmt Schichthöhe, Füllung, Stützstrukturen und Druckgeschwindigkeit.' },
    { q: 'Welche Schichthöhe sollte ich verwenden?', a: '0.2 mm ist Standard für die meisten Drucke. Verwenden Sie 0.12 mm für detaillierte Modelle und 0.3 mm für schnelle Entwurfsdrucke.' },
    { q: 'Benötige ich Stützstrukturen?', a: 'Stützstrukturen werden für Überhänge über 45 Grad benötigt. Die meisten Slicer können Stützstrukturen automatisch generieren.' },
    { q: 'Was ist Füllung?', a: 'Füllung ist die innere Struktur Ihres Drucks. 15–20 % sind für die meisten Objekte ausreichend. Höhere Füllung macht Teile stärker, verbraucht aber mehr Filament und Zeit.' },
    { q: 'Warum ist mein Druck fehlgeschlagen?', a: 'Häufige Ursachen: schlechte Betthaftung, falsche Temperatur, Verzug, Filament ging aus oder Stromunterbrechung. Verwenden Sie die Schaltfläche „Als fehlgeschlagen melden“, um das Problem zu dokumentieren.' },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-200">3D-Druck FAQ & Tutorials</h3>
      {faqs.map((faq, i) => (
        <details key={i} className="card p-4 group">
          <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-slate-200 list-none">
            {faq.q}
            <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-3 text-sm text-slate-400">{faq.a}</p>
        </details>
      ))}
    </div>
  );
}

function UploadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [catalog, setCatalog] = useState<FilamentCatalogEntry[]>([]);
  const [inventory, setInventory] = useState<Map<string, FilamentInventory>>(new Map());
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [fileFormat, setFileFormat] = useState('');
  const [fileValid, setFileValid] = useState(false);
  const [validationNotes, setValidationNotes] = useState('');
  const [filamentId, setFilamentId] = useState('');
  const [copies, setCopies] = useState(1);
  const [notes, setNotes] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [supportedFormats] = useSetting<string[]>('supported_print_formats', ['stl', 'obj', '3mf', 'gcode']);
  const [maxSize] = useSetting<number>('max_print_file_size_mb', 50);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [{ data }, invMap] = await Promise.all([
        supabase.from('filament_catalog').select('*').eq('is_available', true).order('sort_order'),
        fetchInventoryMap(),
      ]);
      setCatalog((data ?? []) as FilamentCatalogEntry[]);
      setInventory(invMap);
    })();
  }, []);

  // Filament options are stock-gated: only show filaments with remaining_grams > 0.
  const stockOptions = useMemo(() => {
    return catalog
      .filter((c) => {
        const inv = inventory.get(c.id);
        const remaining = inv ? Number(inv.remaining_grams) : 0;
        return remaining > 0;
      })
      .map((c) => ({ entry: c, remaining: Number(inventory.get(c.id)?.remaining_grams ?? 0) }));
  }, [catalog, inventory]);

  // If the previously selected filament is no longer in stock, clear the selection.
  useEffect(() => {
    if (filamentId && !stockOptions.some((o) => o.entry.id === filamentId)) {
      setFilamentId('');
    }
  }, [stockOptions, filamentId]);

  const handleFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const valid = supportedFormats.includes(ext);
    const sizeMB = file.size / (1024 * 1024);
    setSelectedFile(file);
    setFileName(file.name);
    setFileSize(file.size);
    setFileFormat(ext);
    const validTotal = valid && sizeMB <= maxSize;
    setFileValid(validTotal);
    setValidationNotes(!valid ? `Nicht unterstütztes Format. Erlaubt: ${supportedFormats.join(', ')}` : sizeMB > maxSize ? `Datei zu groß (max. ${maxSize} MB)` : 'Dateiformat unterstützt');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const submit = async () => {
    // --- Bug fix: actually use the computed validation state, not a hardcoded true ---
    if (!fileName || !fileValid || !selectedFile) { toast('Bitte eine gültige Datei hochladen', 'error'); return; }
    if (!filamentId) { toast('Bitte Filament-Farbe/Material auswählen', 'error'); return; }

    // --- Stock gate: reject submission if the chosen filament is out of stock ---
    const chosenInv = inventory.get(filamentId);
    const chosenRemaining = chosenInv ? Number(chosenInv.remaining_grams) : 0;
    if (chosenRemaining <= 0) { toast('Dieses Filament ist nicht mehr vorrätig. Bitte ein anderes wählen.', 'error'); return; }

    setUploading(true);
    const filament = catalog.find((c) => c.id === filamentId);
    const { data: profileData } = await supabase.auth.getUser();
    const userId = profileData.user?.id;
    if (!userId) { toast('Authentifizierungsfehler', 'error'); setUploading(false); return; }

    const filePath = `${userId}/${Date.now()}-${fileName}`;
    const { error: uploadError } = await supabase.storage.from('print-files').upload(filePath, selectedFile);
    if (uploadError) {
      toast(uploadError.message, 'error');
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('print-files').getPublicUrl(filePath);
    const fileUrl = urlData.publicUrl;

    const { error } = await supabase.from('print_requests').insert({
      teacher_id: userId, file_name: fileName, file_url: fileUrl, file_size_bytes: fileSize,
      file_format: fileFormat, file_valid: fileValid, validation_notes: validationNotes,
      filament_catalog_id: filamentId, filament_material: filament?.material, filament_color: filament?.color,
      copies, notes, status: 'queued',
    });
    if (error) { toast(error.message, 'error'); setUploading(false); return; }
    await logActivity('print.upload', 'print', undefined, { fileName });
    toast('Druckauftrag in Warteschlange eingereicht', 'success');
    setUploading(false);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Neuer 3D-Druckauftrag" size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Abbrechen</button><button className="btn-primary" onClick={submit} disabled={uploading}><Upload className="h-4 w-4" /> Einreichen</button></>}>
      <div className="space-y-4">
        <div>
          <label className="label">3D-Modelldatei hochladen</label>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn('rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors', dragOver ? 'border-blue-500 bg-blue-600/10' : 'border-slate-700 hover:border-slate-600')}
          >
            <input ref={fileInputRef} type="file" accept=".stl,.obj,.3mf,.gcode" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            {fileName ? (
              <div>
                <FileBox className="mx-auto h-8 w-8 text-blue-400 mb-2" />
                <div className="text-sm font-medium text-slate-200">{fileName}</div>
                <div className="text-xs text-slate-500">{formatBytes(fileSize)} · {fileFormat.toUpperCase()}</div>
                <div className={cn('mt-2 text-xs', fileValid ? 'text-emerald-400' : 'text-red-400')}>
                  {fileValid ? <><CheckCircle2 className="inline h-3.5 w-3.5 mr-1" /> {validationNotes}</> : <><XCircle className="inline h-3.5 w-3.5 mr-1" /> {validationNotes}</>}
                </div>
              </div>
            ) : (
              <div>
                <Upload className="mx-auto h-8 w-8 text-slate-500 mb-2" />
                <div className="text-sm text-slate-400">Per Drag & Drop ablegen oder klicken zum Hochladen</div>
                <div className="mt-1 text-xs text-slate-500">Unterstützt: {supportedFormats.join(', ').toUpperCase()} · Max {maxSize} MB</div>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="label">Filament-Farbe & Material</label>
          <select className="select" value={filamentId} onChange={(e) => setFilamentId(e.target.value)}>
            <option value="">Filament auswählen...</option>
            {stockOptions.map(({ entry, remaining }) => (
              <option key={entry.id} value={entry.id}>{entry.material} — {entry.color} ({remaining} g vorrätig)</option>
            ))}
          </select>
          {stockOptions.length === 0 && (
            <div className="mt-1 text-xs text-amber-400">Aktuell ist kein Filament vorrätig. Bitte beim Team nachfragen.</div>
          )}
          {filamentId && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-6 w-6 rounded-full border border-slate-700" style={{ backgroundColor: catalog.find((c) => c.id === filamentId)?.color_hex }} />
              <span className="text-xs text-slate-400">{catalog.find((c) => c.id === filamentId)?.material} {catalog.find((c) => c.id === filamentId)?.color} · {Number(inventory.get(filamentId)?.remaining_grams ?? 0)} g vorrätig</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Kopien</label><input type="number" min={1} max={20} className="input" value={copies} onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))} /></div>
        </div>

        <div><label className="label">Notizen (optional)</label><textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Besondere Anweisungen, Schichthöhe, Füllungseinstellungen..." /></div>
      </div>
    </Modal>
  );
}

function PrintDetailModal({ print, isStaff, onClose, onUpdated }: { print: PrintRequest; isStaff: boolean; onClose: () => void; onUpdated: () => void }) {
  const [currentLayer, setCurrentLayer] = useState(print.current_layer);
  const [totalLayers, setTotalLayers] = useState(print.total_layers);
  const [progress, setProgress] = useState(print.progress_pct);
  const [bambuPrinterId, setBambuPrinterId] = useState(print.bambu_printer_id ?? '');
  const toast = useToast();

  const updateProgress = async () => {
    const pct = totalLayers > 0 ? Math.round((currentLayer / totalLayers) * 100) : progress;
    const eta = new Date(Date.now() + Math.max(0, (totalLayers - currentLayer) * 120_000)).toISOString();
    const { error } = await supabase.from('print_requests').update({
      current_layer: currentLayer, total_layers: totalLayers, progress_pct: pct, estimated_finish_at: eta,
    }).eq('id', print.id);
    if (error) { toast(error.message, 'error'); return; }
    toast('Druckfortschritt aktualisiert', 'success');
    onUpdated();
  };

  const assignBambu = async () => {
    if (!bambuPrinterId.trim()) { toast('Bitte eine Drucker-ID angeben', 'error'); return; }
    // Real dispatch would call an edge function with Bambu Lab server credentials.
    // Until those are configured in Settings we keep the record but warn the operator.
    const jobId = print.bambu_job_id ?? `pending-${print.id.slice(0, 8)}`;
    const { error } = await supabase.from('print_requests').update({
      bambu_printer_id: bambuPrinterId.trim(),
      bambu_job_id: jobId,
    }).eq('id', print.id);
    if (error) { toast(error.message, 'error'); return; }
    toast('Bambu-Drucker zugewiesen. Server-Verbindung in den Einstellungen konfigurieren, um den Druck automatisch zu starten.', 'info');
    onUpdated();
  };

  return (
    <Modal open onClose={onClose} title={print.file_name} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-3"><div className="text-xs text-slate-500">Status</div><span className={cn('badge mt-1', PRINT_STATUS_META[print.status].bg, PRINT_STATUS_META[print.status].color)}>{PRINT_STATUS_META[print.status].label}</span></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Angefordert von</div><div className="text-sm text-slate-200">{print.teacher?.full_name ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Filament</div><div className="text-sm text-slate-200">{print.filament_material} {print.filament_color}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Kopien</div><div className="text-sm text-slate-200">{print.copies}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Dateigröße</div><div className="text-sm text-slate-200">{print.file_size_bytes ? formatBytes(print.file_size_bytes) : '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Eingereicht</div><div className="text-sm text-slate-200">{timeAgo(print.created_at)}</div></div>
        </div>

        {print.status === 'printing' && (
          <div className="card p-4">
            <h4 className="mb-3 text-sm font-semibold text-slate-200">Live-Druckfortschritt</h4>
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-emerald-300">Schicht {print.current_layer}/{print.total_layers}</span>
                <span className="text-slate-400">{print.progress_pct}%</span>
              </div>
              <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all" style={{ width: `${print.progress_pct}%` }} />
              </div>
              {print.estimated_finish_at && <div className="mt-2 text-xs text-slate-500">ETA: {formatDateTime(print.estimated_finish_at)}</div>}
            </div>

            {isStaff && (
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <div className="text-xs text-slate-400">Fortschritt aktualisieren (nur Personal):</div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="label">Aktuelle Schicht</label><input type="number" className="input" value={currentLayer} onChange={(e) => setCurrentLayer(Number(e.target.value))} /></div>
                  <div><label className="label">Gesamte Schichten</label><input type="number" className="input" value={totalLayers} onChange={(e) => setTotalLayers(Number(e.target.value))} /></div>
                  <div><label className="label">Fortschritt %</label><input type="number" className="input" value={progress} onChange={(e) => setProgress(Number(e.target.value))} /></div>
                </div>
                <button onClick={updateProgress} className="btn-primary w-full">Fortschritt aktualisieren</button>
              </div>
            )}
          </div>
        )}

        {/* ---- Bambu Lab farm integration ---- */}
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Wifi className="h-4 w-4 text-cyan-400" />
            <h4 className="text-sm font-semibold text-slate-200">Bambu Lab Farm-Integration</h4>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="card p-3"><div className="text-xs text-slate-500">Bambu Job-ID</div><div className="text-slate-200">{print.bambu_job_id ?? '—'}</div></div>
            <div className="card p-3"><div className="text-xs text-slate-500">Bambu Drucker-ID</div><div className="text-slate-200">{print.bambu_printer_id ?? '—'}</div></div>
            <div className="card p-3"><div className="text-xs text-slate-500">Fortschritt</div><div className="text-slate-200">{print.progress_pct}%</div></div>
            <div className="card p-3"><div className="text-xs text-slate-500">Schicht</div><div className="text-slate-200">{print.current_layer}/{print.total_layers}</div></div>
            {print.estimated_finish_at && (
              <div className="card p-3 col-span-2"><div className="text-xs text-slate-500">Voraussichtliches Ende</div><div className="text-slate-200">{formatDateTime(print.estimated_finish_at)}</div></div>
            )}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            <Settings className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>Die Bambu Lab Server-Verbindung (Zugangsdaten) muss in den Einstellungen hinterlegt werden, bevor Drucke automatisch an die Farm gesendet werden.</span>
          </div>
          {isStaff && (
            <div className="mt-3 border-t border-slate-800 pt-3 space-y-2">
              <div className="text-xs text-slate-400">Bambu-Drucker zuweisen (nur Personal):</div>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="z. B. P1S-012345" value={bambuPrinterId} onChange={(e) => setBambuPrinterId(e.target.value)} />
                <button onClick={assignBambu} className="btn-secondary"><Send className="h-4 w-4" /> Zuweisen</button>
              </div>
            </div>
          )}
        </div>

        {print.notes && <div className="card p-3"><div className="text-xs text-slate-500">Notizen</div><div className="text-sm text-slate-300">{print.notes}</div></div>}
        {print.failed_reason && <div className="card p-3 border-red-500/30"><div className="text-xs text-red-400">Fehlergrund</div><div className="text-sm text-slate-300">{print.failed_reason}</div></div>}
      </div>
    </Modal>
  );
}
