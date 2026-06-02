// 推薦系統前端共用 types(對齊 functions/api/recommendations/* response schema)

import type { VtuberLang } from '../../lib/locale';

export type RecommendSort = 'daily' | 'all-time' | 'latest';

export interface VTuberInfo {
    id: string;
    name: string;
    img_url: string | null;
    nationality: string;
    activity: string;
    youtube_channel_id: string | null;
    youtube_subscriber_count: number | null;
    twitch_channel_id: string | null;
    twitch_follower_count: number | null;
    group_id: string | null;
    languages: VtuberLang[] | null;
    last_live_at?: string | null;              // #34 上次偵測到直播的時刻
    twitch_follower_delta?: number | null;     // #34 Twitch 訂閱變化（日級，當前 − 前一筆快照）
    youtube_subscriber_delta?: number | null;  // #34 YouTube 訂閱變化（週級）
}

export interface CommentPreview {
    comment: string;
    created_at: string;
}

export interface RecommendationAggregate {
    vtuber_id: string;
    count: number;
    latest_at: string;
    comments_preview: CommentPreview[];
    vtuber: VTuberInfo | null;
}

export interface RecommendationLatest {
    id: string;
    vtuber_id: string;
    user_id: string | null;
    comment: string | null;
    created_at: string;
}

export interface Category {
    id: string;
    name: string;
    slug: string;
}

export interface CommentUser {
    display_name: string | null;
    avatar_url: string | null;
}

export interface CommentItem {
    id: string;
    vtuber_id: string;
    comment: string;
    created_at: string;
    user: CommentUser;
}

// RecommendDialog target(統一從「收藏」或「推薦頁」觸發)
export interface RecommendTarget {
    name: string;
    platform: 'twitch' | 'youtube' | 'other';
    channelId: string | null;
    url: string;
    favoriteId?: string;       // 若從收藏觸發,callback 用來同步 localStorage
    imgUrl?: string;           // 若已知 avatar
    crossChannelId?: string;   // 另一平台 channel_id(讓 backend merge metadata)
}

// Mutation input
export interface RecommendInput {
    name: string;
    platform: 'twitch' | 'youtube';
    channel_id: string;
    url: string;
    comment?: string;
    turnstile_token?: string;
    anonymous_id?: string;
    category_ids?: string[];
    languages?: VtuberLang[];
    img_url?: string;
    cross_channel_id?: string;  // 另一平台的 channel_id(讓 backend merge 跨平台 metadata)
}

// 我的推薦 tab 用
export interface MyRecommendation {
    id: string;
    vtuber_id: string;
    comment: string | null;
    created_at: string;
    vtuber: VTuberInfo | null;
}

// VtuberDetailPage 用 — VTuberInfo + 累積推薦數 + 分類 tags
export interface VtuberDetailCategory {
    id: string;
    name: string;
    slug: string;
}

export interface SubscriberHistoryPoint {
    recorded_at: string;
    subscriber_count: number;
}

export interface SubscriberHistory {
    twitch: SubscriberHistoryPoint[];
    youtube: SubscriberHistoryPoint[];
}

export interface VtuberDetail {
    id: string;
    name: string;
    img_url: string | null;
    nationality: string;
    activity: string;
    group_id: string | null;
    youtube_channel_id: string | null;
    youtube_subscriber_count: number | null;
    twitch_channel_id: string | null;
    twitch_follower_count: number | null;
    languages: VtuberLang[] | null;
    debut_date: string | null;
    last_live_at: string | null;
    recommend_count: number;
    categories: VtuberDetailCategory[];
    subscriber_history: SubscriberHistory;
}

// 現正直播（/api/livestreams）— 由 cron 整表 swap 寫入，全部都是 live 中
export interface Livestream {
    id: string;
    title: string | null;
    video_url: string;
    thumbnail_url: string | null;
    platform: 'twitch' | 'youtube';
    start_time: string | null;       // Twitch 有；YouTube 為 null
    viewer_count: number | null;     // Twitch 有；YouTube 為 null
    vtuber: {
        id: string;
        name: string;
        img_url: string | null;
        youtube_channel_id: string | null;
        twitch_channel_id: string | null;
    } | null;
}
