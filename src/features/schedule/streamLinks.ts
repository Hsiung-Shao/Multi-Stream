// 由 snapshot 的精簡欄位推導觀看網址與縮圖（後端刻意不放這些可推導欄位，見 snapshot.ts 檔頭）。

import type { ScheduleChannel, ScheduleStream } from './types';

/** 在原平台觀看的網址 */
export function watchUrl(s: ScheduleStream, ch: ScheduleChannel | undefined): string | null {
    if (s.platform === 'youtube') return `https://www.youtube.com/watch?v=${s.external_id}`;
    return ch?.twitch ? `https://www.twitch.tv/${ch.twitch}` : null;
}

/** 卡片縮圖 */
export function thumbnailUrl(s: ScheduleStream, ch: ScheduleChannel | undefined): string | null {
    if (s.platform === 'youtube') return `https://i.ytimg.com/vi/${s.external_id}/hqdefault.jpg`;
    return ch?.twitch ? `https://static-cdn.jtvnw.net/previews-ttv/live_user_${ch.twitch}-640x360.jpg` : null;
}

/**
 * 給 useStreamStore.addStream 的輸入：YouTube 用 watch 網址（addStream 不收頻道網址）、Twitch 用 login。
 * 拿不到（Twitch 沒有 login）就回 null，呼叫端略過。
 */
export function canvasInput(s: ScheduleStream, ch: ScheduleChannel | undefined): string | null {
    if (s.platform === 'youtube') return `https://www.youtube.com/watch?v=${s.external_id}`;
    return ch?.twitch ?? null;
}
