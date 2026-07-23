import { useState, useEffect, useMemo } from 'react';
import { BookOpen, Search, Plus, Edit, Trash2, Video, Tag, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { Modal, ConfirmDialog, useModal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import type { Faq, InventoryCategory } from '@/lib/types';

export function FaqPage() {
  const { isStaff } = useAuth();
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [selected, setSelected] = useState<Faq | null>(null);
  const deleteModal = useModal();
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    const [faqRes, catRes] = await Promise.all([
      supabase.from('faqs').select('*').order('sort_order'),
      supabase.from('inventory_categories').select('*').order('name'),
    ]);
    setFaqs((faqRes.data ?? []) as Faq[]);
    setCategories((catRes.data ?? []) as InventoryCategory[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let result = faqs;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.title.toLowerCase().includes(q) || f.content.toLowerCase().includes(q) || f.tags.some((t) => t.toLowerCase().includes(q)));
    }
    if (categoryFilter !== 'all') result = result.filter((f) => f.category === categoryFilter);
    return result;
  }, [faqs, search, categoryFilter]);

  const categories2 = useMemo(() => {
    const set = new Set(faqs.map((f) => f.category));
    return Array.from(set);
  }, [faqs]);

  const handleDelete = async () => {
    if (!selected) return;
    const { error } = await supabase.from('faqs').delete().eq('id', selected.id);
    if (error) { toast(error.message, 'error'); return; }
    toast('FAQ deleted', 'success');
    setSelected(null);
    deleteModal.closeModal();
    load();
  };

  if (loading) return <LoadingScreen message="Loading knowledge base..." />;

  return (
    <div className="space-y-5">
      <PageHeader title="FAQ & Knowledge Base" subtitle="Setup instructions, tutorials, and device-specific help" actions={isStaff ? <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary"><Plus className="h-4 w-4" /> Add Article</button> : undefined} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search articles, tutorials, tags..." className="input pl-10" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="select w-auto">
          <option value="all">All Categories</option>
          {categories2.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={BookOpen} title="No articles found" message={isStaff ? 'Add the first knowledge base article' : 'No articles match your search'} /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((faq) => (
            <div key={faq.id} className="card card-hover p-4">
              <div className="flex items-start justify-between gap-4">
                <button onClick={() => setSelected(faq)} className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-slate-200">{faq.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 line-clamp-2">{faq.content}</p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="badge bg-slate-800 text-slate-400 border-slate-700 text-[10px] capitalize">{faq.category}</span>
                    {faq.tags.slice(0, 4).map((tag) => <span key={tag} className="badge bg-blue-500/10 border-blue-500/20 text-blue-300 text-[10px]"><Tag className="h-2.5 w-2.5" />{tag}</span>)}
                    {faq.video_url && <span className="badge bg-red-500/15 border-red-500/30 text-red-300 text-[10px]"><Video className="h-2.5 w-2.5" /> Video</span>}
                  </div>
                </button>
                {isStaff && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { setEditing(faq); setShowForm(true); }} className="btn-icon"><Edit className="h-4 w-4" /></button>
                    <button onClick={() => { setSelected(faq); deleteModal.openModal(); }} className="btn-icon text-red-400"><Trash2 className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && !showForm && (
        <Modal open onClose={() => setSelected(null)} title={selected.title} size="lg">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="badge bg-slate-800 text-slate-400 border-slate-700 capitalize">{selected.category}</span>
              {selected.tags.map((tag) => <span key={tag} className="badge bg-blue-500/10 border-blue-500/20 text-blue-300 text-[10px]">{tag}</span>)}
            </div>
            <div className="prose prose-invert max-w-none text-sm text-slate-300 whitespace-pre-wrap">{selected.content}</div>
            {selected.video_url && (
              <div className="mt-4">
                <a href={selected.video_url} target="_blank" rel="noreferrer" className="btn-secondary"><Video className="h-4 w-4" /> Watch Video Tutorial</a>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showForm && <FaqFormModal faq={editing} categories={categories} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); load(); }} />}

      <ConfirmDialog open={deleteModal.open} onClose={deleteModal.closeModal} onConfirm={handleDelete} title="Delete FAQ" message="Are you sure?" confirmLabel="Delete" danger />
    </div>
  );
}

function FaqFormModal({ faq, categories, onClose, onSaved }: {
  faq: Faq | null; categories: InventoryCategory[]; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(faq?.title ?? '');
  const [category, setCategory] = useState(faq?.category ?? 'general');
  const [content, setContent] = useState(faq?.content ?? '');
  const [tags, setTags] = useState((faq?.tags ?? []).join(', '));
  const [videoUrl, setVideoUrl] = useState(faq?.video_url ?? '');
  const [deviceCategoryId, setDeviceCategoryId] = useState(faq?.device_category_id ?? '');
  const toast = useToast();

  const save = async () => {
    if (!title || !content) { toast('Title and content are required', 'error'); return; }
    const data: Record<string, unknown> = {
      title, category, content,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      video_url: videoUrl || null,
      device_category_id: deviceCategoryId || null,
    };
    if (faq) {
      const { error } = await supabase.from('faqs').update(data).eq('id', faq.id);
      if (error) { toast(error.message, 'error'); return; }
    } else {
      const { error } = await supabase.from('faqs').insert(data);
      if (error) { toast(error.message, 'error'); return; }
    }
    toast('Article saved', 'success');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={faq ? 'Edit Article' : 'Add Article'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
      <div className="space-y-4">
        <div><label className="label">Title</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Category</label><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="general, setup, tutorial..." /></div>
          <div><label className="label">Device Category (optional)</label>
            <select className="select" value={deviceCategoryId} onChange={(e) => setDeviceCategoryId(e.target.value)}>
              <option value="">None</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">Content</label><textarea className="input min-h-[200px]" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write the article content..." /></div>
        <div><label className="label">Tags (comma-separated)</label><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="setup, projector, wifi..." /></div>
        <div><label className="label">Video URL (optional)</label><input className="input" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/..." /></div>
      </div>
    </Modal>
  );
}
