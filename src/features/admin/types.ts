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
    /** 內容關鍵字(ilike 模糊比對) */
    search?: string;
    /** 只顯示有評分或 NPS 的回饋(評分/NPS 分頁用) */
    hasScore?: boolean;
    page: number;
    pageSize: number;
}

export interface FeedbackStats {
    total: number;
    unread: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    avgRating: number | null;
    avgNps: number | null;
    /** NPS 標準分數:(推薦者 9-10 − 批評者 0-6) / 有 NPS 樣本數 × 100,範圍 -100~100 */
    npsScore: number | null;
    /** 近 7 日新增回饋數 */
    last7Days: number;
    /** 近 30 日每日回饋數(含 0 的日期,由舊到新;date 為本地 YYYY-MM-DD) */
    byDay: { date: string; count: number }[];
    /** 評分分布,index 0~4 對應 1~5 分 */
    ratingDist: number[];
    /** NPS 分布,index 0~10 對應 0~10 分 */
    npsDist: number[];
}
