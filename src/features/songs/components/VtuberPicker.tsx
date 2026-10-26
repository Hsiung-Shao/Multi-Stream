// VTuber 選擇器（後台歌回編輯器、社群投稿頁共用）：依名稱搜尋 vtubers（anon PostgREST），或直接貼 uuid。
// 搜尋打字停 0.3 秒才查，換字或卸載時取消上一筆。

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { searchVtubers, useVtuberNames, type VtuberOption } from '../streamLookup';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

export function VtuberPicker({ value, onChange, id }: { value: string | null; onChange: (id: string | null) => void; id?: string }) {
    const { t } = useTranslation('songs');
    const names = useVtuberNames(value ? [value] : []);
    const selected = value ? names.data?.get(value) : undefined;
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<VtuberOption[]>([]);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        const q = query.trim();
        if (!q) {
            setResults([]);
            setError(false);
            return;
        }
        const ctrl = new AbortController();
        const timer = setTimeout(() => {
            setSearching(true);
            searchVtubers(q, ctrl.signal)
                .then((rows) => { setResults(rows); setError(false); })
                .catch(() => { if (!ctrl.signal.aborted) setError(true); })
                .finally(() => { if (!ctrl.signal.aborted) setSearching(false); });
        }, 300);
        return () => { clearTimeout(timer); ctrl.abort(); };
    }, [query]);

    if (value) {
        return (
            <div className="flex h-9 items-center gap-2 rounded-md border border-border px-2.5">
                {selected?.img_url && <img src={selected.img_url} alt="" className="size-6 rounded-full object-cover" />}
                <span className="min-w-0 flex-1 truncate text-sm">{selected?.name ?? (names.isLoading ? t('editor.vtuberLoading') : value)}</span>
                <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => onChange(null)} aria-label={t('editor.vtuberClear')} title={t('editor.vtuberClear')}>
                    <X className="size-3.5" />
                </Button>
            </div>
        );
    }

    return (
        <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
                id={id}
                value={query}
                onChange={(e) => {
                    const v = e.target.value;
                    // 直接貼 VTuber 的 uuid 也可以
                    if (UUID_RE.test(v.trim())) {
                        onChange(v.trim());
                        setQuery('');
                        return;
                    }
                    setQuery(v);
                }}
                placeholder={t('editor.vtuberSearch')}
                aria-label={t('editor.vtuberSearch')}
                className="h-9 pl-8"
            />
            {query.trim() && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-border bg-popover p-1 shadow-md">
                    {searching && results.length === 0 ? (
                        <p className="px-2 py-1.5 text-[12px] text-muted-foreground">{t('editor.vtuberSearching')}</p>
                    ) : error ? (
                        <p className="px-2 py-1.5 text-[12px] text-destructive">{t('editor.vtuberSearchFailed')}</p>
                    ) : results.length === 0 ? (
                        <p className="px-2 py-1.5 text-[12px] text-muted-foreground">{t('editor.vtuberNotFound')}</p>
                    ) : (
                        results.map((r) => (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => { onChange(r.id); setQuery(''); }}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                            >
                                {r.img_url ? <img src={r.img_url} alt="" className="size-6 rounded-full object-cover" /> : <span className="size-6 rounded-full bg-muted" />}
                                <span className="truncate">{r.name}</span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
