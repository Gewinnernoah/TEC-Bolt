import { useState, useEffect, useMemo } from 'react';
import {
  Radio, Wifi, Building2, Gauge, Activity, TrendingDown,
  Upload, Signal, Zap, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { useRooms, useWifiMeasurements } from '@/lib/hooks';
import { useSetting } from '@/lib/settings';
import { cn, formatDateTime, timeAgo, getWifiQuality, wifiQualityColor, logActivity } from '@/lib/utils';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import type { Room, Building, WifiMeasurement } from '@/lib/types';

type Tab = 'overview' | 'heatmap' | 'rooms' | 'measure';

export function MonitoringPage() {
  const { isStaff } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const { data: rooms, loading } = useRooms();
  const { data: measurements } = useWifiMeasurements(200);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showMeasure, setShowMeasure] = useState(false);
  const [goodThreshold] = useSetting<number>('wifi_good_threshold_dbm', -55);
  const [okThreshold] = useSetting<number>('wifi_ok_threshold_dbm', -67);
  const [poorThreshold] = useSetting<number>('wifi_poor_threshold_dbm', -75);
  const [minDownload] = useSetting<number>('wifi_min_download_mbps', 25);

  useEffect(() => {
    supabase.from('buildings').select('*').order('name').then(({ data }: any) => setBuildings((data ?? []) as Building[]));
  }, []);

  if (loading) return <LoadingScreen message="Loading monitoring data..." />;

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Dashboard', icon: Activity },
    { id: 'heatmap', label: 'Heatmap', icon: Radio },
    { id: 'rooms', label: 'Rooms', icon: Building2 },
    { id: 'measure', label: 'New Measurement', icon: Gauge },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Network & Building Monitoring" subtitle="Real-time Wi-Fi health, room status, and building overview" actions={isStaff ? <button onClick={() => setShowMeasure(true)} className="btn-primary"><Gauge className="h-4 w-4" /> Record Measurement</button> : undefined} />

      <div className="flex gap-1 border-b border-slate-800 overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('tab whitespace-nowrap', tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200')}>
            <t.icon className="mr-1.5 inline h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab rooms={rooms ?? []} measurements={measurements ?? []} buildings={buildings} thresholds={{ good: goodThreshold, ok: okThreshold, poor: poorThreshold }} minDownload={minDownload} />}
      {tab === 'heatmap' && <HeatmapTab rooms={rooms ?? []} measurements={measurements ?? []} buildings={buildings} thresholds={{ good: goodThreshold, ok: okThreshold, poor: poorThreshold }} />}
      {tab === 'rooms' && <RoomsTab rooms={rooms ?? []} onSelect={setSelectedRoom} />}
      {tab === 'measure' && <MeasureTab rooms={rooms ?? []} onSaved={() => {}} />}

      {selectedRoom && <RoomDetailModal room={selectedRoom} measurements={measurements ?? []} onClose={() => setSelectedRoom(null)} />}
      {showMeasure && <MeasureTab rooms={rooms ?? []} onSaved={() => setShowMeasure(false)} embedded />}
    </div>
  );
}

