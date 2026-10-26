/**
 * 手機中欄（<1024）：「瀏覽／正在播放」兩個分頁，共用一個捲動區。
 * 播放器不在這裡（固定在頁面頂端的 aside），分頁只切換播放器下方的內容；時間軸與接下來只渲染在「正在播放」分頁，不用 CSS 藏第二份。
 * 矮螢幕（橫向手機）傳 lead：頁首與分頁列一起放進捲動區，否則播放器（政策下限 200 高）加上它們會把內容區擠到沒有高度。
 */
import { useLayoutEffect, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '../../../../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../components/ui/tabs';

export type MobileTab = 'browse' | 'now';

/** 放在分頁內容最後：內容掛上 DOM（已可排版）時通知頁面還原這個分頁的捲動位置 */
function PanelMounted({ tab, onMount }: { tab: MobileTab; onMount: (tab: MobileTab) => void }) {
    useLayoutEffect(() => {
        onMount(tab);
    }, [tab, onMount]);
    return null;
}

export function MobileNowTabs({ value, onValueChange, onPanelMount, queueCount, lead = null, browse, now, scrollRef }: {
    value: MobileTab;
    onValueChange: (tab: MobileTab) => void;
    /** 分頁內容掛上時呼叫（還原捲動位置；Radix 的分頁內容比 value 晚一次 commit 才掛上） */
    onPanelMount: (tab: MobileTab) => void;
    queueCount: number;
    /** 矮螢幕時跟著內容捲動的頁首；null＝頁首與分頁列固定在捲動區上方 */
    lead?: ReactNode;
    browse: ReactNode;
    now: ReactNode;
    scrollRef: RefObject<HTMLDivElement | null>;
}) {
    const { t } = useTranslation('songs');
    const scrollsHeader = lead !== null;
    const tabsList = (
        <TabsList aria-label={t('mobile.tabs')} className="mx-4 mt-2 h-10 w-auto shrink-0 rounded-full p-1 sm:mx-7">
            <TabsTrigger value="browse" className="rounded-full">{t('mobile.browse')}</TabsTrigger>
            <TabsTrigger value="now" className="rounded-full">
                {t('now.label')}
                {/* 首數只給眼睛看：分頁名稱維持「正在播放」 */}
                {queueCount > 0 && <span className="text-xs tabular-nums text-muted-foreground" aria-hidden="true">({queueCount})</span>}
            </TabsTrigger>
        </TabsList>
    );
    return (
        <Tabs value={value} onValueChange={(v: string) => onValueChange(v === 'now' ? 'now' : 'browse')} className="min-h-0 flex-1 gap-0">
            {!scrollsHeader && tabsList}
            <ScrollArea ref={scrollRef} className="min-h-0 flex-1 [&>div>div]:!block">
                {lead}
                {scrollsHeader && tabsList}
                <TabsContent value="browse" data-songs-panel="browse">
                    {browse}
                    <PanelMounted tab="browse" onMount={onPanelMount} />
                </TabsContent>
                <TabsContent value="now" data-songs-panel="now">
                    {now}
                    <PanelMounted tab="now" onMount={onPanelMount} />
                </TabsContent>
            </ScrollArea>
        </Tabs>
    );
}
