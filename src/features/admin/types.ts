export type FeedbackStatus = 'unread' | 'read' | 'processed' | 'archived';

export interface FeedbackRecord {
    id: string;
    created_at: string;
    feedback_type: 'bug' | 'feature' | 'ui' | 'other';
    content: string;
    source: string | null;
    usage_time: string[] | null;
    usage_duration: string | null;
    rating: number | null;
    nps_score: number | null;
    user_agent: string | null;
    screen_resolution: string | null;
    window_size: string | null;
    theme: string | null;
    app_version: string | null;
    status: FeedbackStatus;
    admin_notes: string | null;
}

export interface FeedbackFilter {
    feedbackType?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page: number;
    pageSize: number;
}

export interface FeedbackStats {
    total: number;
    unread: number;
    byType: Record<string, number>;
    avgRating: number | null;
    avgNps: number | null;
}
