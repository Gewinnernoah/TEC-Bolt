import { useState, useMemo, useEffect } from 'react';
import { BarChart3, TrendingUp, Package, HandHelping, Printer, Ticket, Wifi, Boxes } from 'lucide-react';
import { supabase } from '@/lib/db';
import { cn, formatNumber } from '@/lib/utils';
import { PageHeader, LoadingScreen } from '@/components/ui';
import type { LendingLoan, PrintRequest, Ticket as TicketType, Device, WifiMeasurement, Consumable } from '@/lib/types';

type Tab = 'lending' | 'devices' | 'rooms' | 'wifi' | 'tickets' | 'prints' | 'consumables';

export function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('lending');
  const [loans, setLoans] = useState<LendingLoan[]>([]);
  const [prints, setPrints] = useState<PrintRequest[]>([]);
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [wifi, setWifi] = useState<WifiMeasurement[]>([]);
  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('lending_loans').select('*, teacher:profiles!lending_loans_teacher_id_fkey(*), items:lending_loan_items(*)').order('created_at', { ascending: false }).limit(500),
      supabase.from('print_requests').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('tickets').select('*, category:ticket_categories(*)').order('created_at', { ascending: false }).limit(500),
      supabase.from('devices').select('*, category:inventory_categories(*)'),
      supabase.from('wifi_measurements').select('*, room:rooms(*)').order('created_at', { ascending: false }).limit(500),
      supabase.from('consumables').select('*'),
    ]).then(([l, p, t, d, w, c]) => {
      setLoans((l.data ?? []) as LendingLoan[]);
      setPrints((p.data ?? []) as PrintRequest[]);
      setTickets((t.data ?? []) as TicketType[]);
      setDevices((d.data ?? []) as Device[]);
      setWifi((w.data ?? []) as WifiMeasurement[]);
      setConsumables((c.data ?? []) as Consumable[]);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingScreen message="Analyse wird geladen..." />;

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'lending', label: 'Ausleihe', icon: HandHelping },
    { id: 'devices', label: 'Geräte', icon: Package },
    { id: 'rooms', label: 'Räume', icon: BarChart3 },
    { id: 'wifi', label: 'WLAN', icon: Wifi },
    { id: 'tickets', label: 'Tickets', icon: Ticket },
    { id: 'prints', label: 'Drucke', icon: Printer },
    { id: 'consumables', label: 'Verbrauchsmaterialien', icon: Boxes },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Statistik & Analyse" subtitle="Detaillierte Einblicke über alle Plattformbereiche" />
      <div className="flex gap-1 border-b border-slate-800 overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('tab whitespace-nowrap', tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200')}>
            <t.icon className="mr-1.5 inline h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'lending' && <LendingAnalytics loans={loans} />}
      {tab === 'devices' && <DeviceAnalytics devices={devices} loans={loans} />}
      {tab === 'rooms' && <RoomAnalytics loans={loans} />}
      {tab === 'wifi' && <WifiAnalytics measurements={wifi} />}
      {tab === 'tickets' && <TicketAnalytics tickets={tickets} />}
      {tab === 'prints' && <PrintAnalytics prints={prints} />}
      {tab === 'consumables' && <ConsumableAnalytics consumables={consumables} />}
    </div>
  );
}

