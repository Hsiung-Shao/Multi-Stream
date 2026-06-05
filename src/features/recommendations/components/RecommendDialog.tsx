// 推薦 Dialog(從收藏列表 click「推薦」按鈕觸發)
//
// 收 favorite 資料 → POST /api/recommendations(分類 / 語言 / 跨平台連結;留言功能已移除前端)
// 成功:toast + close。already_recommended:toast「已推薦過」+ close。

import { useState, useEffect, useMemo, useRef } from 'react';
import { twitchService } from '../../twitch/TwitchService';
import { Input } from '../../../components/ui/input';
import { Check, X, RefreshCw, AlertCircle, Link2, Link2Off } from 'lucide-react';
import { parseChannelUrlSync, resolveYouTubeHandle } from '../parseChannelUrl';
import { useVtuberSuggestions, type VtuberSearchResult } from '../useVtuberSuggestions';
import { useCrossChannelName } from '../useCrossChannelName';
import { useVtuberByChannel } from '../useVtuberByChannel';
import { VtuberSuggestionList } from './VtuberSuggestionList';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { Heart, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useRecommendMutation, useCategories } from '../hooks';
import { formatRecommendError } from '../apiClient';
import { getOrCreateAnonymousId } from '../anonymousId';
import { ProposeCategoryDialog } from './CategoryFilterBar';
import { CategoryMultiSelect } from './CategoryMultiSelect';
import { SUPPORTED_VTUBER_LANGS, LANG_LABEL, type VtuberLang } from '../../../lib/locale';
import { useAuth } from '../../../hooks/useAuth';
import type { RecommendTarget } from '../types';

interface Props {
    target: RecommendTarget | null;
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** 若 target 是 favorite,推薦成功後呼叫此 callback 同步 localStorage */
    onRecommended?: (favoriteId: string) => void;
    /** 匿名 user 點留言區「登入」按鈕觸發;不傳則匿名提示只顯示文字 */
    onRequestLogin?: () => void;
}