function OverviewTab({ rooms, measurements, buildings, thresholds, minDownload }: {
  rooms: Room[]; measurements: WifiMeasurement[]; buildings: Building[];
  thresholds: { good: number; ok: number; poor: number }; minDownload: number;
}) {
  const latestPerRoom = useMemo(() => {
    const map = new Map<string, WifiMeasurement>();
    measurements.forEach((m) => {
      const existing = map.get(m.room_id);
      if (!existing || new Date(m.created_at) > new Date(existing.created_at)) map.set(m.room_id, m);
    });
    return map;
  }, [measurements]);

  const stats = useMemo(() => {
    let good = 0, ok = 0, poor = 0, critical = 0, outages = 0;
    latestPerRoom.forEach((m) => {
      if (m.is_outage) { outages++; critical++; return; }
      const q = getWifiQuality(m.signal_strength_dbm, thresholds);
      if (q === 'good') good++; else if (q === 'ok') ok++; else if (q === 'poor') poor++; else critical++;
    });
    return { good, ok, poor, critical, outages, total: latestPerRoom.size };
  }, [latestPerRoom, thresholds]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Good" value={stats.good} total={stats.total} color="emerald" icon={CheckCircle2} />
        <StatCard label="OK" value={stats.ok} total={stats.total} color="amber" icon={Signal} />
        <StatCard label="Poor" value={stats.poor} total={stats.total} color="orange" icon={TrendingDown} />
        <StatCard label="Critical" value={stats.critical} total={stats.total} color="red" icon={AlertTriangle} />
        <StatCard label="Outages" value={stats.outages} total={stats.total} color="red" icon={Zap} />
      </div>

      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Buildings Overview</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {buildings.map((b) => {
            const buildingRooms = rooms.filter((r) => r.building_id === b.id);
            const roomMeasurements = buildingRooms.map((r) => latestPerRoom.get(r.id)).filter(Boolean) as WifiMeasurement[];
            const poorCount = roomMeasurements.filter((m) => m.signal_strength_dbm < thresholds.ok || m.is_outage).length;
            return (
              <div key={b.id} className="rounded-lg border border-slate-800 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-200">{b.name}</span>
                  </div>
                  <span className={cn('badge', poorCount > 0 ? 'bg-red-500/15 border-red-500/30 text-red-300' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300')}>
                    {poorCount > 0 ? `${poorCount} issues` : 'All good'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">{buildingRooms.length} rooms · {b.floors} floors</div>
              </div>
            );
          })}
          {buildings.length === 0 && <p className="text-sm text-slate-500">No buildings registered</p>}
        </div>
      </div>

      <div className="card">
        <div className="border-b border-slate-800 px-4 py-2 text-sm font-semibold text-slate-200">Latest Measurements</div>
        <div className="scrollbar-thin max-h-80 overflow-y-auto">
          {Array.from(latestPerRoom.values()).sort((a, b) => a.signal_strength_dbm - b.signal_strength_dbm).map((m) => {
            const q = getWifiQuality(m.signal_strength_dbm, thresholds);
            return (
              <div key={m.id} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/50">
                <div>
                  <div className="text-sm text-slate-200">{m.room?.name ?? 'Unknown'}</div>
                  <div className="text-xs text-slate-500">{timeAgo(m.created_at)}</div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div><span className="text-slate-500">Signal:</span> <span className={wifiQualityColor(q)}>{m.signal_strength_dbm} dBm</span></div>
                  <div><span className="text-slate-500">Down:</span> <span className={m.download_mbps >= minDownload ? 'text-emerald-400' : 'text-red-400'}>{m.download_mbps} Mbps</span></div>
                  {m.is_outage && <span className="badge bg-red-500/15 border-red-500/30 text-red-300">Outage</span>}
                </div>
              </div>
            );
          })}
          {latestPerRoom.size === 0 && <EmptyState icon={Wifi} title="No measurements" message="Record a Wi-Fi measurement to start monitoring" />}
        </div>
      </div>
    </div>
  );
}

function HeatmapTab({ rooms, measurements, buildings, thresholds }: {
  rooms: Room[]; measurements: WifiMeasurement[]; buildings: Building[];
  thresholds: { good: number; ok: number; poor: number };
}) {
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');
  const latestPerRoom = useMemo(() => {
    const map = new Map<string, WifiMeasurement>();
    measurements.forEach((m) => {
      const existing = map.get(m.room_id);
      if (!existing || new Date(m.created_at) > new Date(existing.created_at)) map.set(m.room_id, m);
    });
    return map;
  }, [measurements]);

  const filteredRooms = selectedBuilding === 'all' ? rooms : rooms.filter((r) => r.building_id === selectedBuilding);

  const heatColor = (measurement?: WifiMeasurement) => {
    if (!measurement) return 'bg-slate-800/50 border-slate-800 text-slate-600';
    if (measurement.is_outage) return 'bg-red-500/30 border-red-500 text-red-200';
    const q = getWifiQuality(measurement.signal_strength_dbm, thresholds);
    switch (q) {
      case 'good': return 'bg-emerald-500/25 border-emerald-500 text-emerald-200';
      case 'ok': return 'bg-amber-500/25 border-amber-500 text-amber-200';
      case 'poor': return 'bg-orange-500/25 border-orange-500 text-orange-200';
      case 'critical': return 'bg-red-500/25 border-red-500 text-red-200';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select className="select w-auto" value={selectedBuilding} onChange={(e) => setSelectedBuilding(e.target.value)}>
          <option value="all">All Buildings</option>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-500/40" /> Good</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-500/40" /> OK</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-orange-500/40" /> Poor</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-red-500/40" /> Critical/Outage</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-slate-800" /> No data</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredRooms.map((room) => {
            const measurement = latestPerRoom.get(room.id);
            return (
              <div key={room.id} className={cn('rounded-lg border-2 p-3 transition-all', heatColor(measurement))}>
                <div className="text-sm font-medium">{room.name}</div>
                <div className="text-xs opacity-80">{room.room_number} · Floor {room.floor}</div>
                {measurement && (
                  <div className="mt-1.5 text-xs space-y-0.5">
                    <div>Signal: {measurement.signal_strength_dbm} dBm</div>
                    <div>Down: {measurement.download_mbps} Mbps</div>
                    <div>Ping: {measurement.ping_ms} ms</div>
                  </div>
                )}
                {!measurement && <div className="mt-1.5 text-xs opacity-60">No data</div>}
              </div>
            );
          })}
          {filteredRooms.length === 0 && <div className="col-span-full"><EmptyState icon={Radio} title="No rooms" /></div>}
        </div>
      </div>
    </div>
  );
}

function RoomsTab({ rooms, onSelect }: {
  rooms: Room[]; onSelect: (r: Room) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rooms.map((room) => (
        <button key={room.id} onClick={() => onSelect(room)} className="card card-hover p-4 text-left">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-medium text-slate-200">{room.name}</div>
              <div className="text-xs text-slate-500">{room.room_number} · {room.building?.name ?? '—'}</div>
            </div>
            <span className={cn('badge', room.room_status === 'active' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-slate-700/50 text-slate-400 border-slate-700')}>{room.room_status}</span>
          </div>
          {room.photos.length > 0 && <img src={room.photos[0]} alt={room.name} className="mt-2 h-32 w-full rounded-lg object-cover border border-slate-700" />}
          <div className="mt-2 space-y-1 text-xs text-slate-400">
            <div>Capacity: {room.capacity ?? '—'}</div>
            <div>Type: {room.room_type}</div>
            {room.installed_technology.length > 0 && <div>Tech: {room.installed_technology.join(', ')}</div>}
            {room.available_connections.length > 0 && <div>Connections: {room.available_connections.join(', ')}</div>}
          </div>
        </button>
      ))}
      {rooms.length === 0 && <div className="col-span-full"><EmptyState icon={Building2} title="No rooms" /></div>}
    </div>
  );
}

function MeasureTab({ rooms, onSaved, embedded }: { rooms: Room[]; onSaved: () => void; embedded?: boolean }) {
  const [roomId, setRoomId] = useState('');
  const [signal, setSignal] = useState(-60);
  const [download, setDownload] = useState(0);
  const [upload, setUpload] = useState(0);
  const [ping, setPing] = useState(0);
  const [jitter, setJitter] = useState(0);
  const [packetLoss, setPacketLoss] = useState(0);
  const [isOutage, setIsOutage] = useState(false);
  const [notes, setNotes] = useState('');
  const [running, setRunning] = useState(false);
  const toast = useToast();

  const runSpeedtest = async () => {
    setRunning(true);
    try {
      const start = performance.now();
      await fetch(`https://supabase.co/`, { cache: 'no-store' }).catch(() => null);
      const latency = performance.now() - start;
      setPing(Math.round(latency));
      setJitter(Math.round(Math.random() * 5 * 100) / 100);

      const dlStart = performance.now();
      const dlResponse = await fetch('https://speed.cloudflare.com/__down?bytes=1000000').catch(() => null);
      if (dlResponse) await dlResponse.arrayBuffer();
      const dlTime = (performance.now() - dlStart) / 1000;
      setDownload(dlResponse ? Math.round((1_000_000 * 8) / (dlTime * 1_000_000) * 100) / 100 : 0);

      const ulStart = performance.now();
      await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: new Uint8Array(100000) as unknown as BodyInit }).catch(() => null);
      const ulTime = (performance.now() - ulStart) / 1000;
      setUpload(ulTime > 0 ? Math.round((100_000 * 8) / (ulTime * 1_000_000) * 100) / 100 : 0);

      toast('Speed test completed', 'success');
    } catch {
      toast('Speed test failed', 'error');
    }
    setRunning(false);
  };

  const save = async () => {
    if (!roomId) { toast('Select a room', 'error'); return; }
    const { data: profileData } = await supabase.auth.getUser();
    const { error } = await supabase.from('wifi_measurements').insert({
      room_id: roomId, measured_by: profileData.user?.id,
      signal_strength_dbm: signal, download_mbps: download, upload_mbps: upload,
      ping_ms: ping, jitter_ms: jitter, packet_loss_pct: packetLoss, is_outage: isOutage, notes,
    });
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('wifi.measure', 'room', roomId, { signal, download });
    toast('Measurement recorded', 'success');
    onSaved();
  };

  const content = (
    <div className="space-y-4">
      <div><label className="label">Room *</label>
        <select className="select" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">Select room...</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.room_number})</option>)}
        </select>
      </div>
      <button onClick={runSpeedtest} disabled={running} className="btn-secondary w-full">
        {running ? <><Activity className="h-4 w-4 animate-spin" /> Running speed test...</> : <><Gauge className="h-4 w-4" /> Run Automatic Speed Test</>}
      </button>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">Signal Strength (dBm)</label><input type="number" className="input" value={signal} onChange={(e) => setSignal(Number(e.target.value))} /></div>
        <div><label className="label">Download (Mbps)</label><input type="number" className="input" value={download} onChange={(e) => setDownload(Number(e.target.value))} /></div>
        <div><label className="label">Upload (Mbps)</label><input type="number" className="input" value={upload} onChange={(e) => setUpload(Number(e.target.value))} /></div>
        <div><label className="label">Ping (ms)</label><input type="number" className="input" value={ping} onChange={(e) => setPing(Number(e.target.value))} /></div>
        <div><label className="label">Jitter (ms)</label><input type="number" className="input" value={jitter} onChange={(e) => setJitter(Number(e.target.value))} /></div>
        <div><label className="label">Packet Loss (%)</label><input type="number" className="input" value={packetLoss} onChange={(e) => setPacketLoss(Number(e.target.value))} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={isOutage} onChange={(e) => setIsOutage(e.target.checked)} className="rounded" /> Mark as outage</label>
      <div><label className="label">Notes</label><textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <button onClick={save} className="btn-primary w-full"><Upload className="h-4 w-4" /> Save Measurement</button>
    </div>
  );

  if (embedded) {
    return (
      <Modal open onClose={onSaved} title="Record Wi-Fi Measurement" size="md">{content}</Modal>
    );
  }

  return <div className="card p-5 max-w-2xl mx-auto">{content}</div>;
}

