// 後台：VTuber 投稿審核與資料回報（/api/admin/contributions、/api/admin/reports，X-Admin-Token）

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from './useAdminAnnouncements';

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
}

export interface ContributionRecord {
    id: string;
    action: 'add' | 'edit' | 'delete';
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
    source_urls: string[] | null;
    contact: string | null;
    page_url: string | null;
    status: 'open' | 'resolved' | 'wontfix' | 'duplicate' | 'spam';
    admin_notes: string | null;
    resolved_at: string | null;
    created_at: string;
    vtuber: { name: string; slug: string } | null;
    group: { name: string } | null;
}

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
    invalid_status: '狀態無效',
    approve_failed: '核准失敗（伺服器錯誤）',
    reject_failed: '駁回失敗（伺服器錯誤）',
    update_failed: '更新失敗（伺服器錯誤）',
    fetch_failed: '讀取失敗',
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
