// 推薦 Dialog(從收藏列表 click「推薦」按鈕觸發)
//
// 收 favorite 資料 + 讓 user 選填 comment(0-500 字,禁 URL)→ POST /api/recommendations
// 成功:toast + close。already_recommended:toast「已推薦過」+ close。

import { useState, useEffect } from 'react';
import { twitchService } from '../../twitch/TwitchService';
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
import { useRecommendMutation, useCategories } from '../hooks';
import { formatRecommendError } from '../apiClient';
import { getOrCreateAnonymousId } from '../anonymousId';
import { ProposeCategoryDialog } from './CategoryFilterBar';
import { CategoryMultiSelect } from './CategoryMultiSelect';
import { SUPPORTED_VTUBER_LANGS, LANG_LABEL, type VtuberLang } from '../../../lib/locale';
import type { RecommendTarget } from '../types';

interface Props {
    target: RecommendTarget | null;
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** 若 target 是 favorite,推薦成功後呼叫此 callback 同步 localStorage */
    onRecommended?: (favoriteId: string) => void;
}

const COMMENT_MAX = 500;

export function RecommendDialog({ target, open, onOpenChange, onRecommended }: Props) {
    const [comment, setComment] = useState('');
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
    const [selectedLangs, setSelectedLangs] = useState<VtuberLang[]>([]);
    const [proposeOpen, setProposeOpen] = useState(false);
    // #2 自動抓 Twitch profile image(target 沒帶 imgUrl 時)
    const [fetchedImgUrl, setFetchedImgUrl] = useState<string | null>(null);
    const { data: categories = [], isLoading: catsLoading } = useCategories();
    const mutation = useRecommendMutation();
    const isPending = mutation.isPending;

    // open/close 時 reset(對齊 memory: error_dialog_mutation_reset)
    useEffect(() => {
        setComment('');
        setSelectedCategoryIds([]);
        setSelectedLangs([]);
        setFetchedImgUrl(null);
        mutation.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, target?.url]);

    // #2 Twitch profile image lookup(open 時觸發,5s timeout)
    useEffect(() => {
        if (!open || !target || target.imgUrl) return;
        if (target.platform !== 'twitch' || !target.channelId) return;
        let cancelled = false;
        const login = target.channelId.toLowerCase();
        const timer = setTimeout(() => { if (!cancelled) setFetchedImgUrl(null); }, 5000);
        (async () => {
            try {
                const results = await twitchService.searchChannels(login, 5);
                const match = results.find(r => r.login?.toLowerCase() === login);
                const url = match?.thumbnailUrl;
                if (!cancelled && typeof url === 'string' && url.length > 0) {
                    setFetchedImgUrl(url);
                }
            } catch { /* silent — img_url 是 best-effort */ }
            finally { clearTimeout(timer); }
        })();
        return () => { cancelled = true; clearTimeout(timer); };
    }, [open, target?.platform, target?.channelId, target?.imgUrl]);

    if (!target) return null;

    const toggleLang = (code: VtuberLang) => {
        setSelectedLangs(prev =>
            prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code]
        );
    };

    const handleSubmit = async () => {
        // platform 必須是 twitch/youtube;other 不能推薦
        if (target.platform !== 'twitch' && target.platform !== 'youtube') {
            toast.error('目前只支援 Twitch / YouTube 推薦');
            return;
        }
        const channelId = target.channelId;
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
                name: target.name,
                platform: target.platform,
                channel_id: channelId,
                url: target.url,
                comment: trimmed || undefined,
                anonymous_id: anonymousId || undefined,
                category_ids: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
                languages: selectedLangs.length > 0 ? selectedLangs : undefined,
                img_url: target.imgUrl || fetchedImgUrl || undefined,
                cross_channel_id: target.crossChannelId,
            });
            if (result.ok === true) {
                toast.success(`已推薦:${target.name}`);
                if (target.favoriteId) onRecommended?.(target.favoriteId);
            } else if (result.reason === 'already_recommended') {
                toast.message(`你已經推薦過 ${target.name} 了`);
                if (target.favoriteId) onRecommended?.(target.favoriteId);
            }
            onOpenChange(false);
        } catch (e) {
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
                        推薦 {target.name}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500 text-xs">
                        推薦會顯示在公開的「VTuber 推薦」頁;留言可以分享你為什麼喜歡這位實況主(選填)。
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400">分類(選填,可多選)</Label>
                        <CategoryMultiSelect
                            allCategories={categories}
                            selectedIds={selectedCategoryIds}
                            onChange={setSelectedCategoryIds}
                            onProposeClick={() => setProposeOpen(true)}
                            isLoading={catsLoading}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400">實況主主要語言(選填,可多選)</Label>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {SUPPORTED_VTUBER_LANGS.map(code => {
                                const active = selectedLangs.includes(code);
                                return (
                                    <button
                                        key={code}
                                        type="button"
                                        onClick={() => toggleLang(code)}
                                        className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                                            active
                                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                                                : 'bg-zinc-800/60 text-zinc-400 border border-zinc-700 hover:bg-zinc-800'
                                        }`}
                                    >
                                        {LANG_LABEL[code]}
                                    </button>
                                );
                            })}
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
