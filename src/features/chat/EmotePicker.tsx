/** 合併聊天室輸入框的貼圖選單：Twitch／7TV／BTTV／FFZ 分頁＋搜尋，點選把名稱交回輸入框 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Smile } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ScrollArea } from '../../components/ui/scroll-area';
import type { EmoteGroups } from './thirdPartyEmotes';

// 熱門頻道的 7TV 可能上千個：只畫前 300 個，其餘靠搜尋
const MAX_SHOWN = 300;

const TABS = [['twitch', 'Twitch'], ['7tv', '7TV'], ['bttv', 'BTTV'], ['ffz', 'FFZ']] as const;

export function EmotePicker({ twitch, groups, needsReauth, onPick }: {
    twitch: Record<string, string>;
    groups: EmoteGroups;
    needsReauth?: boolean;
    onPick: (name: string) => void;
}) {
    const { t } = useTranslation('common');
    const [query, setQuery] = useState('');
    const sources = useMemo(() => ({ twitch, ...groups }), [twitch, groups]);
    const q = query.trim().toLowerCase();
    return (
        <Popover onOpenChange={(open: boolean) => { if (!open) setQuery(''); }}>
            <PopoverTrigger asChild>
                <button type="button" aria-label={t('chat.emote_picker')} title={t('chat.emote_picker')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white">
                    <Smile className="h-4 w-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-80 p-2" onOpenAutoFocus={(e: Event) => e.preventDefault()}>
                <input
                    aria-label={t('chat.emote_search')}
                    placeholder={t('chat.emote_search')}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    className="mb-2 h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                />
                {needsReauth && <p className="mb-2 text-xs text-muted-foreground">{t('chat.emote_reauth')}</p>}
                <Tabs defaultValue="twitch">
                    <TabsList className="grid w-full grid-cols-4">
                        {TABS.map(([key, label]) => <TabsTrigger key={key} value={key}>{label}</TabsTrigger>)}
                    </TabsList>
                    {TABS.map(([key]) => {
                        const all = Object.entries(sources[key]);
                        const list = (q ? all.filter(([name]) => name.toLowerCase().includes(q)) : all).slice(0, MAX_SHOWN);
                        return (
                            <TabsContent key={key} value={key}>
                                <ScrollArea className="[&>[data-radix-scroll-area-viewport]]:max-h-60">
                                    {list.length === 0 ? (
                                        <p className="py-6 text-center text-xs text-muted-foreground">{t('chat.emote_empty')}</p>
                                    ) : (
                                        <div className="grid grid-cols-7 gap-1">
                                            {list.map(([name, url]) => (
                                                <button key={name} type="button" title={name} onClick={() => onPick(name)} className="flex h-9 items-center justify-center rounded hover:bg-accent">
                                                    <img src={url} alt={name} loading="lazy" referrerPolicy="no-referrer" className="max-h-7 max-w-full" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </TabsContent>
                        );
                    })}
                </Tabs>
            </PopoverContent>
        </Popover>
    );
}
