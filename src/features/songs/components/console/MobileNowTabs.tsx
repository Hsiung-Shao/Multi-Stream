/**
 * 手機中欄（<1024）：「瀏覽／正在播放」兩個分頁，共用一個捲動區。
 * 播放器不在這裡（固定在頁面頂端的 aside），分頁只切換播放器下方的內容；時間軸與接下來只渲染在「正在播放」分頁，不用 CSS 藏第二份。
 */
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '../../../../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../components/ui/tabs';

export type MobileTab = 'browse' | 'now';

export function MobileNowTabs({ value, onValueChange, queueCount, browse, now, scrollRef }: {
    value: MobileTab;
    onValueChange: (tab: MobileTab) => void;
    queueCount: number;
    browse: ReactNode;
    now: ReactNode;
    scrollRef: RefObject<HTMLDivElement | null>;
}) {
    const { t } = useTranslation('songs');
    return (
        <Tabs value={value} onValueChange={(v: string) => onValueChange(v === 'now' ? 'now' : 'browse')} className="min-h-0 flex-1 gap-0">
            <TabsList aria-label={t('mobile.tabs')} className="mx-4 mt-2 h-10 w-auto shrink-0 rounded-full p-1">
                <TabsTrigger value="browse" className="rounded-full">{t('mobile.browse')}</TabsTrigger>
                <TabsTrigger value="now" className="rounded-full">
                    {t('now.label')}
                    {/* 首數只給眼睛看：分頁名稱維持「正在播放」 */}
                    {queueCount > 0 && <span className="text-xs tabular-nums text-muted-foreground" aria-hidden="true">({queueCount})</span>}
                </TabsTrigger>
            </TabsList>
            <ScrollArea ref={scrollRef} className="min-h-0 flex-1 [&>div>div]:!block">
                <TabsContent value="browse">{browse}</TabsContent>
                <TabsContent value="now">{now}</TabsContent>
            </ScrollArea>
        </Tabs>
    );
}
