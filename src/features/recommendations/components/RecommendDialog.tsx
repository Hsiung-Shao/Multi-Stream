// 推薦 Dialog(從收藏列表 click「推薦」按鈕觸發)
//
// 收 favorite 資料 + 讓 user 選填 comment(0-500 字,禁 URL)→ POST /api/recommendations
// 成功:toast + close。already_recommended:toast「已推薦過」+ close。

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { Label } from '../../../components/ui/label';
import { Heart, Loader2, AlertTriangle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useRecommendMutation, useCategories } from '../hooks';
import { formatRecommendError } from '../apiClient';
import { getOrCreateAnonymousId } from '../anonymousId';
import { ProposeCategoryDialog } from './CategoryFilterBar';
import type { FavoriteStream } from '../../favorites/types';

interface Props {
    favorite: FavoriteStream | null;
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onRecommended?: (favoriteId: string) => void;
}

const COMMENT_MAX = 500;

export function RecommendDialog({ favorite, open, onOpenChange, onRecommended }: Props) {
    const [comment, setComment] = useState('');
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
    const [proposeOpen, setProposeOpen] = useState(false);
    const { data: categories = [], isLoading: catsLoading } = useCategories();
    const mutation = useRecommendMutation();
    const isPending = mutation.isPending;

    // open/close 時 reset(對齊 memory: error_dialog_mutation_reset)
    useEffect(() => {
        setComment('');
        setSelectedCategoryIds([]);
        mutation.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, favorite?.id]);

    if (!favorite) return null;

    const toggleCategory = (id: string) => {
        setSelectedCategoryIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleSubmit = async () => {
        // platform 必須是 twitch/youtube;other 不能推薦
        if (favorite.platform !== 'twitch' && favorite.platform !== 'youtube') {
            toast.error('目前只支援 Twitch / YouTube 推薦');
            return;
        }
        const channelId = favorite.channelId;
        if (!channelId) {
            toast.error('找不到頻道 ID,無法推薦');
            return;
        }
        const trimmed = comment.trim();
        if (trimmed.length > COMMENT_MAX) {
            toast.error(`留言過長(上限 ${COMMENT_MAX} 字)`);
            return;
        }

        try {
            const anonymousId = getOrCreateAnonymousId();
            const result = await mutation.mutateAsync({
                name: favorite.name,
                platform: favorite.platform,
                channel_id: channelId,
                url: favorite.url,
                comment: trimmed || undefined,
                anonymous_id: anonymousId || undefined,
                category_ids: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
            });
            if (result.ok === true) {
                toast.success(`已推薦:${favorite.name}`);
                onRecommended?.(favorite.id);
            } else if (result.reason === 'already_recommended') {
                toast.message(`你已經推薦過 ${favorite.name} 了`);
                // 同步 server 真實狀態到 local(可能 user 在別處推過或清過 localStorage)
                onRecommended?.(favorite.id);
            }
            onOpenChange(false);
        } catch (e) {
            // 不關 dialog,讓 user 看到錯誤可修
            // toast 也顯示一次,確保看得到
            toast.error(formatRecommendError(e));
        }
    };

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-200 max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-zinc-100 flex items-center gap-2">
                        <Heart className="w-4 h-4 text-pink-400 fill-pink-400" />
                        推薦 {favorite.name}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500 text-xs">
                        推薦會顯示在公開的「VTuber 推薦」頁;留言可以分享你為什麼喜歡這位實況主(選填)。
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400">分類(選填,可多選)</Label>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {catsLoading && (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-600" />
                            )}
                            {categories.map(cat => {
                                const active = selectedCategoryIds.includes(cat.id);
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => toggleCategory(cat.id)}
                                        className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                                            active
                                                ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40'
                                                : 'bg-zinc-800/60 text-zinc-400 border border-zinc-700 hover:bg-zinc-800'
                                        }`}
                                    >
                                        {cat.name}
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                onClick={() => setProposeOpen(true)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-zinc-400 border border-dashed border-zinc-700 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                <Plus className="w-3 h-3" />
                                找不到?新增分類
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400">
                            留言(選填,{comment.length} / {COMMENT_MAX})
                        </Label>
                        <Textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            maxLength={COMMENT_MAX}
                            placeholder="分享為什麼推薦他/她..."
                            className="bg-zinc-900 border-zinc-800 text-zinc-200 min-h-[88px] text-sm"
                        />
                        <p className="text-[10px] text-zinc-500">隨意留言,500 字內</p>
                    </div>

                    {mutation.isError && (
                        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/25">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-[12px] text-red-400">{formatRecommendError(mutation.error)}</p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                    >
                        取消
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending}
                        className="bg-pink-600 hover:bg-pink-500 gap-1.5"
                    >
                        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        送出推薦
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <ProposeCategoryDialog
            open={proposeOpen}
            onOpenChange={setProposeOpen}
            onProposed={(id) => setSelectedCategoryIds(prev => prev.includes(id) ? prev : [...prev, id])}
        />
        </>
    );
}
