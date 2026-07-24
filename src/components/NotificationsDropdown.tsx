import { useEffect, useState, useRef } from 'react';
import { Bell, Check } from 'lucide-react';
import { supabase } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import type { AppNotification } from '@/lib/types';
import { timeAgo, cn } from '@/lib/utils';

export function NotificationsDropdown({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .or(`user_id.eq.${profile.id},user_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(20);
      setNotifications((data ?? []) as AppNotification[]);
      setLoading(false);
    };
    load();

    channel = supabase
      .channel('notifications-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload: any) => {
        const n = payload.new as AppNotification;
        if (n.user_id === null || n.user_id === profile.id) {
          setNotifications((prev) => [n, ...prev].slice(0, 20));
        }
      })
      .subscribe();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [profile]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const markAllRead = async () => {
    const ids = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length) await supabase.from('notifications').update({ is_read: true }).in('id', ids);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div ref={ref} className="absolute right-0 top-10 w-80 card p-0 animate-scale-in z-50">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-200">Notifications</span>
          {unread > 0 && <span className="badge bg-blue-500/15 border-blue-500/30 text-blue-300">{unread} new</span>}
        </div>
        <button onClick={markAllRead} className="text-xs text-blue-400 hover:underline">Mark all read</button>
      </div>
      <div className="scrollbar-thin max-h-80 overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">No notifications</div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={cn('flex items-start gap-2.5 border-b border-slate-800/50 px-4 py-3 hover:bg-slate-800/30', !n.is_read && 'bg-blue-950/20')}
            >
              {!n.is_read && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-400" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-200">{n.title}</div>
                <div className="text-xs text-slate-400">{n.message}</div>
                <div className="mt-0.5 text-[10px] text-slate-600">{timeAgo(n.created_at)}</div>
              </div>
              <button onClick={() => markRead(n.id)} className="btn-icon h-6 w-6">
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
