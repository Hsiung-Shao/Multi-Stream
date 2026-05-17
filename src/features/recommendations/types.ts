// 推薦系統前端共用 types(對齊 functions/api/recommendations/* response schema)

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
    user_id: string;
    comment: string | null;
    created_at: string;
}

export interface Category {
    id: string;
    name: string;
    slug: string;
    description: string | null;
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

// Mutation input
export interface RecommendInput {
    name: string;
    platform: 'twitch' | 'youtube';
    channel_id: string;
    url: string;
    comment?: string;
    turnstile_token?: string;
}
