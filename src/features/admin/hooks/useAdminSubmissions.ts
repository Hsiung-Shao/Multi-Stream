// 後台：VTuber 投稿審核與資料回報（/api/admin/contributions、/api/admin/reports，X-Admin-Token）

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ADMIN_TOKEN_EVENT, ADMIN_TOKEN_STORAGE_KEY, apiFetch, ApiError, LIST_KEY as ANNOUNCEMENTS_KEY } from './useAdminAnnouncements';

export interface ContributionPayload {
    name?: string;
    youtube_channel_id?: string;
    handle?: string | null;
    avatar_url?: string | null;
    channel_title?: string | null;
    nationality?: string;
    nationality_evidence_url?: string | null;
    affiliation_type?: 'personal' | 'agency' | 'circle';
    group_id?: string | null;
    group_name?: string | null;
    bio?: string | null;
    x_url?: string | null;
    facebook_url?: string | null;
    instagram_url?: string | null;
    twitch_login?: string | null;
    subscriber_count_claimed?: string | null;
    // ---- 週表投稿（action='schedule'）----
    vtuber_id?: string;
    vtuber_name?: string | null;
    vtuber_slug?: string | null;
    entries?: ScheduleEntry[];
    /** user＝使用者投稿；vision＝低信心的社群貼文週表圖自動解析 */
    source?: 'user' | 'vision';
    /** 自動解析的信心（0～1） */
    confidence?: number | null;
    post_id?: string | null;
    post_url?: string | null;
    image_url?: string | null;
    note?: string | null;
}

/** 週表投稿的一列（台北時間；與後端 functions/lib/schedule-submit.js 一致） */
export interface ScheduleEntry {
    date: string;
    time: string;
    title: string;
    platform: 'youtube' | 'twitch';
}

export interface ContributionRecord {
    id: string;
    action: 'add' | 'edit' | 'delete' | 'schedule';
    payload: ContributionPayload;
    status: 'pending' | 'approved' | 'rejected';
    submitted_by: string | null;
    submitter_contact: string | null;
    source_urls: string[] | null;
    source_note: string | null;
    auto_check: { channel_title?: string | null; name_matches_title?: boolean; avatar_is_channel_avatar?: boolean } | null;
    reviewer_notes: string | null;
    reviewed_at: string | null;
    created_at: string;
    youtube_channel_id: string | null;
    target_vtuber_id: string | null;
}

export interface ReportRecord {
    id: string;
    kind: 'vtuber_info' | 'stream' | 'roster' | 'missing_vtuber';
    reasons: string[];
    vtuber_id: string | null;
    group_id: string | null;
    stream_platform: 'youtube' | 'twitch' | null;
    stream_external_id: string | null;
    description: string | null;
    /** 「補充資料」：後端正規化後的值（youtube 是 UC… 或 @handle，twitch 是 login） */
    suggested: Partial<Record<ApplyField, string>> | null;
    source_urls: string[] | null;
    contact: string | null;
    page_url: string | null;
    status: 'open' | 'resolved' | 'wontfix' | 'duplicate' | 'spam';
    admin_notes: string | null;
    resolved_at: string | null;
    created_at: string;
    vtuber: {
        name: string;
        slug: string;
        x_url?: string | null;
        facebook_url?: string | null;
        instagram_url?: string | null;
        bio?: string | null;
        youtube_channel_id?: string | null;
        twitch_channel_id?: string | null;
    } | null;
    group: { name: string } | null;
}

/** 補充資料可套用的欄位（與後端 SUGGESTED_KEYS 一致） */
export type ApplyField = 'x' | 'facebook' | 'instagram' | 'youtube' | 'twitch' | 'bio';

/** 核准時的覆蓋欄位（與後端 validateOverrides 白名單一致） */
export interface ApproveOverrides {
    name?: string;
    nationality?: string;
    avatar_url?: string;
    bio?: string;
    x_url?: string;
    facebook_url?: string;
    instagram_url?: string;
    twitch_login?: string;
    affiliation_type?: 'personal' | 'agency' | 'circle';
    group_name?: string;
    new_group?: { name: string; kind: 'agency' | 'circle'; nationality?: string | null };
    reviewer_notes?: string;
}

const CONTRIB_KEY = 'admin-contributions';
const REPORT_KEY = 'admin-reports';