export function RecommendDialog({ target, open, onOpenChange, onRecommended }: Props) {
    const { isLoggedIn } = useAuth();
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
    const [selectedLangs, setSelectedLangs] = useState<VtuberLang[]>([]);
    const [proposeOpen, setProposeOpen] = useState(false);
    // #2 自動抓 Twitch profile image(target 沒帶 imgUrl 時)
    const [fetchedImgUrl, setFetchedImgUrl] = useState<string | null>(null);

    // 2026-05-21 跨平台 opt-in link:user 貼另一平台 URL,送 backend 做 OR dedupe + merge
    const [crossUrlInput, setCrossUrlInput] = useState('');
    type CrossState =
        | { kind: 'idle' }
        | { kind: 'resolving' }
        | { kind: 'ok'; platform: 'twitch' | 'youtube'; channelId: string; channelTitle?: string }
        | { kind: 'warn'; message: string }
        | { kind: 'error'; message: string };
    const [crossState, setCrossState] = useState<CrossState>({ kind: 'idle' });
    const crossDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const crossAbortRef = useRef<AbortController | null>(null);

    // 2026-05-25「您是不是這位?」suggestion(從既有 vtubers fuzzy match user 主推的名稱)
    // lockedSuggestion 非 null = user 已選某筆 suggestion → cross URL 被鎖定,顯示「已連結」徽章
    const [lockedSuggestion, setLockedSuggestion] = useState<VtuberSearchResult | null>(null);
    const [suggestionDismissed, setSuggestionDismissed] = useState(false);
    const { data: categories = [], isLoading: catsLoading } = useCategories();
    const mutation = useRecommendMutation();
    const isPending = mutation.isPending;

    // open/close 時 reset(對齊 memory: error_dialog_mutation_reset)
    useEffect(() => {
        setSelectedCategoryIds([]);
        setSelectedLangs([]);
        setFetchedImgUrl(null);
        setCrossUrlInput('');
        setCrossState({ kind: 'idle' });
        setLockedSuggestion(null);
        setSuggestionDismissed(false);
        if (crossDebounceRef.current) clearTimeout(crossDebounceRef.current);
        if (crossAbortRef.current) crossAbortRef.current.abort();
        mutation.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, target?.url]);

    // 主推頻道是否已在 db?用 (platform, channelId) 精確查
    // 若 db 已有 row 且另一平台 channelId 也填了 → 隱藏 cross URL 區與 suggestion
    const { data: existingVtuber } = useVtuberByChannel(target?.platform, target?.channelId);
    const shouldHideCrossUrl = useMemo(() => {
        if (!existingVtuber || !target) return false;
        const otherChannelId = target.platform === 'twitch'
            ? existingVtuber.youtube_channel_id
            : existingVtuber.twitch_channel_id;
        return !!otherChannelId;
    }, [existingVtuber, target?.platform]);

    // 第一階段 suggestion query:用 target.name 觸發 fuzzy search
    // (open 期間穩定,React Query staleTime 5min)
    // 已連結另一平台時無需查(連帶 disable 兩階段 suggestion)
    const suggestionQuery = (target?.name || '').trim();
    const { data: primarySuggestions = [] } = useVtuberSuggestions(
        suggestionQuery,
        open && !!target && !lockedSuggestion && !shouldHideCrossUrl,
    );

    // 第二階段 suggestion query:user 貼 cross URL 後,從該平台拿到 channel name
    // 再查一次 db(蓋住「主推 displayName 跟另一平台不同名」的 case)
    const crossHint = crossState.kind === 'ok'
        ? {
              platform: crossState.platform,
              channelId: crossState.channelId,
              youtubeTitle: crossState.platform === 'youtube'
                  ? (crossState.channelTitle ?? null)
                  : null,
          }
        : { platform: null, channelId: null, youtubeTitle: null };
    const crossChannelName = useCrossChannelName(crossHint);
    const crossSuggestionQuery = (crossChannelName || '').trim();
    const { data: crossSuggestions = [] } = useVtuberSuggestions(
        crossSuggestionQuery,
        open && !!target && !lockedSuggestion && !shouldHideCrossUrl
            && crossSuggestionQuery.length > 0
            && crossSuggestionQuery !== suggestionQuery,
    );

    // 合併兩階段結果:同 id 取 score 較高,score DESC + recommend_count DESC,截前 5
    const suggestions = useMemo<VtuberSearchResult[]>(() => {
        const map = new Map<string, VtuberSearchResult>();
        for (const s of primarySuggestions) {
            const existing = map.get(s.id);
            if (!existing || s.score > existing.score) map.set(s.id, s);
        }
        for (const s of crossSuggestions) {
            const existing = map.get(s.id);
            if (!existing || s.score > existing.score) map.set(s.id, s);
        }
        return Array.from(map.values())
            .sort((a, b) => (b.score - a.score) || (b.recommend_count - a.recommend_count))
            .slice(0, 5);
    }, [primarySuggestions, crossSuggestions]);

    const handleSelectSuggestion = (s: VtuberSearchResult) => {
        if (!target) return;
        // 把該 vtuber 的「另一平台 channelId」反推 URL,寫進 cross URL state
        const otherPlatform = target.platform === 'twitch' ? 'youtube' : 'twitch';
        const otherChannelId = otherPlatform === 'twitch' ? s.twitch_channel_id : s.youtube_channel_id;
        if (!otherChannelId) {
            // suggestion 對應平台沒有 channelId → 仍可連結(只共享同 vtuber row),但 cross URL 無內容
            setCrossUrlInput('');
            setCrossState({ kind: 'idle' });
        } else {
            const reverseUrl = otherPlatform === 'twitch'
                ? `https://www.twitch.tv/${otherChannelId}`
                : `https://www.youtube.com/channel/${otherChannelId}`;
            setCrossUrlInput(reverseUrl);
            setCrossState({ kind: 'ok', platform: otherPlatform, channelId: otherChannelId });
        }
        setLockedSuggestion(s);
    };

    const handleUnlockSuggestion = () => {
        setLockedSuggestion(null);
        setCrossUrlInput('');
        setCrossState({ kind: 'idle' });
        // 不要把 suggestionDismissed 設回 true — user 解除是想重選,讓 list 重新出現
    };

    // 跨平台 URL parse:debounce 500ms,Twitch / YouTube /channel/UC 立即;@handle 走 endpoint resolve
    useEffect(() => {
        if (crossDebounceRef.current) clearTimeout(crossDebounceRef.current);
        if (crossAbortRef.current) crossAbortRef.current.abort();
        const trimmed = crossUrlInput.trim();
        if (!trimmed) {
            setCrossState({ kind: 'idle' });
            return;
        }
        crossDebounceRef.current = setTimeout(() => {
            const result = parseChannelUrlSync(trimmed);
            if (result.ok) {
                // 防誤觸:跟 user 主推 platform 相同 → 警告
                if (target && result.platform === target.platform) {
                    setCrossState({ kind: 'warn', message: '這是你要推薦的平台,請貼另一平台' });
                    return;
                }
                if (target && result.channelId === target.channelId) {
                    setCrossState({ kind: 'warn', message: '跟你正在推薦的頻道相同' });
                    return;
                }
                setCrossState({ kind: 'ok', platform: result.platform, channelId: result.channelId });
                return;
            }
            if (result.reason === 'youtube_handle_pending') {
                // user 推 YouTube,@handle 另一平台不應該是 YouTube → 警告
                if (target?.platform === 'youtube') {
                    setCrossState({ kind: 'warn', message: '這是 YouTube handle,請貼 Twitch 網址' });
                    return;
                }
                setCrossState({ kind: 'resolving' });
                crossAbortRef.current = new AbortController();
                resolveYouTubeHandle(result.handle, crossAbortRef.current.signal).then(resolved => {
                    if (!resolved) {
                        setCrossState({ kind: 'error', message: '找不到此 YouTube handle' });
                        return;
                    }
                    setCrossState({
                        kind: 'ok',
                        platform: 'youtube',
                        channelId: resolved.channelId,
                        channelTitle: resolved.channelTitle ?? undefined,
                    });
                });
                return;
            }
            if (result.reason === 'unsupported_platform') {
                setCrossState({ kind: 'error', message: '只支援 Twitch / YouTube 頻道網址' });
                return;
            }
            setCrossState({ kind: 'error', message: '請貼有效的頻道網址' });
        }, 500);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [crossUrlInput, target?.platform, target?.channelId]);

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
        try {
            const anonymousId = getOrCreateAnonymousId();
            const result = await mutation.mutateAsync({
                name: target.name,
                platform: target.platform,
                channel_id: channelId,
                url: target.url,
                anonymous_id: anonymousId || undefined,
                category_ids: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
                languages: selectedLangs.length > 0 ? selectedLangs : undefined,
                img_url: target.imgUrl || fetchedImgUrl || undefined,
                cross_channel_id: crossState.kind === 'ok' ? crossState.channelId : target.crossChannelId,
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
                        推薦會顯示在公開的「VTuber 推薦」頁。
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
                            proposeDisabled={!isLoggedIn}
                            proposeDisabledHint={!isLoggedIn ? '登入後才能新增分類' : undefined}
                        />
                    </div>

                    {shouldHideCrossUrl ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-zinc-900/50 border border-zinc-800">
                            <Link2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <p className="text-[11px] text-zinc-400">此頻道已與另一平台連結,毋需補貼</p>
                        </div>
                    ) : (
                    <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400">
                            另一平台也有頻道?(選填,雙平台合併顯示)
                        </Label>

                        {lockedSuggestion ? (
                            // 已從 suggestion 連結到既有 vtuber:顯示徽章 + 解除按鈕
                            <div className="flex items-center justify-between px-2.5 py-2 rounded bg-emerald-500/10 border border-emerald-500/30">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Link2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-[12px] text-emerald-300 truncate">
                                            已連結到「{lockedSuggestion.name}」
                                        </p>
                                        <p className="text-[10px] text-emerald-400/70">
                                            提交後將與既有 VTuber 合併
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleUnlockSuggestion}
                                    className="text-[11px] text-emerald-300 hover:text-emerald-200 flex items-center gap-1 shrink-0"
                                >
                                    <Link2Off className="w-3 h-3" />
                                    解除
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* 「您是不是這位?」suggestion(自動 fuzzy match,user 未 dismiss 才顯示) */}
                                {!suggestionDismissed && suggestions.length > 0 && target && (
                                    <VtuberSuggestionList
                                        suggestions={suggestions}
                                        currentPlatform={target.platform as 'twitch' | 'youtube'}
                                        currentChannelId={target.channelId || ''}
                                        onSelect={handleSelectSuggestion}
                                        onDismiss={() => setSuggestionDismissed(true)}
                                    />
                                )}

                                <Input
                                    type="url"
                                    value={crossUrlInput}
                                    onChange={(e) => setCrossUrlInput(e.target.value)}
                                    placeholder={
                                        target?.platform === 'twitch'
                                            ? '貼 YouTube 頻道網址,如 https://www.youtube.com/@xxx'
                                            : '貼 Twitch 頻道網址,如 https://www.twitch.tv/xxx'
                                    }
                                    className="bg-zinc-900 border-zinc-800 text-zinc-200 h-9 text-sm"
                                />
                                {/* 解析狀態提示 */}
                                {crossState.kind === 'ok' && (
                                    <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                                        <Check className="w-3 h-3" />
                                        偵測到 {crossState.platform === 'twitch' ? 'Twitch' : 'YouTube'} ·
                                        <code className="font-mono text-[10px] text-emerald-300/80">{crossState.channelId}</code>
                                    </p>
                                )}
                                {crossState.kind === 'resolving' && (
                                    <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                        解析 YouTube handle 中...
                                    </p>
                                )}
                                {crossState.kind === 'warn' && (
                                    <p className="text-[11px] text-amber-400 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" />
                                        {crossState.message}
                                    </p>
                                )}
                                {crossState.kind === 'error' && (
                                    <p className="text-[11px] text-red-400 flex items-center gap-1">
                                        <X className="w-3 h-3" />
                                        {crossState.message}
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                    )}

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
