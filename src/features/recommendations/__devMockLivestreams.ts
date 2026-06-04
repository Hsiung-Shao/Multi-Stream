// ⚠️ DEV-ONLY 測試資料 — 勿用於生產 ⚠️
//
// 用途：本地開發時，若 /api/livestreams 回 0 筆（vtuber_livestreams 為空），
// 讓 LiveNowCarousel 的 Hero 大圖仍能渲染、供 UI 驗證。
//
// 注入點：LiveNowCarousel 內以 `import.meta.env.DEV` 守衛，
// 正式 build（import.meta.env.DEV === false）絕不會用到這份資料。
//
// 設計稿多出的 game / region / recCount 欄位真實 Livestream 沒有，
// 這裡用擴充型別 LivestreamWithDisplay 補齊，純為呈現完整 FeaturedTile 效果。
// 真實資料缺這些欄位時，FeaturedTile 會條件式省略對應 UI（不顯示）。

import type { Livestream } from './types';

// 擴充顯示欄位（皆 optional；真實資料無則 FeaturedTile 不顯示）
export interface LivestreamWithDisplay extends Livestream {
    game?: string | null;        // 遊戲 / 分類膠囊
    region?: string | null;      // 地區
    recCount?: number | null;    // 被推薦次數
}

export const DEV_MOCK_LIVESTREAMS: LivestreamWithDisplay[] = [
    {
        id: 'dev-mock-1',
        title: '【LIVE】深夜雜談 ＋ 觀眾留言互動 — 來聊聊今天發生的事',
        video_url: 'https://www.twitch.tv/ksp',
        thumbnail_url: null,            // null → 走設計漸層底 + 頭像 splash
        platform: 'twitch',
        start_time: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
        viewer_count: 4231,
        vtuber: {
            id: 'dev-vt-ksp',
            name: 'KSP',
            img_url: null,              // null → 走字母頭像
            youtube_channel_id: null,
            twitch_channel_id: 'ksp',
        },
        game: 'Just Chatting',
        region: 'TW',
        recCount: 8,
    },
    {
        id: 'dev-mock-2',
        title: '歌枠 #128 — 新譜「echo, again」收錄曲全曲挑戰，點歌開放中 🎤',
        video_url: 'https://www.youtube.com/watch?v=devmock2',
        thumbnail_url: null,
        platform: 'youtube',
        start_time: null,               // YouTube 無 start_time
        viewer_count: null,             // YouTube 無 viewer_count → 觀看數膠囊省略
        vtuber: {
            id: 'dev-vt-yuzumi',
            name: '橙Yuzumi',
            img_url: null,
            youtube_channel_id: 'UCdevmockyuzumi',
            twitch_channel_id: null,
        },
        game: '歌枠 / Karaoke',
        region: 'JP',
        recCount: 12,
    },
    {
        id: 'dev-mock-3',
        title: '【Silksong】銀河飆速 Speedrun — Any% 目標 1:42:00 首日衝刺',
        video_url: 'https://www.twitch.tv/devmockneko',
        thumbnail_url: null,
        platform: 'twitch',
        start_time: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
        viewer_count: 6173,
        vtuber: {
            id: 'dev-vt-neko',
            name: '惡魔貓',
            img_url: null,
            youtube_channel_id: null,
            twitch_channel_id: 'devmockneko',
        },
        game: 'Hollow Knight: Silksong',
        region: 'TW',
        recCount: 5,
    },
    {
        id: 'dev-mock-4',
        title: '巫女の朝活配信 ☀ 觀眾投稿企劃 + 雜談',
        video_url: 'https://www.youtube.com/watch?v=devmock4',
        thumbnail_url: null,
        platform: 'youtube',
        start_time: null,
        viewer_count: null,
        vtuber: {
            id: 'dev-vt-anninmiru',
            name: 'anninmiru_',
            img_url: null,
            youtube_channel_id: 'UCdevmockanninmiru',
            twitch_channel_id: null,
        },
        // 故意不給 game / region / recCount → 驗證 FeaturedTile 缺欄位優雅省略
        game: null,
        region: null,
        recCount: null,
    },
];
