// 「我的推薦」tab —— 列 user 自己推薦過的 vtubers + 撤回按鈕
// 用於 FavoritesManagerMain 的新 tab

import { useState } from 'react';
import { useMyRecommendations, useDeleteRecommendation } from '../hooks';
import { formatRecommendError } from '../apiClient';
import { Skeleton } from '../../../components/ui/skeleton';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Heart, Trash2, AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { MyRecommendation } from '../types';

export function MyRecommendationsTab() {
    const { data: items = [], isLoading, isError, error, refetch } = useMyRecommendations();
    const delMutation = useDeleteRecommendation();
    const [pendingDelete, setPendingDelete] = useState<MyRecommendation | null>(null);

    const handleConfirmDelete = async () => {
        if (!pendingDelete) return;
        const v = pendingDelete.vtuber;
        const channelId = v?.twitch_channel_id || v?.youtube_channel_id;
        const platform: 'twitch' | 'youtube' | null = v?.twitch_channel_id
            ? 'twitch'
            : v?.youtube_channel_id ? 'youtube' : null;
        try {
            await delMutation.mutateAsync({
                recommendationId: pendingDelete.id,
                identity: channelId && platform ? { platform, channelId } : undefined,
            });
            toast.success('已撤回推薦');
            setPendingDelete(null);
        } catch (e) {
            toast.error(formatRecommendError(e));
        }
    };

    return (
        <div className="space-y-3">
            {isLoading && (
                <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 bg-zinc-800" />)}
                </div>
            )}

            {isError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/25">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-[13px] text-red-400">載入失敗:{formatRecommendError(error)}</p>
                    <button onClick={() => refetch()} className="ml-auto text-red-400 hover:text-red-300 text-[12px] underline">
                        重試
                    </button>
                </div>
            )}

            {!isLoading && !isError && items.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-zinc-500 text-sm">
                    <Inbox className="w-8 h-8" />
                    <span>你還沒推薦過任何 VTuber</span>
                    <span className="text-xs text-zinc-600">到收藏列表按「推薦」按鈕開始</span>
                </div>
            )}

            {items.length > 0 && (
                <ul className="space-y-2">
                    {items.map(it => (
                        <li
                            key={it.id}
                            className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 transition-colors"
                        >
                            {it.vtuber?.img_url ? (
                                <img
                                    src={it.vtuber.img_url}
                                    alt={it.vtuber.name}
                                    width="40"
                                    height="40"
                                    className="w-10 h-10 rounded-full object-cover shrink-0"
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-500 text-sm">
                                    {it.vtuber?.name?.[0] ?? '?'}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-sm font-medium text-zinc-100 truncate">
                                        {it.vtuber?.name ?? '已刪除的 VTuber'}
                                    </span>
                                    {it.vtuber && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                                            it.vtuber.twitch_channel_id
                                                ? 'bg-violet-500/15 text-violet-300'
                                                : 'bg-red-500/15 text-red-300'
                                        }`}>
                                            {it.vtuber.twitch_channel_id ? 'Twitch' : 'YouTube'}
                                        </span>
                                    )}
                                </div>
                                {it.comment && (
                                    <p className="text-[12px] text-zinc-400 italic line-clamp-1 mt-0.5">
                                        「{it.comment}」
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <div
                                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-pink-500/10 text-pink-300 text-xs"
                                    title="你推薦於"
                                >
                                    <Heart className="w-3 h-3 fill-pink-400" />
                                    <span>{new Date(it.created_at).toLocaleDateString('zh-TW')}</span>
                                </div>
                                <button
                                    onClick={() => setPendingDelete(it)}
                                    disabled={delMutation.isPending && pendingDelete?.id === it.id}
                                    className="w-8 h-8 flex items-center justify-center rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    title="撤回推薦"
                                >
                                    {delMutation.isPending && pendingDelete?.id === it.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {/* 撤回確認 */}
            <AlertDialog
                open={!!pendingDelete}
                onOpenChange={(v) => { if (!v) setPendingDelete(null); }}
            >
                <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-zinc-100">撤回推薦?</AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400">
                            將撤回對「{pendingDelete?.vtuber?.name}」的推薦,留言一併消失。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700">
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            className="bg-red-600 hover:bg-red-500"
                        >
                            確認撤回
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
