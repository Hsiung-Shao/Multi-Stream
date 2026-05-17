// 留言列表(摺疊在 RecommendationCard 內)
//
// 顯示某 vtuber 的最新 20 則留言,含 user display_name + avatar_url。

import { useRecommendationComments } from '../hooks';
import { Loader2, MessageSquare } from 'lucide-react';

interface Props {
    vtuberId: string;
    enabled: boolean;  // 摺疊狀態用,只有展開時才 fetch
}

function formatRelativeTime(iso: string): string {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const diff = (Date.now() - t) / 1000;
    if (diff < 60) return '剛剛';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
    return new Date(iso).toLocaleDateString('zh-TW');
}

export function CommentList({ vtuberId, enabled }: Props) {
    const { data: comments = [], isLoading, isError } = useRecommendationComments(vtuberId, enabled);

    if (!enabled) return null;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-4 text-zinc-500 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                載入留言中...
            </div>
        );
    }

    if (isError) {
        return (
            <div className="py-3 text-xs text-red-400/80 text-center">
                留言載入失敗
            </div>
        );
    }

    if (comments.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 py-4 text-zinc-500 text-xs">
                <MessageSquare className="w-4 h-4" />
                <span>還沒有留言,期待你的第一條!</span>
            </div>
        );
    }

    return (
        <ul className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {comments.map(c => (
                <li
                    key={c.id}
                    className="flex gap-2.5 p-2 rounded-md bg-zinc-900/40 border border-zinc-800/60"
                >
                    {c.user.avatar_url ? (
                        <img
                            src={c.user.avatar_url}
                            alt={c.user.display_name || ''}
                            width="28"
                            height="28"
                            className="w-7 h-7 rounded-full object-cover shrink-0"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                    ) : (
                        <div className="w-7 h-7 rounded-full bg-zinc-800 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                            <span className="text-xs font-medium text-zinc-300 truncate">
                                {c.user.display_name || '匿名用戶'}
                            </span>
                            <span className="text-[10px] text-zinc-500 shrink-0 tabular-nums">
                                {formatRelativeTime(c.created_at)}
                            </span>
                        </div>
                        <p className="text-[13px] text-zinc-200 whitespace-pre-wrap break-words mt-0.5">
                            {c.comment}
                        </p>
                    </div>
                </li>
            ))}
        </ul>
    );
}
