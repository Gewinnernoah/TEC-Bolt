import { useState, useEffect } from 'react';
import { Settings, ToggleLeft, ToggleRight, Clock, Wifi, Shield, Printer, Boxes, Cpu, Sliders } from 'lucide-react';
import { supabase } from '@/lib/db';
import { useSetting, loadSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { PageHeader, LoadingScreen } from '@/components/ui';
import { useToast } from '@/components/Toast';
import type { TicketCategory } from '@/lib/types';

export function AdminSettingsPage() {
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'general' | 'security' | 'wifi' | 'printing' | 'tickets' | 'inventory'>('general');
  const toast = useToast();

  const [autoLogoutMinutes, setAutoLogoutMinutes] = useSetting<number>('auto_logout_minutes', 15);
  const [autoLogoutAdminExempt, setAutoLogoutAdminExempt] = useSetting<boolean>('auto_logout_admin_exempt', true);
  const [orgName, setOrgName] = useSetting<string>('org_name', 'School TEC Hub');
  const [signatureRequired, setSignatureRequired] = useSetting<boolean>('signature_required', true);
  const [teacherSelfReturn, setTeacherSelfReturn] = useSetting<boolean>('teacher_self_return', false);
  const [supportedFormats, setSupportedFormats] = useSetting<string[]>('supported_print_formats', ['stl', 'obj', '3mf', 'gcode']);
  const [maxPrintSize, setMaxPrintSize] = useSetting<number>('max_print_file_size_mb', 50);
  const [wifiGood, setWifiGood] = useSetting<number>('wifi_good_threshold_dbm', -55);
  const [wifiOk, setWifiOk] = useSetting<number>('wifi_ok_threshold_dbm', -67);
  const [wifiPoor, setWifiPoor] = useSetting<number>('wifi_poor_threshold_dbm', -75);
  const [wifiMinDownload, setWifiMinDownload] = useSetting<number>('wifi_min_download_mbps', 25);
  const [lessonStart, setLessonStart] = useSetting<string>('lesson_start_time', '08:00');
  const [lessonDuration, setLessonDuration] = useSetting<number>('lesson_duration_minutes', 45);
  const [lessonBreak, setLessonBreak] = useSetting<number>('lesson_break_minutes', 15);
  const [aiEnabled, setAiEnabled] = useSetting<boolean>('ai_suggestions_enabled', true);
  const [lowStockNotif, setLowStockNotif] = useSetting<boolean>('low_stock_notification', true);

  const loadAll = async () => {
    setLoading(true);
    await loadSettings();
    const { data: catData } = await supabase.from('ticket_categories').select('*').order('sort_order');
    setCategories((catData ?? []) as TicketCategory[]);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const toggleCategory = async (cat: TicketCategory) => {
    const { error } = await supabase.from('ticket_categories').update({ is_enabled: !cat.is_enabled }).eq('id', cat.id);
    if (error) { toast(error.message, 'error'); return; }
    setCategories(categories.map((c) => c.id === cat.id ? { ...c, is_enabled: !c.is_enabled } : c));
    toast('Kategorie aktualisiert', 'success');
  };

  if (loading) return <LoadingScreen message="Einstellungen werden geladen..." />;

  const tabs = [
    { id: 'general' as const, label: 'Allgemein', icon: Settings },
    { id: 'security' as const, label: 'Sicherheit', icon: Shield },
    { id: 'wifi' as const, label: 'WLAN', icon: Wifi },
    { id: 'printing' as const, label: '3D-Druck', icon: Printer },
    { id: 'tickets' as const, label: 'Tickets', icon: Sliders },
    { id: 'inventory' as const, label: 'Inventar', icon: Boxes },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Systemeinstellungen" subtitle="Zentrale Konfigurationsverwaltung" />

      <div className="flex gap-1 border-b border-slate-800 overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('tab whitespace-nowrap', tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200')}>
            <t.icon className="mr-1.5 inline h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="space-y-4">
          <SettingCard title="Organisation" icon={Settings}>
            <SettingInput label="Name der Organisation" value={orgName} onChange={setOrgName} />
          </SettingCard>
          <SettingCard title="Stundenplan" icon={Clock}>
            <div className="grid grid-cols-3 gap-4">
              <SettingInput label="Beginn erste Stunde" value={lessonStart} onChange={setLessonStart} />
              <SettingInput label="Stundendauer (Min.)" type="number" value={lessonDuration} onChange={setLessonDuration} />
              <SettingInput label="Pausendauer (Min.)" type="number" value={lessonBreak} onChange={setLessonBreak} />
            </div>
          </SettingCard>
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-4">
          <SettingCard title="Auto-Sperre" icon={Shield}>
            <SettingInput label="Inaktivitaets-Timeout (Minuten)" type="number" value={autoLogoutMinutes} onChange={setAutoLogoutMinutes} />
            <SettingToggle label="Administratoren von Auto-Sperre befreit" value={autoLogoutAdminExempt} onChange={setAutoLogoutAdminExempt} />
          </SettingCard>
          <SettingCard title="Ausleihsicherheit" icon={Shield}>
            <SettingToggle label="Unterschrift bei Ausleihe erforderlich" value={signatureRequired} onChange={setSignatureRequired} />
            <SettingToggle label="Lehrer duerfen Geraete selbst zurueckgeben" value={teacherSelfReturn} onChange={setTeacherSelfReturn} />
          </SettingCard>
        </div>
      )}

      {tab === 'wifi' && (
        <SettingCard title="WLAN-Schwellwerte" icon={Wifi}>
          <div className="grid grid-cols-2 gap-4">
            <SettingInput label="Gutes Signal (dBm)" type="number" value={wifiGood} onChange={setWifiGood} />
            <SettingInput label="OK Signal (dBm)" type="number" value={wifiOk} onChange={setWifiOk} />
            <SettingInput label="Schlechtes Signal (dBm)" type="number" value={wifiPoor} onChange={setWifiPoor} />
            <SettingInput label="Min. Download-Geschw. (Mbps)" type="number" value={wifiMinDownload} onChange={setWifiMinDownload} />
          </div>
        </SettingCard>
      )}

      {tab === 'printing' && (
        <SettingCard title="3D-Druck" icon={Printer}>
          <div>
            <label className="label">Unterstützte Dateiformate</label>
            <div className="flex flex-wrap gap-2">
              {['stl', 'obj', '3mf', 'gcode', 'ply', 'step'].map((fmt) => {
                const enabled = supportedFormats.includes(fmt);
                return (
                  <button key={fmt} onClick={() => setSupportedFormats(enabled ? supportedFormats.filter((f) => f !== fmt) : [...supportedFormats, fmt])}
                    className={cn('badge border transition-colors', enabled ? 'bg-blue-600/15 border-blue-500 text-blue-300' : 'bg-slate-800 border-slate-700 text-slate-500')}>
                    {enabled && <ToggleRight className="h-3 w-3" />}.{fmt}
                  </button>
                );
              })}
            </div>
          </div>
          <SettingInput label="Max. Dateigroesse (MB)" type="number" value={maxPrintSize} onChange={setMaxPrintSize} />
        </SettingCard>
      )}

      {tab === 'tickets' && (
        <SettingCard title="Ticket-Kategorien" icon={Sliders}>
          <p className="text-xs text-slate-400 mb-3">Ticket-Kategorien aktivieren oder deaktivieren. Deaktivierte Kategorien erscheinen nicht im Ticket-Erstellungsformular.</p>
          <div className="space-y-2">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
                <div>
                  <div className="text-sm font-medium text-slate-200">{cat.name}</div>
                  <div className="text-xs text-slate-500">{cat.description}</div>
                </div>
                <button onClick={() => toggleCategory(cat)} className={cn('flex items-center gap-2 text-sm', cat.is_enabled ? 'text-emerald-400' : 'text-slate-500')}>
                  {cat.is_enabled ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                  {cat.is_enabled ? 'Aktiviert' : 'Deaktiviert'}
                </button>
              </div>
            ))}
          </div>
        </SettingCard>
      )}

      {tab === 'inventory' && (
        <div className="space-y-4">
          <SettingCard title="Automatisierung" icon={Cpu}>
            <SettingToggle label="KI-Workflow-Optimierungsvorschlaege aktivieren" value={aiEnabled} onChange={setAiEnabled} />
            <SettingToggle label="Benachrichtigungen bei niedrigem Bestand senden" value={lowStockNotif} onChange={setLowStockNotif} />
          </SettingCard>
        </div>
      )}
    </div>
  );
}

function SettingCard({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200"><Icon className="h-4 w-4 text-blue-400" /> {title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SettingInput<T extends string | number>({ label, value, onChange, type = 'text' }: { label: string; value: T; onChange: (v: T) => void; type?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} className="input" value={value} onChange={(e) => onChange((type === 'number' ? Number(e.target.value) : e.target.value) as T)} onBlur={() => {}} />
    </div>
  );
}

function SettingToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex w-full items-center justify-between rounded-lg border border-slate-800 p-3 hover:bg-slate-800/30">
      <span className="text-sm text-slate-300">{label}</span>
      {value ? <ToggleRight className="h-6 w-6 text-emerald-400" /> : <ToggleLeft className="h-6 w-6 text-slate-500" />}
    </button>
  );
}
