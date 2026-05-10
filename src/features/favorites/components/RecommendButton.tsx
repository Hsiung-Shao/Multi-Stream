import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { toast } from 'sonner';
import { getSupabase } from '../../../lib/supabase';
import type { FavoriteStream } from '../types';

interface RecommendButtonProps {
    favorite: FavoriteStream;
}

/**
 * 一鍵把「收藏的實況主」推薦給 VTuber 探索（status='approved' 直接公開）。
 *
 * 設計：
 *   - user 已收藏 + 主動點推薦 → 雙重意圖，server 端直接 status='approved'
 *   - 不開 form，省去手動填表步驟（admin 後台仍可審查 / 撤下）
 *   - rate limit 由 server 端用 increment_contribution_quota RPC 控管（每 user 每日上限）
 *
 * platform 限制：只支援 twitch / youtube（plan 中收藏列表的兩種類型）；
 *                'other' 平台目前不開放推薦
 */
export function RecommendButton({ favorite }: RecommendButtonProps) {
    const { t } = useTranslation(['favorites', 'common']);
    const [submitting, setSubmitting] = useState(false);

    const canRecommend = favorite.platform === 'twitch' || favorite.platform === 'youtube';
    const channelId = favorite.platform === 'twitch'
        ? favorite.channelId
        : favorite.channelId;

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!canRecommend) {
            toast.error(t('recommend.unsupportedPlatform', '此平台暫不支援推薦'));
            return;
        }
        if (!channelId) {
            toast.error(t('recommend.missingChannelId', '收藏資料不完整，無法推薦'));
            return;
        }

        setSubmitting(true);
        try {
            // 拿當前 access_token；getSession 不需驗 aal2，aal1 即可
            const supabase = await getSupabase();
            const { data: sessionData } = supabase ? await supabase.auth.getSession() : { data: null };
            const token = sessionData?.session?.access_token;
            if (!token) {
                toast.error(t('recommend.notLoggedIn', '請先登入'));
                setSubmitting(false);
                return;
            }

            const res = await fetch('/api/vtuber/recommend-from-favorite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    name: favorite.name,
                    platform: favorite.platform,
                    channel_id: channelId,
                    url: favorite.url,
                }),
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok && data?.success) {
                toast.success(t('recommend.success', '已推薦給 VTuber 探索'));
            } else if (res.status === 429) {
                toast.error(data?.error || t('recommend.rateLimit', '本日推薦額度已達上限'));
            } else if (res.status === 401) {
                toast.error(t('recommend.notLoggedIn', '請先登入'));
            } else {
                toast.error(data?.error || t('recommend.failed', '推薦失敗，請稍後再試'));
            }
        } catch {
            toast.error(t('recommend.failed', '推薦失敗，請稍後再試'));
        } finally {
            setSubmitting(false);
        }
    };

    if (!canRecommend) return null;

    return (
        <Button
            size="icon"
            variant="ghost"
            onClick={handleClick}
            disabled={submitting}
            title={t('recommend.tooltip', '推薦給 VTuber 探索')}
            className="h-8 w-8 rounded-lg text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:text-gray-400 dark:hover:text-emerald-400 dark:hover:bg-emerald-500/10"
        >
            {submitting
                ? <Loader2 className="size-4 animate-spin" />
                : <Megaphone className="size-4" />
            }
        </Button>
    );
}