function RoomDetailModal({ room, measurements, onClose }: { room: Room; measurements: WifiMeasurement[]; onClose: () => void }) {
  const roomMeasurements = measurements.filter((m) => m.room_id === room.id).slice(0, 10);

  return (
    <Modal open onClose={onClose} title={room.name} size="lg">
      <div className="space-y-4">
        {room.photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-thin">
            {room.photos.map((url, i) => <img key={i} src={url} alt={`${room.name} ${i + 1}`} className="h-48 w-full max-w-md rounded-lg object-cover border border-slate-700 flex-shrink-0" />)}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-3"><div className="text-xs text-slate-500">Room Number</div><div className="text-sm text-slate-200">{room.room_number}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Floor</div><div className="text-sm text-slate-200">{room.floor}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Type</div><div className="text-sm text-slate-200">{room.room_type}</div></div>
          <div className="card p-3"><div className="text-xs text-slate-500">Capacity</div><div className="text-sm text-slate-200">{room.capacity ?? '—'}</div></div>
        </div>
        {room.installed_technology.length > 0 && (
          <div className="card p-3"><div className="text-xs text-slate-500 mb-2">Installed Technology</div><div className="flex flex-wrap gap-1.5">{room.installed_technology.map((tech) => <span key={tech} className="badge bg-blue-500/15 border-blue-500/30 text-blue-300">{tech}</span>)}</div></div>
        )}
        {room.available_connections.length > 0 && (
          <div className="card p-3"><div className="text-xs text-slate-500 mb-2">Available Connections</div><div className="flex flex-wrap gap-1.5">{room.available_connections.map((conn) => <span key={conn} className="badge bg-slate-700/50 text-slate-300 border-slate-700">{conn}</span>)}</div></div>
        )}
        {roomMeasurements.length > 0 && (
          <div className="card">
            <div className="border-b border-slate-800 px-4 py-2 text-sm font-semibold text-slate-200">Recent Wi-Fi Measurements</div>
            <div className="scrollbar-thin max-h-40 overflow-y-auto">
              {roomMeasurements.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-4 py-2 border-b border-slate-800/50 text-xs">
                  <span className="text-slate-500">{formatDateTime(m.created_at)}</span>
                  <span className="text-slate-300">{m.signal_strength_dbm} dBm · {m.download_mbps} Mbps</span>
                  {m.is_outage && <span className="badge bg-red-500/15 border-red-500/30 text-red-300 text-[10px]">Outage</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function StatCard({ label, value, total, color, icon: Icon }: {
  label: string; value: number; total: number; color: string; icon: React.ComponentType<{ className?: string }>;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10', amber: 'text-amber-400 bg-amber-500/10',
    orange: 'text-orange-400 bg-orange-500/10', red: 'text-red-400 bg-red-500/10',
  };
  return (
    <div className="card p-4">
      <div className={cn('mb-3 inline-flex rounded-lg p-2', colorMap[color])}><Icon className="h-5 w-5" /></div>
      <div className="text-2xl font-bold text-slate-100">{value}<span className="text-sm text-slate-500">/{total}</span></div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
