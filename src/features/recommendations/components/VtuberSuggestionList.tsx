// 推薦 Dialog 的「您是不是這位?」suggestion 列表
//
// 在 user 貼主平台 URL 後,顯示 pg_trgm 模糊比對到的既有 vtubers。
// User 點選 → caller 把該 vtuber 的另一平台 URL 自動 prefill 進 cross URL 欄,
// 透過 ensureVtuberRow OR-dedupe 自動合併到既有 vtuber row。

import { Lightbulb, Sparkles, X } from 'lucide-react';
import type { VtuberSearchResult } from '../useVtuberSuggestions';

interface Props {
    suggestions: VtuberSearchResult[];
    /** user 主推平台 — 用於過濾「自己」(同平台同 channelId 不該出現在 suggestion) */
    currentPlatform: 'twitch' | 'youtube';
    /** user 主推 channelId — 過濾用 */
    currentChannelId: string;
    onSelect: (s: VtuberSearchResult) => void;
    onDismiss: () => void;
}

const TWITCH_COLOR = '#9146ff';
const YOUTUBE_COLOR = '#ff0033';

export function VtuberSuggestionList({
    suggestions,
    currentPlatform,
    currentChannelId,
    onSelect,
    onDismiss,
}: Props) {
    const normCurrent = currentChannelId.toLowerCase();
    const filtered = suggestions.filter(s => {
        // 1. 排除「自己」:同平台同 channelId(user 推的就是這位,沒得連結)
        const own = currentPlatform === 'twitch' ? s.twitch_channel_id : s.youtube_channel_id;
        if (own && own.toLowerCase() === normCurrent) return false;
        // 2. 必須在另一平台有 channelId,user 點選後 cross URL 才有東西可填、backend 才能 OR-dedupe
        const other = currentPlatform === 'twitch' ? s.youtube_channel_id : s.twitch_channel_id;
        if (!other) return false;
        return true;
    });

    if (filtered.length === 0) return null;

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <p className="text-[11px] text-amber-300 flex items-center gap-1">
                    <Lightbulb className="w-3 h-3" />
                    這位實況主可能已有人推薦過,連結既有 VTuber?
                </p>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5"
                    title="關閉此建議"
                >
                    <X className="w-3 h-3" />
                    都不是
                </button>
            </div>

            <div className="space-y-1 rounded-md bg-amber-500/5 border border-amber-500/20 p-1.5">
                {filtered.map(s => (
                    <button
                        key={s.id}
                        type="button"
                        onClick={() => onSelect(s)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-amber-500/10 transition-colors text-left"
                    >
                        {/* avatar */}
                        {s.img_url ? (
                            <img
                                src={s.img_url}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded-full object-cover shrink-0 bg-zinc-800"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                            />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-800 shrink-0" aria-hidden />
                        )}

                        {/* name + platform badges + recommend count */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm text-zinc-100 truncate">{s.name}</span>
                                {s.twitch_channel_id && (
                                    <span
                                        className="text-[9px] font-mono px-1 py-px rounded text-white shrink-0"
                                        style={{ backgroundColor: TWITCH_COLOR }}
                                        title="已有 Twitch 頻道"
                                    >
                                        TW
                                    </span>
                                )}
                                {s.youtube_channel_id && (
                                    <span
                                        className="text-[9px] font-mono px-1 py-px rounded text-white shrink-0"
                                        style={{ backgroundColor: YOUTUBE_COLOR }}
                                        title="已有 YouTube 頻道"
                                    >
                                        YT
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                <span className="flex items-center gap-0.5">
                                    <Sparkles className="w-2.5 h-2.5 text-pink-400" />
                                    {s.recommend_count} 推
                                </span>
                                <span>相似度 {Math.round(s.score * 100)}%</span>
                            </div>
                        </div>

                        {/* CTA */}
                        <span className="text-[11px] text-amber-300 shrink-0">選 →</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
