/**
 * 公開狀態頁資料（對齊 functions/api/status.js 回應）
 *
 * 任一區塊可能是 null（該來源暫時取不到），畫面要逐區處理，不能整頁當錯誤。
 */
import { useQuery } from '@tanstack/react-query';

export type Health = 'operational' | 'degraded' | 'down' | 'unknown';
export type IssueStatus = 'investigating' | 'identified' | 'fixing' | 'monitoring' | 'resolved';
export type IssueArea = 'canvas' | 'youtube' | 'twitch' | 'chat' | 'schedule' | 'favorites' | 'other';

export interface JobHealth {
    key: 'live' | 'light' | 'heavy' | 'twitchSchedule';
    status: Health;
    lastRunAt: string | null;
}

export interface KnownIssue {
    id: string;
    title: string;
    body: string | null;
    status: IssueStatus;
    severity: 'minor' | 'major';
    areas: IssueArea[];
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
}

/** 使用者回報（只公開內容、狀態、日期；伺服器會盡量遮蔽聯絡資訊；未讀的不公開） */
export type PublicFeedbackStatus = 'read' | 'processing' | 'fixed';
export interface PublicFeedback {
    id: string;
    content: string;
    /** 資料庫舊值 processed 由伺服器轉成 fixed 輸出 */
    status: PublicFeedbackStatus;
    /** 只到日期（'YYYY-MM-DD'，站方時區），不含時分；要當本地日期解析。解析失敗時伺服器回 null */
    created_at: string | null;
}

export interface StatusAnnouncement {
    id: string;
    title: string;
    body: string | null;
    starts_at: string;
    ends_at: string | null;
}

export interface StatusResponse {
    success: true;
    checkedAt: string;
    overall: Health;
    site: { status: Health; jobs: JobHealth[] } | null;
    youtube: {
        status: Health;
        checked: number;
        failed: number;
        quotaExceeded: boolean;
        /** live 排程最後一輪整輪失敗：checked／failed 不可信 */
        runFailed: boolean;
        lastRunAt: string | null;
    } | null;
    twitch: {
        status: Health;
        components: Array<{ name: string; status: Health }>;
        incidents: Array<{ name: string; status: string; url: string | null; updatedAt: string | null }>;
        updatedAt: string | null;
    } | null;
    issues: KnownIssue[] | null;
    announcements: StatusAnnouncement[] | null;
    feedbacks: PublicFeedback[] | null;
}

const FETCH_TIMEOUT_MS = 15_000;

export async function fetchStatus(signal?: AbortSignal): Promise<StatusResponse> {
    // 自己的 timeout（client fetch 一律要有逾時），並跟 TanStack Query 的取消訊號連動
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    try {
        const res = await fetch('/api/status', { credentials: 'same-origin', signal: ctrl.signal });
        if (!res.ok) throw new Error(`status ${res.status}`);
        if (!(res.headers.get('Content-Type') || '').includes('application/json')) throw new Error('non-json');
        const data = (await res.json()) as StatusResponse;
        if (!data?.success) throw new Error('bad payload');
        return data;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}

/**
 * 有效 1 分鐘、分頁可見時每 1 分鐘更新（與 edge 快取同步，再快也只會拿到同一份）。
 * SSR（entry-server）的 QueryClient 是 enabled:false，預渲染只會輸出殼層。
 */
export function useStatus() {
    return useQuery({
        queryKey: ['public-status', 'v1'],
        queryFn: ({ signal }) => fetchStatus(signal),
        staleTime: 60_000,
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
        retry: 1,
    });
}