/** 換了 token 之後：用 X-Admin-Token 的分頁（公告、投稿、回報）都重新讀（分頁都 forceMount，舊的 401 結果會一直留著） */
export function invalidateAdminTokenQueries(qc: QueryClient): Promise<void> {
    return Promise.all([CONTRIB_KEY, REPORT_KEY, ANNOUNCEMENTS_KEY].map((k) => qc.invalidateQueries({ queryKey: [k] }))).then(() => undefined);
}

/** 後台頁掛一次：任一分頁設定或清除 token 時重新讀取（單一來源，避免每個分頁各自重抓） */
export function useRefetchOnAdminTokenChange(): void {
    const qc = useQueryClient();
    useEffect(() => {
        const onChange = () => void invalidateAdminTokenQueries(qc);
        // 其他瀏覽器分頁改了 token：storage 事件（只看 token 這個 key）
        const onStorage = (e: StorageEvent) => {
            if (e.key === null || e.key === ADMIN_TOKEN_STORAGE_KEY) onChange();
        };
        window.addEventListener(ADMIN_TOKEN_EVENT, onChange);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener(ADMIN_TOKEN_EVENT, onChange);
            window.removeEventListener('storage', onStorage);
        };
    }, [qc]);
}

/** 401：token 沒設或錯了，要顯示輸入列 */
export function isUnauthorized(err: unknown): boolean {
    return err instanceof ApiError && err.status === 401;
}

export function useContributions(status: string) {
    return useQuery({
        queryKey: [CONTRIB_KEY, status],
        queryFn: async () => (await apiFetch<{ contributions: ContributionRecord[] }>(`/api/admin/contributions?status=${status}&limit=200`)).contributions ?? [],
        staleTime: 30_000,
        retry: false,
    });
}

export function useApproveContribution() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, overrides }: { id: string; overrides: ApproveOverrides }) =>
            apiFetch<{ result: { vtuber_id: string; slug: string } }>(`/api/admin/contributions?id=${id}&action=approve`, {
                method: 'POST',
                body: JSON.stringify({ overrides }),
            }),
        onSuccess: () => qc.invalidateQueries({ queryKey: [CONTRIB_KEY] }),
    });
}

/** 核准週表投稿（approve_schedule_contribution）：entries＝審核後的表格內容，notes 由後端併入 payload.reviewer_notes */
export function useApproveScheduleContribution() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, entries, notes }: { id: string; entries: ScheduleEntry[]; notes: string }) =>
            apiFetch<{ result: { vtuber_id: string; slug: string; written: number; canceled: number } }>(`/api/admin/contributions?id=${id}&action=approve`, {
                method: 'POST',
                body: JSON.stringify({ entries, notes }),
            }),
        onSuccess: () => qc.invalidateQueries({ queryKey: [CONTRIB_KEY] }),
    });
}

export function useRejectContribution() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, notes }: { id: string; notes: string }) =>
            apiFetch(`/api/admin/contributions?id=${id}&action=reject`, { method: 'POST', body: JSON.stringify({ notes }) }),
        onSuccess: () => qc.invalidateQueries({ queryKey: [CONTRIB_KEY] }),
    });
}

export function useReports(status: string, kind: string) {
    return useQuery({
        queryKey: [REPORT_KEY, status, kind],
        queryFn: async () => (await apiFetch<{ reports: ReportRecord[] }>(`/api/admin/reports?status=${status}&kind=${kind}&limit=200`)).reports ?? [],
        staleTime: 30_000,
        retry: false,
    });
}

export function useUpdateReport() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, status, admin_notes }: { id: string; status: ReportRecord['status']; admin_notes: string }) =>
            apiFetch(`/api/admin/reports?id=${id}`, { method: 'PUT', body: JSON.stringify({ status, admin_notes }) }),
        onSuccess: () => qc.invalidateQueries({ queryKey: [REPORT_KEY] }),
    });
}

/** 套用補充資料（apply_vtuber_report_info）；成功後回報會變成已修正 */
export function useApplyReport() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, fields, admin_notes }: { id: string; fields: Partial<Record<ApplyField, string>>; admin_notes: string }) =>
            apiFetch<{ result: { slug: string; applied: string[] } }>(`/api/admin/reports?id=${id}&action=apply`, {
                method: 'POST',
                body: JSON.stringify({ fields, admin_notes }),
            }),
        onSuccess: () => qc.invalidateQueries({ queryKey: [REPORT_KEY] }),
    });
}

