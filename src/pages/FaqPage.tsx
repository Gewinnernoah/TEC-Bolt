import { useState, useEffect, useMemo } from 'react';
import { BookOpen, Search, Plus, Edit, Trash2, Video, Tag, FileText, Printer, ChevronDown, ChevronUp, Play } from 'lucide-react';
import { supabase } from '@/lib/database';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui';
import { Modal, ConfirmDialog, useModal } from '@/components/Modal';
import { useToast } from '@/components/Toast';

interface FaqArticle {
  id: string;
  question: string;
  answer: string;
  category: string;
  is_3d_print: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  { key: 'general', label: 'Allgemein' },
  { key: 'printing', label: '3D-Druck' },
  { key: 'lending', label: 'Ausleihe' },
  { key: 'network', label: 'Netzwerk' },
  { key: 'inventory', label: 'Inventar' },
  { key: 'tickets', label: 'Support-Tickets' },
];

export function FaqPage() {
  const { isStaff } = useAuth();
  const [articles, setArticles] = useState<FaqArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FaqArticle | null>(null);
  const [selected, setSelected] = useState<FaqArticle | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const deleteModal = useModal();
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('faq_articles').select('*').order('sort_order', { ascending: true });
    setArticles((data ?? []) as FaqArticle[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let result = articles;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q));
    }
    if (categoryFilter !== 'all') {
      if (categoryFilter === 'printing') {
        result = result.filter((f) => f.category === 'printing' || f.is_3d_print);
      } else {
        result = result.filter((f) => f.category === categoryFilter);
      }
    }
    return result;
  }, [articles, search, categoryFilter]);

  const handleDelete = async () => {
    if (!selected) return;
    const { error } = await supabase.from('faq_articles').delete().eq('id', selected.id);
    if (error) { toast(error.message, 'error'); return; }
    toast('Artikel gelöscht', 'success');
    setSelected(null);
    deleteModal.closeModal();
    load();
  };

  if (loading) return <LoadingScreen message="Wissensdatenbank wird geladen..." />;

  return (
    <div className="space-y-5">
      <PageHeader title="FAQ & Wissensdatenbank" subtitle="Anleitungen, Tutorials und Antworten auf häufige Fragen" actions={isStaff ? <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary"><Plus className="h-4 w-4" /> Artikel hinzufügen</button> : undefined} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Artikel durchsuchen..." className="input pl-10" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="select w-auto">
          <option value="all">Alle Kategorien</option>
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={BookOpen} title="Keine Artikel gefunden" message={isStaff ? 'Ersten FAQ-Artikel hinzufügen' : 'Keine Artikel entsprechen der Suche'} /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((article) => {
            const isOpen = expanded === article.id;
            return (
              <div key={article.id} className="card overflow-hidden">
                <div className="flex items-start justify-between gap-3">
                  <button onClick={() => setExpanded(isOpen ? null : article.id)} className="flex-1 p-4 text-left">
                    <div className="flex items-center gap-2">
                      {article.is_3d_print ? <Printer className="h-4 w-4 text-cyan-400 flex-shrink-0" /> : <FileText className="h-4 w-4 text-blue-400 flex-shrink-0" />}
                      <span className="text-sm font-medium text-slate-200">{article.question}</span>
                    </div>
                    {!isOpen && <p className="mt-1 text-xs text-slate-400 line-clamp-2">{article.answer}</p>}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="badge bg-slate-800 text-slate-400 border-slate-700 text-[10px]">{CATEGORIES.find((c) => c.key === article.category)?.label ?? article.category}</span>
                      {article.is_3d_print && <span className="badge bg-cyan-500/15 border-cyan-500/30 text-cyan-300 text-[10px]"><Printer className="h-2.5 w-2.5" /> 3D-Druck</span>}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 p-2 flex-shrink-0">
                    {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    {isStaff && (
                      <>
                        <button onClick={() => { setEditing(article); setShowForm(true); }} className="btn-icon"><Edit className="h-4 w-4" /></button>
                        <button onClick={() => { setSelected(article); deleteModal.openModal(); }} className="btn-icon text-red-400"><Trash2 className="h-4 w-4" /></button>
                      </>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-slate-800 p-4 text-sm text-slate-400 leading-relaxed whitespace-pre-line">
                    {article.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && <FaqFormModal article={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); load(); }} />}
      <ConfirmDialog open={deleteModal.open} onClose={deleteModal.closeModal} onConfirm={handleDelete} title="FAQ löschen" message="Sind Sie sicher?" confirmLabel="Löschen" danger />
    </div>
  );
}

function FaqFormModal({ article, onClose, onSaved }: {
  article: FaqArticle | null; onClose: () => void; onSaved: () => void;
}) {
  const [question, setQuestion] = useState(article?.question ?? '');
  const [answer, setAnswer] = useState(article?.answer ?? '');
  const [category, setCategory] = useState(article?.category ?? 'general');
  const [is3dPrint, setIs3dPrint] = useState(article?.is_3d_print ?? false);
  const [sortOrder, setSortOrder] = useState(article?.sort_order ?? 0);
  const toast = useToast();

  const save = async () => {
    if (!question || !answer) { toast('Frage und Antwort sind erforderlich', 'error'); return; }
    const data = {
      question, answer, category,
      is_3d_print: is3dPrint || category === 'printing',
      sort_order: sortOrder,
    };
    if (article) {
      const { error } = await supabase.from('faq_articles').update(data).eq('id', article.id);
      if (error) { toast(error.message, 'error'); return; }
    } else {
      const { error } = await supabase.from('faq_articles').insert(data);
      if (error) { toast(error.message, 'error'); return; }
    }
    toast('Artikel gespeichert', 'success');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={article ? 'Artikel bearbeiten' : 'Artikel hinzufügen'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Abbrechen</button><button className="btn-primary" onClick={save}>Speichern</button></>}>
      <div className="space-y-4">
        <div><label className="label">Frage / Titel *</label><input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="z.B. Wie richte ich einen Beamer ein?" /></div>
        <div><label className="label">Kategorie</label>
          <select className="select" value={category} onChange={(e) => { setCategory(e.target.value); if (e.target.value === 'printing') setIs3dPrint(true); }}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div><label className="label">Antwort / Inhalt *</label><textarea className="input min-h-[200px]" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Ausführliche Antwort schreiben..." /></div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={is3dPrint} onChange={(e) => setIs3dPrint(e.target.checked)} className="rounded" />
            <Printer className="h-4 w-4 text-cyan-400" /> Als 3D-Druck-Artikel markieren
          </label>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-300">Sortierung:</label>
            <input type="number" className="input w-20" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
          </div>
        </div>
        {is3dPrint && (
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-300">
            Dieser Artikel erscheint automatisch sowohl in den 3D-Druck-FAQs als auch in den allgemeinen FAQs.
          </div>
        )}
      </div>
    </Modal>
  );
}