function Chart({ data, label, color = 'blue' }: { data: { label: string; value: number }[]; label: string; color?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500',
    red: 'bg-red-500', cyan: 'bg-cyan-500', violet: 'bg-violet-500',
  };
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-200">{label}</h3>
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-3">
            <div className="w-24 text-xs text-slate-400 truncate">{d.label}</div>
            <div className="flex-1 h-6 rounded bg-slate-800/50 overflow-hidden">
              <div className={cn('h-full transition-all', colorMap[color])} style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
            <div className="w-10 text-right text-xs font-medium text-slate-300">{d.value}</div>
          </div>
        ))}
        {data.length === 0 && <div className="text-sm text-slate-500 py-4 text-center">Keine Daten</div>}
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ComponentType<{ className?: string }>; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-500/10', emerald: 'text-emerald-400 bg-emerald-500/10',
    amber: 'text-amber-400 bg-amber-500/10', red: 'text-red-400 bg-red-500/10',
    cyan: 'text-cyan-400 bg-cyan-500/10', violet: 'text-violet-400 bg-violet-500/10',
  };
  return (
    <div className="card p-4">
      <div className={cn('mb-2 inline-flex rounded-lg p-2', colorMap[color] ?? colorMap.blue)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function LendingAnalytics({ loans }: { loans: LendingLoan[] }) {
  const byTeacher = useMemo(() => {
    const map = new Map<string, number>();
    loans.forEach((l) => { const name = l.teacher?.full_name ?? 'Unbekannt'; map.set(name, (map.get(name) ?? 0) + 1); });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [loans]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    loans.forEach((l) => { const month = new Date(l.created_at).toLocaleDateString(undefined, { month: 'short' }); map.set(month, (map.get(month) ?? 0) + 1); });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [loans]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatBox label="Ausleihen gesamt" value={formatNumber(loans.length)} icon={HandHelping} color="blue" />
        <StatBox label="Aktiv" value={loans.filter((l) => l.status === 'active').length} icon={TrendingUp} color="emerald" />
        <StatBox label="Zurückgegeben" value={loans.filter((l) => l.status === 'returned').length} icon={Package} color="cyan" />
        <StatBox label="Überfällig" value={loans.filter((l) => l.status === 'overdue').length} icon={Ticket} color="red" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Chart data={byMonth} label="Ausleihen pro Monat" color="blue" />
        <Chart data={byTeacher} label="Top-Ausleiher" color="emerald" />
      </div>
    </div>
  );
}

function DeviceAnalytics({ devices, loans }: { devices: Device[]; loans: LendingLoan[] }) {
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    devices.forEach((d) => { const name = d.category?.name ?? 'Ohne Kategorie'; map.set(name, (map.get(name) ?? 0) + 1); });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [devices]);

  const popularity = useMemo(() => {
    const map = new Map<string, number>();
    loans.forEach((l) => l.items?.forEach((item) => { const name = item.device?.name ?? 'Unbekannt'; map.set(name, (map.get(name) ?? 0) + 1); }));
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [loans]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatBox label="Geräte gesamt" value={devices.length} icon={Package} color="blue" />
        <StatBox label="Verfügbar" value={devices.filter((d) => d.status === 'available').length} icon={TrendingUp} color="emerald" />
        <StatBox label="Ausgeliehen" value={devices.filter((d) => d.status === 'borrowed').length} icon={HandHelping} color="cyan" />
        <StatBox label="Defekt" value={devices.filter((d) => d.status === 'defective').length} icon={Ticket} color="red" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Chart data={byCategory} label="Geräte nach Kategorie" color="violet" />
        <Chart data={popularity} label="Meist ausgeliehene Geräte" color="amber" />
      </div>
    </div>
  );
}

function RoomAnalytics({ loans }: { loans: LendingLoan[] }) {
  const byRoom = useMemo(() => {
    const map = new Map<string, number>();
    loans.forEach((l) => { if (l.room_id) { const name = l.room?.name ?? 'Unbekannt'; map.set(name, (map.get(name) ?? 0) + 1); } });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 15);
  }, [loans]);

  return (
    <div className="space-y-4">
      <Chart data={byRoom} label="Raum-Nutzung (nach Ausleihen)" color="cyan" />
    </div>
  );
}

function WifiAnalytics({ measurements }: { measurements: WifiMeasurement[] }) {
  const byRoom = useMemo(() => {
    const map = new Map<string, { total: number; poor: number }>();
    measurements.forEach((m) => {
      const name = m.room?.name ?? 'Unbekannt';
      const entry = map.get(name) ?? { total: 0, poor: 0 };
      entry.total++;
      if (m.signal_strength_dbm < -67 || m.is_outage) entry.poor++;
      map.set(name, entry);
    });
    return Array.from(map.entries()).map(([label, v]) => ({ label, value: v.poor })).sort((a, b) => b.value - a.value).slice(0, 15);
  }, [measurements]);

  const avgByMonth = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    measurements.forEach((m) => {
      const month = new Date(m.created_at).toLocaleDateString(undefined, { month: 'short' });
      const entry = map.get(month) ?? { sum: 0, count: 0 };
      entry.sum += m.signal_strength_dbm; entry.count++;
      map.set(month, entry);
    });
    return Array.from(map.entries()).map(([label, v]) => ({ label, value: Math.round(v.sum / v.count) }));
  }, [measurements]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatBox label="Messungen gesamt" value={measurements.length} icon={Wifi} color="blue" />
        <StatBox label="Durchschn. Signal" value={`${Math.round(measurements.reduce((a, m) => a + m.signal_strength_dbm, 0) / Math.max(measurements.length, 1))} dBm`} icon={TrendingUp} color="emerald" />
        <StatBox label="Durchschn. Download" value={`${Math.round(measurements.reduce((a, m) => a + m.download_mbps, 0) / Math.max(measurements.length, 1))} Mbps`} icon={BarChart3} color="cyan" />
        <StatBox label="Ausfaelle" value={measurements.filter((m) => m.is_outage).length} icon={Ticket} color="red" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Chart data={byRoom} label="WLAN-Probleme nach Raum" color="red" />
        <Chart data={avgByMonth} label="Durchschn. Signal pro Monat (dBm)" color="amber" />
      </div>
    </div>
  );
}

