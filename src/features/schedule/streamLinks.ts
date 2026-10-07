// 由 snapshot 的精簡欄位推導觀看網址與縮圖（後端刻意不放這些可推導欄位，見 snapshot.ts 檔頭）。

import type { ScheduleChannel, ScheduleStream } from './types';

/**
 * 沒有影片 ID 的場次：社群貼文週表圖解析（community_post）與使用者投稿（user_submission），
 * external_id 是 post:<postId>:<n>／sub:<id>:<n>。連結與加入畫布都退回頻道（YouTube 用 /channel/<UC…>/live）。
 */
export function isNonVideoStream(s: Pick<ScheduleStream, 'source' | 'external_id'>): boolean {
    return s.source === 'community_post' || s.source === 'user_submission' || /^(post|sub):/.test(s.external_id);
}

function youtubeChannelLive(ch: ScheduleChannel | undefined): string | null {
    return ch?.youtube ? `https://www.youtube.com/channel/${ch.youtube}/live` : null;
}

/** 在原平台觀看的網址 */
export function watchUrl(s: ScheduleStream, ch: ScheduleChannel | undefined): string | null {
    if (s.platform === 'youtube') return isNonVideoStream(s) ? youtubeChannelLive(ch) : `https://www.youtube.com/watch?v=${s.external_id}`;
    return ch?.twitch ? `https://www.twitch.tv/${ch.twitch}` : null;
}

/** 卡片縮圖（沒有影片的場次沒有縮圖，卡片退回頭像） */
export function thumbnailUrl(s: ScheduleStream, ch: ScheduleChannel | undefined): string | null {
    if (s.platform === 'youtube') return isNonVideoStream(s) ? null : `https://i.ytimg.com/vi/${s.external_id}/hqdefault.jpg`;
    return ch?.twitch ? `https://static-cdn.jtvnw.net/previews-ttv/live_user_${ch.twitch}-640x360.jpg` : null;
}

/**
 * YouTube 頭像網址帶尺寸參數 =s88-…，放大顯示（個人頁頁首、og:image）時改成 400px；其他來源原樣回傳。
 * edge 端 functions/lib/schedule-person.js 有同一份（tests/functions/schedulePersonEdge.test.ts 比對）。
 */
export function largerAvatar(url: string): string {
    return /^https:\/\/yt3\.(ggpht|googleusercontent)\.com\//.test(url) ? url.replace(/=s\d+-/, '=s400-') : url;
}

/**
 * 給 useStreamStore.addStream 的輸入：YouTube 用 watch 網址（addStream 不收頻道網址）、Twitch 用 login。
 * 拿不到（Twitch 沒有 login）就回 null，呼叫端略過。
 */
export function canvasInput(s: ScheduleStream, ch: ScheduleChannel | undefined): string | null {
    if (s.platform === 'youtube') return isNonVideoStream(s) ? youtubeChannelLive(ch) : `https://www.youtube.com/watch?v=${s.external_id}`;
    return ch?.twitch ?? null;
}
