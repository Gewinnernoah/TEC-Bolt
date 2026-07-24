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
    toast('Category updated', 'success');
  };

  if (loading) return <LoadingScreen message="Loading settings..." />;

  const tabs = [
    { id: 'general' as const, label: 'General', icon: Settings },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'wifi' as const, label: 'Wi-Fi', icon: Wifi },
    { id: 'printing' as const, label: '3D Printing', icon: Printer },
    { id: 'tickets' as const, label: 'Tickets', icon: Sliders },
    { id: 'inventory' as const, label: 'Inventory', icon: Boxes },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="System Settings" subtitle="Centralized configuration management" />

      <div className="flex gap-1 border-b border-slate-800 overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('tab whitespace-nowrap', tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200')}>
            <t.icon className="mr-1.5 inline h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="space-y-4">
          <SettingCard title="Organization" icon={Settings}>
            <SettingInput label="Organization Name" value={orgName} onChange={setOrgName} />
          </SettingCard>
          <SettingCard title="Lesson Schedule" icon={Clock}>
            <div className="grid grid-cols-3 gap-4">
              <SettingInput label="Lesson Start Time" value={lessonStart} onChange={setLessonStart} />
              <SettingInput label="Lesson Duration (min)" type="number" value={lessonDuration} onChange={setLessonDuration} />
              <SettingInput label="Break Duration (min)" type="number" value={lessonBreak} onChange={setLessonBreak} />
            </div>
          </SettingCard>
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-4">
          <SettingCard title="Auto-Logout" icon={Shield}>
            <SettingInput label="Inactivity Timeout (minutes)" type="number" value={autoLogoutMinutes} onChange={setAutoLogoutMinutes} />
            <SettingToggle label="Admins exempt from auto-logout" value={autoLogoutAdminExempt} onChange={setAutoLogoutAdminExempt} />
          </SettingCard>
          <SettingCard title="Lending Security" icon={Shield}>
            <SettingToggle label="Require signature on lending checkout" value={signatureRequired} onChange={setSignatureRequired} />
            <SettingToggle label="Allow teachers to return devices themselves" value={teacherSelfReturn} onChange={setTeacherSelfReturn} />
          </SettingCard>
        </div>
      )}

      {tab === 'wifi' && (
        <SettingCard title="Wi-Fi Thresholds" icon={Wifi}>
          <div className="grid grid-cols-2 gap-4">
            <SettingInput label="Good Signal (dBm)" type="number" value={wifiGood} onChange={setWifiGood} />
            <SettingInput label="OK Signal (dBm)" type="number" value={wifiOk} onChange={setWifiOk} />
            <SettingInput label="Poor Signal (dBm)" type="number" value={wifiPoor} onChange={setWifiPoor} />
            <SettingInput label="Min Download Speed (Mbps)" type="number" value={wifiMinDownload} onChange={setWifiMinDownload} />
          </div>
        </SettingCard>
      )}

      {tab === 'printing' && (
        <SettingCard title="3D Printing" icon={Printer}>
          <div>
            <label className="label">Supported File Formats</label>
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
          <SettingInput label="Max File Size (MB)" type="number" value={maxPrintSize} onChange={setMaxPrintSize} />
        </SettingCard>
      )}

      {tab === 'tickets' && (
        <SettingCard title="Ticket Categories" icon={Sliders}>
          <p className="text-xs text-slate-400 mb-3">Enable or disable ticket categories. Disabled categories won't appear in the ticket creation form.</p>
          <div className="space-y-2">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
                <div>
                  <div className="text-sm font-medium text-slate-200">{cat.name}</div>
                  <div className="text-xs text-slate-500">{cat.description}</div>
                </div>
                <button onClick={() => toggleCategory(cat)} className={cn('flex items-center gap-2 text-sm', cat.is_enabled ? 'text-emerald-400' : 'text-slate-500')}>
                  {cat.is_enabled ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                  {cat.is_enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        </SettingCard>
      )}

      {tab === 'inventory' && (
        <div className="space-y-4">
          <SettingCard title="Automation" icon={Cpu}>
            <SettingToggle label="Enable AI workflow optimization suggestions" value={aiEnabled} onChange={setAiEnabled} />
            <SettingToggle label="Send low-stock notifications" value={lowStockNotif} onChange={setLowStockNotif} />
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