function TicketAnalytics({ tickets }: { tickets: TicketType[] }) {
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    tickets.forEach((t) => { const name = t.category?.name ?? t.category_key; map.set(name, (map.get(name) ?? 0) + 1); });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [tickets]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    tickets.forEach((t) => { const month = new Date(t.created_at).toLocaleDateString(undefined, { month: 'short' }); map.set(month, (map.get(month) ?? 0) + 1); });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [tickets]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatBox label="Tickets gesamt" value={tickets.length} icon={Ticket} color="blue" />
        <StatBox label="Offen" value={tickets.filter((t) => t.status === 'open').length} icon={TrendingUp} color="amber" />
        <StatBox label="Geloest" value={tickets.filter((t) => t.status === 'resolved').length} icon={Package} color="emerald" />
        <StatBox label="Dringend" value={tickets.filter((t) => t.escalated).length} icon={Ticket} color="red" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Chart data={byCategory} label="Tickets nach Kategorie" color="violet" />
        <Chart data={byMonth} label="Tickets pro Monat" color="amber" />
      </div>
    </div>
  );
}

function PrintAnalytics({ prints }: { prints: PrintRequest[] }) {
  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    prints.forEach((p) => { const month = new Date(p.created_at).toLocaleDateString(undefined, { month: 'short' }); map.set(month, (map.get(month) ?? 0) + 1); });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [prints]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    prints.forEach((p) => { map.set(p.status, (map.get(p.status) ?? 0) + 1); });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [prints]);

  const byMaterial = useMemo(() => {
    const map = new Map<string, number>();
    prints.forEach((p) => { if (p.filament_material) map.set(p.filament_material, (map.get(p.filament_material) ?? 0) + 1); });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [prints]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatBox label="Drucke gesamt" value={prints.length} icon={Printer} color="cyan" />
        <StatBox label="Abgeschlossen" value={prints.filter((p) => p.status === 'completed').length} icon={TrendingUp} color="emerald" />
        <StatBox label="Fehlgeschlagen" value={prints.filter((p) => p.status === 'failed').length} icon={Ticket} color="red" />
        <StatBox label="In Warteschlange" value={prints.filter((p) => p.status === 'queued' || p.status === 'printing').length} icon={Package} color="blue" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Chart data={byMonth} label="Drucke pro Monat" color="cyan" />
        <Chart data={byMaterial} label="Filament-Materialverbrauch" color="amber" />
      </div>
      <Chart data={byStatus} label="Druckstatus-Verteilung" color="violet" />
    </div>
  );
}

function ConsumableAnalytics({ consumables }: { consumables: Consumable[] }) {
  const stockLevels = useMemo(() => {
    return consumables.map((c) => ({ label: c.name, value: Math.round(c.current_stock) })).sort((a, b) => b.value - a.value);
  }, [consumables]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatBox label="Artikel gesamt" value={consumables.length} icon={Boxes} color="blue" />
        <StatBox label="Niedriger Bestand" value={consumables.filter((c) => c.current_stock <= c.min_stock).length} icon={TrendingUp} color="red" />
        <StatBox label="Bestand OK" value={consumables.filter((c) => c.current_stock > c.min_stock).length} icon={Package} color="emerald" />
        <StatBox label="Gesamtwert" value={formatNumber(consumables.reduce((a, c) => a + c.current_stock, 0))} icon={BarChart3} color="cyan" />
      </div>
      <Chart data={stockLevels} label="Aktuelle Bestandslevel" color="amber" />
    </div>
  );
}
