/**
 * 已知問題（known_issues）後台 hooks — 對應 functions/api/admin/known-issues.js
 *
 * 與公告分頁共用 apiFetch（X-Admin-Token、15 秒逾時）。公開頁 /status 有 60 秒 edge 快取，改完約 1～2 分鐘才看得到。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError, formatAdminAnnouncementError } from './useAdminAnnouncements';
import type { IssueArea, IssueStatus, KnownIssue } from '../../status/api';

export const KNOWN_ISSUES_KEY = 'admin-known-issues';

export interface KnownIssueRecord extends KnownIssue {
    is_public: boolean;
}

export interface KnownIssueWriteInput {
    title: string;
    body: string | null;
    status: IssueStatus;
    severity: 'minor' | 'major';
    areas: IssueArea[];
    is_public: boolean;
}

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
    investigating: '調查中',
    identified: '已確認原因',
    fixing: '修復中',
    monitoring: '已修正，觀察中',
    resolved: '已修復',
};

export const ISSUE_AREA_LABEL: Record<IssueArea, string> = {
    canvas: '畫布',
    youtube: 'YouTube',
    twitch: 'Twitch',
    chat: '聊天室',
    schedule: '開台週表',
    favorites: '收藏',
    other: '其他',
};

// 對齊 functions/lib/known-issues.js buildKnownIssueWritePayload 會回的全部錯誤碼；
// endpoint 層的共通錯誤（id_required、not_found、create_failed…）由 formatAdminAnnouncementError 處理
const ISSUE_ERRORS: Record<string, string> = {
    invalid_body: '請求內容格式錯誤',
    title_required: '請填寫標題',
    title_too_long: '標題最多 120 字',
    body_too_long: '站方回應最多 4000 字',
    invalid_body_field: '站方回應格式錯誤',
    invalid_status: '無效的處理狀態',
    invalid_severity: '無效的影響程度',
    invalid_areas: '無效的影響範圍',
    invalid_is_public: '無效的公開設定',
};

export function formatKnownIssueError(err: unknown): string {
    const code = err instanceof ApiError ? err.payload?.error : undefined;
    if (typeof code === 'string' && ISSUE_ERRORS[code]) return ISSUE_ERRORS[code];
    return formatAdminAnnouncementError(err);
}

export function useAdminKnownIssues() {
    return useQuery({
        queryKey: [KNOWN_ISSUES_KEY],
        queryFn: async (): Promise<KnownIssueRecord[]> => {
            const data = await apiFetch<{ ok: true; issues: KnownIssueRecord[] }>('/api/admin/known-issues');
            return data.issues ?? [];
        },
        staleTime: 30_000,
        retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 3,
    });
}

/** 新增（id 為 null）或更新 */
export function useSaveKnownIssue() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, input }: { id: string | null; input: KnownIssueWriteInput }): Promise<KnownIssueRecord> => {
            const data = await apiFetch<{ ok: true; issue: KnownIssueRecord }>(
                id ? `/api/admin/known-issues?id=${encodeURIComponent(id)}` : '/api/admin/known-issues',
                { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) },
            );
            return data.issue;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: [KNOWN_ISSUES_KEY] }),
    });
}

export function useDeleteKnownIssue() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiFetch<{ ok: true }>(`/api/admin/known-issues?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: [KNOWN_ISSUES_KEY] }),
    });
}
