import { useState, useEffect, useRef } from 'react';
import {
  Printer as PrinterIcon, Upload, File, CheckCircle2, XCircle, Layers, Clock,
  Play, Pause, AlertTriangle, FileBox, Cpu, BookOpen, ChevronDown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { usePrintRequests } from '@/lib/hooks';
import { PRINT_STATUS_META } from '@/lib/constants';
import { cn, formatDateTime, timeAgo, formatBytes, logActivity } from '@/lib/utils';
import { useSetting } from '@/lib/settings';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import type { PrintRequest, FilamentCatalogEntry } from '@/lib/types';
const Printer = PrinterIcon;

type Tab = 'queue' | 'history' | 'filament' | 'faq';

export function PrintingPage() {
  const { profile, isStaff } = useAuth();
  const [tab, setTab] = useState<Tab>('queue');
  const { data: prints, loading, refresh } = usePrintRequests();
  const [showUpload, setShowUpload] = useState(false);
  const [showDetail, setShowDetail] = useState<PrintRequest | null>(null);

  if (loading) return <LoadingScreen message="Loading print queue..." />;

  const myPrints = (prints ?? []).filter((p) => p.teacher_id === profile?.id);
  const queue = (prints ?? []).filter((p) => p.status === 'queued' || p.status === 'validating' || p.status === 'ready' || p.status === 'printing' || p.status === 'paused');
  const history = (prints ?? []).filter((p) => p.status === 'completed' || p.status === 'failed' || p.status === 'cancelled');

  const tabs: { id: Tab; label: string; count?: number; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'queue', label: 'Print Queue', count: queue.length, icon: Layers },
    ...(isStaff ? [{ id: 'history' as Tab, label: 'History', icon: Clock }] : [{ id: 'history' as Tab, label: 'My Prints', count: myPrints.length, icon: Clock }]),
    { id: 'filament', label: 'Filament', icon: Cpu },
    { id: 'faq', label: 'FAQ & Tutorials', icon: BookOpen },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="3D Printing System" subtitle="Upload, track, and manage 3D print requests" actions={
        <button onClick={() => setShowUpload(true)} className="btn-primary"><Upload className="h-4 w-4" /> New Print Request</button>
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

function QueueTab({ prints, isStaff, onSelect, refresh }: { prints: PrintRequest[]; isStaff: boolean; onSelect: (p: PrintRequest) => void; refresh: () => void }) {
  const toast = useToast();

  const updateStatus = async (print: PrintRequest, status: PrintRequest['status'], extra?: Record<string, unknown>) => {
    const { error } = await supabase.from('print_requests').update({ status, ...extra }).eq('id', print.id);
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('print.status', 'print', print.id, { status });
    refresh();
  };

  const reportFailed = async (print: PrintRequest) => {
    const reason = window.prompt('Describe the failure reason:');
    if (!reason) return;
    await updateStatus(print, 'failed', { failed_reason: reason });
    toast('Print marked as failed', 'success');
  };

  if (prints.length === 0) return <div className="card"><EmptyState icon={Printer} title="Queue is empty" message="Upload a 3D model to start printing" /></div>;

  return (
    <div className="space-y-3">
      {prints.map((print, idx) => {
        const meta = PRINT_STATUS_META[print.status];
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
                    {print.teacher?.full_name ?? 'Unknown'} · {print.filament_material} {print.filament_color} · {print.copies} copy(ies)
                  </div>
                  {print.status === 'printing' && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-emerald-300">Layer {print.current_layer}/{print.total_layers}</span>
                        <span className="text-slate-500">{print.progress_pct}%</span>
                        {print.estimated_finish_at && <span className="text-slate-500">ETA: {formatDateTime(print.estimated_finish_at)}</span>}
                      </div>
                      <div className="mt-1 h-2 w-full max-w-md rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all" style={{ width: `${print.progress_pct}%` }} />
                      </div>
                    </div>
                  )}
                  {print.status === 'queued' && <div className="mt-1 text-xs text-slate-500">Position #{idx + 1} in queue · Submitted {timeAgo(print.created_at)}</div>}
                  {print.status === 'failed' && print.failed_reason && <div className="mt-1 text-xs text-red-400">Failed: {print.failed_reason}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={cn('badge', meta.bg, meta.color)}>{meta.label}</span>
                {isStaff && print.status === 'ready' && <button onClick={() => updateStatus(print, 'printing', { started_at: new Date().toISOString(), progress_pct: 0 })} className="btn-primary text-xs"><Play className="h-3.5 w-3.5" /> Start</button>}
                {isStaff && print.status === 'printing' && <button onClick={() => updateStatus(print, 'paused')} className="btn-secondary text-xs"><Pause className="h-3.5 w-3.5" /> Pause</button>}
                {isStaff && print.status === 'paused' && <button onClick={() => updateStatus(print, 'printing')} className="btn-primary text-xs"><Play className="h-3.5 w-3.5" /> Resume</button>}
                {isStaff && print.status === 'printing' && <button onClick={() => updateStatus(print, 'completed', { completed_at: new Date().toISOString(), progress_pct: 100 })} className="btn-secondary text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> Complete</button>}
                {print.status === 'printing' && <button onClick={() => reportFailed(print)} className="btn-ghost text-red-400 text-xs"><AlertTriangle className="h-3.5 w-3.5" /> Failed</button>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryTab({ prints, onSelect }: { prints: PrintRequest[]; onSelect: (p: PrintRequest) => void }) {
  if (prints.length === 0) return <div className="card"><EmptyState icon={Clock} title="No print history" /></div>;
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
  const [loading, setLoading] = useState(true);
  const { isStaff } = useAuth();
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('filament_catalog').select('*').order('sort_order');
    setCatalog((data ?? []) as FilamentCatalogEntry[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleAvailable = async (entry: FilamentCatalogEntry) => {
    const { error } = await supabase.from('filament_catalog').update({ is_available: !entry.is_available }).eq('id', entry.id);
    if (error) { toast(error.message, 'error'); return; }
    load();
  };

  if (loading) return <LoadingScreen message="Loading filament catalog..." />;

  const grouped = catalog.reduce<Record<string, FilamentCatalogEntry[]>>((acc, e) => {
    (acc[e.material] = acc[e.material] || []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-200">Available Filament Colors & Materials</h3>
      {Object.entries(grouped).map(([material, entries]) => (
        <div key={material}>
          <div className="mb-2 text-xs font-medium text-slate-400 uppercase tracking-wider">{material}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {entries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => isStaff && toggleAvailable(entry)}
                className={cn('card p-3 text-center transition-all', !entry.is_available && 'opacity-40')}
              >
                <div className="mx-auto mb-2 h-12 w-12 rounded-full border-2 border-slate-700" style={{ backgroundColor: entry.color_hex }} />
                <div className="text-xs font-medium text-slate-200">{entry.color}</div>
                <div className={cn('mt-1 text-[10px]', entry.is_available ? 'text-emerald-400' : 'text-slate-500')}>
                  {entry.is_available ? 'Available' : 'Unavailable'}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PrintFaqTab() {
  const faqs = [
    { q: 'What file formats are supported?', a: 'STL, OBJ, 3MF, and GCODE files are supported. STL is the most common and recommended format for 3D printing.' },
    { q: 'How long does a print take?', a: 'Print time depends on the model size, layer height, and infill. Small objects may take 30 minutes, while large complex models can take several hours.' },
    { q: 'What is slicing?', a: 'Slicing is the process of converting a 3D model (STL/OBJ) into printer instructions (GCODE). The slicer determines layer height, infill, supports, and print speed.' },
    { q: 'What layer height should I use?', a: '0.2mm is standard for most prints. Use 0.12mm for detailed models and 0.3mm for fast draft prints.' },
    { q: 'Do I need supports?', a: 'Supports are needed for overhangs greater than 45 degrees. Most slicers can auto-generate supports.' },
    { q: 'What is infill?', a: 'Infill is the internal structure of your print. 15-20% is sufficient for most objects. Higher infill makes parts stronger but uses more filament and time.' },
    { q: 'Why did my print fail?', a: 'Common causes: poor bed adhesion, incorrect temperature, warping, ran out of filament, or power interruption. Use the "Report Failed" button to document the issue.' },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-200">3D Printing FAQ & Tutorials</h3>
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
    supabase.from('filament_catalog').select('*').eq('is_available', true).order('sort_order').then(({ data }) => setCatalog((data ?? []) as FilamentCatalogEntry[]));
  }, []);

  const handleFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const valid = supportedFormats.includes(ext);
    const sizeMB = file.size / (1024 * 1024);
    setSelectedFile(file);
    setFileName(file.name);
    setFileSize(file.size);
    setFileFormat(ext);
    setFileValid(valid && sizeMB <= maxSize);
    setValidationNotes(valid ? (sizeMB > maxSize ? `File too large (max ${maxSize}MB)` : 'File format supported') : `Unsupported format. Allowed: ${supportedFormats.join(', ')}`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const submit = async () => {
    if (!fileName || !fileValid || !selectedFile) { toast('Please upload a valid file', 'error'); return; }
    if (!filamentId) { toast('Select a filament color/material', 'error'); return; }

    setUploading(true);
    const filament = catalog.find((c) => c.id === filamentId);
    const { data: profileData } = await supabase.auth.getUser();
    const userId = profileData.user?.id;
    if (!userId) { toast('Authentication error', 'error'); setUploading(false); return; }

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
      file_format: fileFormat, file_valid: true, validation_notes: 'Validated on upload',
      filament_catalog_id: filamentId, filament_material: filament?.material, filament_color: filament?.color,
      copies, notes, status: 'queued',
    });
    if (error) { toast(error.message, 'error'); setUploading(false); return; }
    await logActivity('print.upload', 'print', undefined, { fileName });
    toast('Print request submitted to queue', 'success');
    setUploading(false);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="New 3D Print Request" size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}><Upload className="h-4 w-4" /> Submit</button></>}>
      <div className="space-y-4">
        <div>
          <label className="label">Upload 3D Model File</label>
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
                <div className="text-sm text-slate-400">Drag & drop or click to upload</div>
                <div className="mt-1 text-xs text-slate-500">Supported: {supportedFormats.join(', ').toUpperCase()} · Max {maxSize}MB</div>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="label">Filament Color & Material</label>
          <select className="select" value={filamentId} onChange={(e) => setFilamentId(e.target.value)}>
            <option value="">Select filament...</option>
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.material} — {c.color}</option>)}
          </select>
          {filamentId && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-6 w-6 rounded-full border border-slate-700" style={{ backgroundColor: catalog.find((c) => c.id === filamentId)?.color_hex }} />
              <span className="text-xs text-slate-400">{catalog.find((c) => c.id === filamentId)?.material} {catalog.find((c) => c.id === filamentId)?.color}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Copies</label><input type="number" min={1} max={20} className="input" value={copies} onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))} /></div>
        </div>

        <div><label className="label">Notes (optional)</label><textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special instructions, layer height, infill preferences..." /></div>
      </div>
    </Modal>
  );
}

function PrintDetailModal({ print, isStaff, onClose, onUpdated }: { print: PrintRequest; isStaff: boolean; onClose: () => void; onUpdated: () => void }) {
  const [currentLayer, setCurrentLayer] = useState(print.current_layer);
  const [totalLayers, setTotalLayers] = useState(print.total_layers);
  const [progress, setProgress] = useState(print.progress_pct);
  const toast = useToast();

  const updateProgress = async () => {
    const pct = totalLayers > 0 ? Math.round((currentLayer / totalLayers) * 100) : progress;
    const eta = new Date(Date.now() + Math.max(0, (totalLayers - currentLayer) * 120_000)).toISOString();
    const { error } = await supabase.from('print_requests').update({
      current_layer: currentLayer, total_layers: totalLayers, progress_pct: pct, estimated_finish_at: eta,
    }).eq('id', print.id);
    if (error) { toast(error.message, 'error'); return; }
    toast('Print progress updated', 'success');
    onUpdated();
  };

  return (
    <Modal open onClose={onClose} title={print.file_name} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-3"><div className="text-xs text-slate-500">Status</div><span className={cn('badge mt-1', PRINT_STATUS_META[print.status].bg, PRINT_STATUS_META[print.status].color)}>{PRINT_STATUS_META[print.status].label}</span></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Requested by</div><div className="text-sm text-slate-200">{print.teacher?.full_name ?? '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Filament</div><div className="text-sm text-slate-200">{print.filament_material} {print.filament_color}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Copies</div><div className="text-sm text-slate-200">{print.copies}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">File Size</div><div className="text-sm text-slate-200">{print.file_size_bytes ? formatBytes(print.file_size_bytes) : '—'}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Submitted</div><div className="text-sm text-slate-200">{timeAgo(print.created_at)}</div></div>
        </div>

        {print.status === 'printing' && (
          <div className="card p-4">
            <h4 className="mb-3 text-sm font-semibold text-slate-200">Live Print Progress</h4>
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-emerald-300">Layer {print.current_layer}/{print.total_layers}</span>
                <span className="text-slate-400">{print.progress_pct}%</span>
              </div>
              <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all" style={{ width: `${print.progress_pct}%` }} />
              </div>
              {print.estimated_finish_at && <div className="mt-2 text-xs text-slate-500">ETA: {formatDateTime(print.estimated_finish_at)}</div>}
            </div>

            {isStaff && (
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <div className="text-xs text-slate-400">Update progress (staff only):</div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="label">Current Layer</label><input type="number" className="input" value={currentLayer} onChange={(e) => setCurrentLayer(Number(e.target.value))} /></div>
                  <div><label className="label">Total Layers</label><input type="number" className="input" value={totalLayers} onChange={(e) => setTotalLayers(Number(e.target.value))} /></div>
                  <div><label className="label">Progress %</label><input type="number" className="input" value={progress} onChange={(e) => setProgress(Number(e.target.value))} /></div>
                </div>
                <button onClick={updateProgress} className="btn-primary w-full">Update Progress</button>
              </div>
            )}
          </div>
        )}

        {print.notes && <div className="card p-3"><div className="text-xs text-slate-500">Notes</div><div className="text-sm text-slate-300">{print.notes}</div></div>}
        {print.failed_reason && <div className="card p-3 border-red-500/30"><div className="text-xs text-red-400">Failure Reason</div><div className="text-sm text-slate-300">{print.failed_reason}</div></div>}
      </div>
    </Modal>
  );
}

