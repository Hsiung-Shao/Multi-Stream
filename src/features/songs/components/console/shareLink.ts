// 歌曲分享：組出 /songs?list= 完整網址、複製到剪貼簿並用 toast 回報。只在事件處理裡呼叫（會碰 window／navigator）
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { PAGE_PATHS } from '../../../../config/routes';
import { serializeSongShare, SONG_SHARE_MAX, SONG_SHARE_PARAM } from '../../lib/songShareLink';

export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export function shareUrl(codes: string[]): string {
    return `${window.location.origin}${PAGE_PATHS.songs}?${SONG_SHARE_PARAM}=${serializeSongShare(codes)}`;
}

/** 複製分享連結並提示結果（歌單、單場歌回共用）；超過上限只會分享前 SONG_SHARE_MAX 首 */
export async function shareSongCodes(codes: string[], t: TFunction<'songs'>): Promise<void> {
    const ok = await copyText(shareUrl(codes));
    if (!ok) {
        toast.error(t('playlists.copyFailed'));
        return;
    }
    toast.success(t('playlists.copied'), {
        description: codes.length > SONG_SHARE_MAX ? t('playlists.shareTruncated', { max: SONG_SHARE_MAX }) : undefined,
    });
}
