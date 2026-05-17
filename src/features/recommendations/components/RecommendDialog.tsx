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
import { Heart, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useRecommendMutation } from '../hooks';
import { formatRecommendError } from '../apiClient';
import type { FavoriteStream } from '../../favorites/types';

interface Props {
    favorite: FavoriteStream | null;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}

const COMMENT_MAX = 500;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/i;

export function RecommendDialog({ favorite, open, onOpenChange }: Props) {
    const [comment, setComment] = useState('');
    const mutation = useRecommendMutation();
    const isPending = mutation.isPending;

    // open/close 時 reset(對齊 memory: error_dialog_mutation_reset)
    useEffect(() => {
        setComment('');
        mutation.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, favorite?.id]);

    if (!favorite) return null;

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
        if (trimmed && URL_PATTERN.test(trimmed)) {
            toast.error('留言不能包含網址');
            return;
        }

        try {
            const result = await mutation.mutateAsync({
                name: favorite.name,
                platform: favorite.platform,
                channel_id: channelId,
                url: favorite.url,
                comment: trimmed || undefined,
            });
            if (result.ok === true) {
                toast.success(`已推薦:${favorite.name}`);
            } else if (result.reason === 'already_recommended') {
                toast.message(`你已經推薦過 ${favorite.name} 了`);
            }
            onOpenChange(false);
        } catch (e) {
            // 不關 dialog,讓 user 看到錯誤可修
            // toast 也顯示一次,確保看得到
            toast.error(formatRecommendError(e));
        }
    };

    return (
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
                        <p className="text-[10px] text-zinc-500">禁止留網址 / 廣告連結</p>
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
    );
}