const ERRORS: Record<string, string> = {
    request_timeout: '請求逾時（15 秒），請稍後再試',
    unauthorized: 'Admin API Token 無效，請重新設定',
    admin_not_configured: '後端尚未設定 ADMIN_API_TOKEN',
    not_found: '找不到這筆資料（可能已被處理）',
    not_pending: '這筆已經審核過了',
    exists: '這個 YouTube 頻道已經在站上',
    twitch_exists: '這個 Twitch 帳號已經屬於站上另一位 VTuber',
    group_exists: '已有同名團體：請取消「建立新團體」，改用既有團體名稱',
    group_unresolved: '找不到這個團體：請確認名稱，或勾選「建立新團體」',
    group_not_found: '指定的團體不存在',
    invalid_name: '名稱無效（必填、最多 100 字）',
    invalid_nationality: '地區無效',
    invalid_group: '團體欄位無效',
    invalid_avatar: '頭像網址無效（只收 https）',
    invalid_x: 'X 帳號格式不正確',
    invalid_instagram: 'Instagram 帳號格式不正確',
    invalid_facebook: 'Facebook 網址不正確',
    invalid_twitch: 'Twitch 帳號格式不正確',
    invalid_twitch_id: 'Twitch 帳號 ID 無效（請重新核准）',
    invalid_status: '狀態無效',
    approve_failed: '核准失敗（伺服器錯誤）',
    reject_failed: '駁回失敗（伺服器錯誤）',
    update_failed: '更新失敗（伺服器錯誤）',
    fetch_failed: '讀取失敗',
    not_open: '這筆回報已經處理過了',
    no_target: '這筆回報沒有對應的 VTuber',
    no_fields: '沒有要套用的欄位',
    invalid_field: '欄位格式不正確',
    invalid_bio: '簡介最多 500 字',
    youtube_already_set: '這位 VTuber 已經有 YouTube 頻道（只能補缺，要換頻道請手動處理）',
    twitch_already_set: '這位 VTuber 已經有 Twitch 帳號（只能補缺，要換帳號請手動處理）',
    youtube_not_found: '找不到這個 YouTube 頻道',
    youtube_fetch_failed: '暫時查不到 YouTube 頻道資料，請稍後再試',
    youtube_invalid_url: 'YouTube 頻道網址格式不正確',
    youtube_unsupported_url: '不支援 /c/ 或 /user/ 舊式網址，請改用 @handle 或 /channel/ 網址',
    twitch_not_found: '找不到這個 Twitch 帳號',
    twitch_fetch_failed: '暫時查不到 Twitch 帳號資料，請稍後再試',
    apply_failed: '套用失敗（伺服器錯誤）',
    invalid_suggested: '補充資料太長',
    invalid_id: '回報 ID 格式不正確',
    invalid_action: '不支援的操作',
    no_entries: '沒有可寫入的場次（至少要一列，最多 14 列）',
    invalid_entry: '有一列的日期或時間格式不正確',
    invalid_entries: '場次列表不正確（1～14 列、同一天同一時間不能重複、平台只能是 YouTube／Twitch）',
    invalid_entry_date: '日期超出範圍（7 天前～未來 10 天，台北時間）',
    invalid_entry_time: '時間格式不正確（HH:MM）',
    invalid_entry_title: '標題必填，最多 80 字',
    channel_not_found: '這位 VTuber 沒有可用的 YouTube／Twitch 頻道，無法寫入週表',
    vtuber_not_found: '找不到這位 VTuber（可能已畢業或被刪除）',
    invalid_vtuber: 'VTuber ID 格式不正確',
};

export function formatSubmissionError(err: unknown): string {
    if (err instanceof ApiError) {
        const code = err.payload?.error;
        if (typeof code === 'string' && ERRORS[code]) return ERRORS[code];
        if (err.status === 401) return 'Admin API Token 無效或未設定';
        return code || `操作失敗（HTTP ${err.status}）`;
    }
    return err instanceof Error ? err.message : '未知錯誤';
}
