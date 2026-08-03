import { useState, useEffect } from 'react';
import { ArrowLeft, BookOpen, Search, ChevronDown, ChevronUp, Printer } from 'lucide-react';
import { supabase } from '@/lib/database';
import { cn } from '@/lib/utils';

interface FaqArticle {
  id: string;
  question: string;
  answer: string;
  category: string;
  is_3d_print: boolean;
  sort_order: number;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Allgemein',
  printing: '3D-Druck',
  lending: 'Ausleihe',
  network: 'Netzwerk',
  inventory: 'Inventar',
  tickets: 'Support-Tickets',
};

export function PublicFaqPage({ onBack }: { onBack: () => void }) {
  const [articles, setArticles] = useState<FaqArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('faq_articles')
        .select('*')
        .order('sort_order', { ascending: true });
      setArticles((data ?? []) as FaqArticle[]);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = articles.filter((a) => {
    if (search) {
      const q = search.toLowerCase();
      if (!a.question.toLowerCase().includes(q) && !a.answer.toLowerCase().includes(q)) return false;
    }
    if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
    return true;
  });

  const categories = Array.from(new Set(articles.map((a) => a.category)));

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-slate-200">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <button onClick={onBack} className="mb-8 flex items-center gap-2 text-sm text-slate-400 hover:text-blue-400 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/15 border border-blue-500/30">
            <BookOpen className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">FAQ & Wissensdatenbank</h1>
            <p className="text-sm text-slate-500">Häufig gestellte Fragen und Anleitungen</p>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="FAQ durchsuchen..."
              className="input pl-10"
            />
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="select sm:w-auto">
            <option value="all">Alle Kategorien</option>
            {categories.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-500">Wird geladen...</div>
        ) : filtered.length === 0 ? (
          <div className="card py-12 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-slate-600 mb-2" />
            <p className="text-slate-400">Keine FAQ-Artikel gefunden.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((article) => {
              const isOpen = expanded === article.id;
              return (
                <div key={article.id} className="card overflow-hidden">
                  <button
                    onClick={() => setExpanded(isOpen ? null : article.id)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {article.is_3d_print && <Printer className="h-4 w-4 text-cyan-400 flex-shrink-0" />}
                      <span className="text-sm font-medium text-slate-200">{article.question}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="badge bg-blue-500/10 border-blue-500/20 text-blue-300 text-[10px]">
                        {CATEGORY_LABELS[article.category] ?? article.category}
                      </span>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    </div>
                  </button>
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

        <p className="mt-8 text-center text-xs text-slate-600">
          {articles.length} Artikel · 3D-Druck-Artikel automatisch enthalten
        </p>
      </div>
    </div>
  );
}
