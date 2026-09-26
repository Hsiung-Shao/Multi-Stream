import { useStreamStore } from '../../store/useStreamStore';
import type { FavoriteStream } from './types';

/**
 * 把收藏逐一加入畫布（每路附聊天室），回傳成功加入的數量。
 * 動態島收藏選單的批次載入與空畫布的「你的收藏」共用這一份，行為一致：
 * 有 liveUrl（已解析出的直播網址）就用它，省一次解析；名稱沿用收藏名稱。
 * 逐一 await：addStream 會依畫布現況排版，並行加入會互相覆蓋版面。
 */
export async function loadFavoritesToCanvas(favs: FavoriteStream[]): Promise<number> {
    const addStream = useStreamStore.getState().addStream;
    let added = 0;
    for (const fav of favs) {
        try {
            const res = await addStream(fav.liveUrl || fav.url, {
                withChat: true,
                withStream: true,
                displayName: fav.name,
            });
            if (res?.success !== false) added++;
        } catch (e) {
            console.error(`Failed to add ${fav.name}`, e);
        }
    }
    return added;
}
