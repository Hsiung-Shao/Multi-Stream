/**
 * 空畫布的「你的收藏」：只列出此刻正在直播的收藏頻道，一鍵加入（2026-09 使用者需求：只顯示正在直播的）。
 * 取代空畫布下方的功能介紹（導覽已涵蓋）；沒有收藏在直播時不渲染，空畫布維持原本的新手畫面。
 *
 * - 直播狀態沿用進畫布時既有的收藏直播檢查（refreshFavoritesStatus → GlobalLiveStatusChecker），這裡不另外打 API；
 *   檢查結果回來（favoritesUpdated）後清單才出現或更新
 * - 加入邏輯與動態島收藏選單共用 loadFavoritesToCanvas
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Loader2 } from 'lucide-react';
import { useFavorites } from '../../hooks/useFavorites';
import { loadFavoritesToCanvas } from '../../features/favorites/loadFavoritesToCanvas';
import type { FavoriteStream } from '../../features/favorites/types';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';

const PLATFORM_COLOR: Record<FavoriteStream['platform'], string> = {
    twitch: '#9146FF',
    youtube: '#FF0000',
    other: '#94a3b8',
};

/** 空畫布是否顯示收藏區、導覽是否介紹收藏區，都用這個判斷 */
export const isLiveFavorite = (f: FavoriteStream) => f.isLive === true;

/** 正在直播的收藏，觀眾多的在前 */
export function liveFavoritesForEmptyState(favs: FavoriteStream[]): FavoriteStream[] {
    return favs.filter(isLiveFavorite).sort((a, b) => (b.viewerCount ?? 0) - (a.viewerCount ?? 0));
}

export function EmptyStateFavorites() {
    const { t } = useTranslation(['common', 'favorites']);
    const { favorites } = useFavorites();
    const live = useMemo(() => liveFavoritesForEmptyState(favorites), [favorites]);
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [busy, setBusy] = useState(false);
    // 以目前清單計算：勾選後被刪掉或下播的收藏不算進「加入所選（n）」
    const selectedFavs = useMemo(() => live.filter(f => selected.has(f.id)), [live, selected]);

    if (live.length === 0) return null;

    const load = async (favs: FavoriteStream[]) => {
        if (busy || favs.length === 0) return;
        setBusy(true);
        try {
            const count = await loadFavoritesToCanvas(favs);
            toast.success(t('favorites:added_count', { count }));
            setSelected(new Set());
        } finally {
            setBusy(false);
        }
    };

    const toggle = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    return (
        <section
            data-tour="empty-favorites"
            aria-labelledby="empty-favorites-title"
            className="pointer-events-auto mx-auto w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left backdrop-blur-sm"
        >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <div>
                    <h2 id="empty-favorites-title" className="text-sm font-semibold text-white">
                        {t('empty_state.favorites_title')}
                    </h2>
                    <p className="text-[11px] text-white/50">
                        {t('empty_state.favorites_live_count', { count: live.length })}
                    </p>
                </div>
                <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={selectedFavs.length === 0 || busy}
                    onClick={() => load(selectedFavs)}
                >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {t('empty_state.favorites_add_selected', { count: selectedFavs.length })}
                </Button>
            </div>

            {/* 限高要下在 viewport（下在 Root 不會捲動）；!block 讓長名稱的 truncate 生效（見 error 庫 Radix ScrollArea 兩個陷阱） */}
            <ScrollArea className="[&>[data-radix-scroll-area-viewport]]:max-h-64 [&>div>div]:!block">
                <ul className="space-y-0.5 pr-2">
                    {live.map(f => {
                        const meta = [
                            f.viewerCount != null ? t('empty_state.favorites_viewers', { count: f.viewerCount }) : null,
                            f.gameName || f.liveTitle,
                        ].filter(Boolean).join(' · ');
                        return (
                            <li key={f.id} className="flex items-center gap-2 rounded-lg px-1 hover:bg-white/5">
                                <Checkbox
                                    checked={selected.has(f.id)}
                                    disabled={busy}
                                    onCheckedChange={() => toggle(f.id)}
                                    aria-label={t('empty_state.favorites_select', { name: f.name })}
                                />
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => load([f])}
                                    title={t('empty_state.favorites_add_one', { name: f.name })}
                                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-left"
                                >
                                    <span className="size-2 shrink-0 rounded-full" style={{ background: PLATFORM_COLOR[f.platform] }} aria-hidden />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm text-white/90">{f.name}</span>
                                        {meta && <span className="block truncate text-[11px] text-white/45">{meta}</span>}
                                    </span>
                                    <span className="shrink-0 rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                        {t('empty_state.favorites_live')}
                                    </span>
                                    <Plus size={14} className="shrink-0 text-white/40" aria-hidden />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </ScrollArea>
        </section>
    );
}
