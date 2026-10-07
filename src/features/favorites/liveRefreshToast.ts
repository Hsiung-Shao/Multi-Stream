import { toast } from 'sonner';
import i18n from '../../i18n/i18n';
import type { CheckNowResult } from './useLiveStatusCheck';

/**
 * 手動重新整理直播狀態後的提示（收藏選單與收藏管理共用）。
 * 2026-10-08 使用者回報「按重新整理沒反應」：狀態沒變時原本完全沒有提示，看起來像沒按到。
 */
export function showLiveRefreshToast(res: CheckNowResult): void {
    const deferred = res.deferred > 0
        ? i18n.t('favorites:refreshDeferred', { count: res.deferred })
        : undefined;
    if (res.cooldownRemainingMs > 0) {
        toast.info(i18n.t('favorites:refreshCooldown', { seconds: Math.ceil(res.cooldownRemainingMs / 1000) }), { description: deferred });
        return;
    }
    const message = res.changed > 0
        ? i18n.t('favorites:refreshDoneChanged', { count: res.changed })
        : i18n.t('favorites:refreshDoneNoChange');
    toast.success(message, { description: deferred });
}
