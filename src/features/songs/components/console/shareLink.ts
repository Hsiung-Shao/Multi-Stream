// 歌單分享：複製連結（剪貼簿失敗回 false）、組出 /songs?list= 完整網址。只在事件處理裡呼叫（會碰 window／navigator）
import { PAGE_PATHS } from '../../../../config/routes';
import { serializeSongShare, SONG_SHARE_PARAM } from '../../lib/songShareLink';

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
