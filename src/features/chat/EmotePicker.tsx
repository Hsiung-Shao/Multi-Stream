/** 合併聊天室輸入框的貼圖選單：左側來源列＋分段清單＋底部預覽；點選不關選單，可以連續選 */
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Globe, Smile, Star } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { ScrollArea } from '../../components/ui/scroll-area';
import type { EmoteSection, PickerEmote } from './emoteSections';
import { pushRecentEmote, readRecentEmotes } from './recentEmotes';

// 熱門頻道的 7TV 可能上千個：每段只畫前 300 個，搜尋結果總共最多 300 個
const MAX_SHOWN = 300;

interface Shown extends EmoteSection { more: number }
interface Hover { emote: PickerEmote; from: string }

// 左側來源列一格對應一組段落：目前頻道、個人、每個訂閱頻道、每個其他頻道、全域
const groupOf = (id: string) => {
    const [kind, key] = id.split(':');
    return kind === 'sub' || kind === 'other' ? `${kind}:${key}` : kind;
};

// 清單獨立 memo：滑過貼圖更新預覽時不重畫上千個按鈕
const SectionList = memo(function SectionList({ sections, onPick, onHover }: {
    sections: Shown[];
    onPick: (e: PickerEmote) => void;
    onHover: (h: Hover) => void;
}) {
    const { t } = useTranslation('common');
    return (
        <>
            {sections.map(s => (
                <div key={s.id} data-section-id={s.id} className="pb-2">
                    <p className="sticky top-0 z-10 bg-popover px-1 py-1 text-[11px] font-semibold text-muted-foreground">
                        {s.title}{s.note && <span className="ml-1 font-normal text-amber-400/80">· {s.note}</span>}
                    </p>
                    <div className="grid grid-cols-8 gap-0.5">
                        {s.emotes.map(e => (
                            <button key={e.name} type="button" title={e.name} aria-label={e.name}
                                onClick={() => onPick(e)}
                                onMouseEnter={() => onHover({ emote: e, from: s.title })}
                                onFocus={() => onHover({ emote: e, from: s.title })}
                                className="flex h-8 items-center justify-center rounded hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
                                <img src={e.url} alt={e.name} loading="lazy" referrerPolicy="no-referrer" className="max-h-7 max-w-full" />
                            </button>
                        ))}
                    </div>
                    {s.more > 0 && <p className="px-1 pt-1 text-[11px] text-muted-foreground">{t('chat.emote_more', { count: s.more })}</p>}
                </div>
            ))}
        </>
    );
});

export function EmotePicker({ sections, needsReauth, onPick }: {
    sections: EmoteSection[];
    needsReauth?: boolean;
    onPick: (name: string) => void;
}) {
    const { t } = useTranslation('common');
    const [query, setQuery] = useState('');
    const [recent, setRecent] = useState<PickerEmote[]>([]);
    const [hover, setHover] = useState<Hover | null>(null);
    const list = useRef<HTMLDivElement>(null);
    const q = query.trim().toLowerCase();

    const shown = useMemo<Shown[]>(() => {
        if (q) {
            let left = MAX_SHOWN;
            return sections.map(s => {
                const hit = s.emotes.filter(e => e.name.toLowerCase().includes(q)).slice(0, left);
                left -= hit.length;
                return { ...s, emotes: hit, more: 0 };
            }).filter(s => s.emotes.length > 0);
        }
        const all = recent.length ? [{ id: 'recent', title: t('chat.emote_recent'), emotes: recent }, ...sections] : sections;
        return all.map(s => ({ ...s, emotes: s.emotes.slice(0, MAX_SHOWN), more: Math.max(0, s.emotes.length - MAX_SHOWN) }));
    }, [q, sections, recent, t]);

    const groups = useMemo(() => {
        const out: { key: string; first: string; title: string; avatar?: string }[] = [];
        for (const s of shown) {
            const key = groupOf(s.id);
            if (out.some(g => g.key === key)) continue;
            const title = key === 'global' ? t('chat.emote_global') : key === 'ch' ? s.id.split(':')[1] : key.startsWith('other:') ? key.slice(6) : s.title;
            out.push({ key, first: s.id, title, avatar: s.avatar });
        }
        return out;
    }, [shown, t]);

    const pick = useCallback((e: PickerEmote) => {
        onPick(e.name);
        setRecent(pushRecentEmote(e));
    }, [onPick]);

    const jump = (id: string) => list.current?.querySelector(`[data-section-id="${CSS.escape(id)}"]`)?.scrollIntoView?.({ block: 'start' });

    return (
        <Popover onOpenChange={(open: boolean) => { if (open) setRecent(readRecentEmotes()); else { setQuery(''); setHover(null); } }}>
            <PopoverTrigger asChild>
                <button type="button" aria-label={t('chat.emote_picker')} title={t('chat.emote_picker')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white">
                    <Smile className="h-4 w-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-[22rem] max-w-[calc(100vw-1rem)] p-0">
                <div className="border-b border-border p-2">
                    <input
                        aria-label={t('chat.emote_search')}
                        placeholder={t('chat.emote_search')}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                    />
                    {needsReauth && <p className="mt-2 text-xs text-muted-foreground">{t('chat.emote_reauth')}</p>}
                </div>
                <div className="flex">
                    <ScrollArea className="w-10 shrink-0 border-r border-border [&>[data-radix-scroll-area-viewport]]:max-h-72">
                        <div className="flex flex-col items-center gap-1 py-1">
                            {groups.map(g => (
                                <button key={g.key} type="button" aria-label={g.title} title={g.title} onClick={() => jump(g.first)}
                                    className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md text-[10px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">
                                    {g.key === 'recent' ? <Clock className="h-4 w-4" />
                                        : g.key === 'global' ? <Globe className="h-4 w-4" />
                                            : g.key === 'personal' ? <Star className="h-4 w-4" />
                                                : g.avatar ? <img src={g.avatar} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-full" />
                                                    : g.title.slice(0, 2).toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </ScrollArea>
                    <ScrollArea className="min-w-0 flex-1 [&>[data-radix-scroll-area-viewport]]:max-h-72">
                        <div ref={list} className="px-2 pb-1">
                            {shown.length === 0
                                ? <p className="py-6 text-center text-xs text-muted-foreground">{t('chat.emote_empty')}</p>
                                : <SectionList sections={shown} onPick={pick} onHover={setHover} />}
                        </div>
                    </ScrollArea>
                </div>
                <div className="flex h-12 items-center gap-2 border-t border-border px-3">
                    {hover && <>
                        <img src={hover.emote.url} alt="" referrerPolicy="no-referrer" className="max-h-9 max-w-12" />
                        <div className="min-w-0 text-xs">
                            <p className="truncate font-semibold">{hover.emote.name}</p>
                            <p className="truncate text-muted-foreground">{hover.from}</p>
                        </div>
                    </>}
                </div>
            </PopoverContent>
        </Popover>
    );
}
