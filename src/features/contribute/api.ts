// 投稿 VTuber 與資料回報的前端 API（後端：functions/api/vtuber/*、functions/api/report.js）。
// 一律帶逾時（memory error_client_fetch_needs_timeout）；錯誤轉成 SubmitError（code 對應 i18n contribute.error.*）。

const TIMEOUT_MS = 15_000;

export class SubmitError extends Error {
    constructor(
        public code: string,
        public status: number,
        public data: Record<string, unknown> | null = null,
    ) {
        super(code);
        this.name = 'SubmitError';
    }
}

async function requestJson<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    let res: Response;
    try {
        res = await fetch(path, {
            ...init,
            signal: controller.signal,
            headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
        });
    } catch (e) {
        if (signal?.aborted) throw e;
        throw new SubmitError((e as Error)?.name === 'AbortError' ? 'timeout' : 'network', 0);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || data?.ok === false) {
        throw new SubmitError(typeof data?.error === 'string' ? data.error : `http_${res.status}`, res.status, data);
    }
    return data as T;
}

export interface LookedUpChannel {
    channelId: string;
    title: string | null;
    avatarUrl: string | null;
    handle: string | null;
}

export interface ChannelLookupResult {
    channel: LookedUpChannel;
    /** 已經在週表上（有個人頁） */
    exists: { name: string; slug: string } | null;
    /** 已有人推薦、待審中 */
    pending: boolean;
}

export function lookupChannel(url: string, signal?: AbortSignal): Promise<ChannelLookupResult> {
    return requestJson<ChannelLookupResult>(`/api/vtuber/channel-lookup?url=${encodeURIComponent(url)}`, {}, signal);
}

export type AffiliationType = 'personal' | 'agency' | 'circle';

export interface ContributionInput {
    youtubeUrl: string;
    name: string;
    nationality: string;
    nationalityEvidenceUrl?: string;
    affiliation: { type: AffiliationType; groupName?: string };
    bio?: string;
    avatarUrl?: string;
    subscriberCount?: string;
    socials: { x?: string; facebook?: string; instagram?: string; twitch?: string };
    note?: string;
    contact?: string;
    turnstileToken: string | null;
}

export function submitContribution(input: ContributionInput): Promise<{ ok: true; id: string | null }> {
    return requestJson('/api/vtuber/contribute', { method: 'POST', body: JSON.stringify(input) });
}

export type ReportKind = 'vtuber_info' | 'stream' | 'roster' | 'missing_vtuber';

/** 「補充資料」可填的欄位（與後端 SUGGESTED_KEYS 一致，functions/lib/vtuber-submit.js） */
export const SUGGESTED_FIELDS = ['x', 'facebook', 'instagram', 'youtube', 'twitch', 'bio'] as const;
export type SuggestedField = (typeof SUGGESTED_FIELDS)[number];
export type ReportSuggested = Partial<Record<SuggestedField, string>>;

export interface ReportInput {
    kind: ReportKind;
    reasons: string[];
    /** 只有勾「補充資料」（add_info）時送出 */
    suggested?: ReportSuggested;
    vtuberId?: string;
    groupId?: string;
    stream?: { platform: 'youtube' | 'twitch'; externalId: string };
    description?: string;
    sourceUrls?: string[];
    contact?: string;
    pageUrl?: string;
    turnstileToken: string | null;
}

export function submitReport(input: ReportInput): Promise<{ ok: true }> {
    return requestJson('/api/report', { method: 'POST', body: JSON.stringify(input) });
}

/** 與後端 REPORT_REASONS_BY_KIND 相同（functions/lib/vtuber-submit.js） */
export const REPORT_REASONS: Record<ReportKind, string[]> = {
    vtuber_info: ['name', 'group', 'nationality', 'graduated', 'channel_link', 'not_vtuber', 'add_info', 'other'],
    stream: ['wrong_time', 'cancelled', 'duplicate', 'other'],
    roster: ['missing_member', 'wrong_member', 'graduated', 'other'],
    missing_vtuber: ['other'],
};

export interface TurnstileConfig {
    siteKey: string | null;
    enforced: boolean;
}

let turnstileConfig: Promise<TurnstileConfig> | null = null;

/** 同一個頁面只抓一次；失敗時不快取，下次再試 */
export function fetchTurnstileConfig(): Promise<TurnstileConfig> {
    if (!turnstileConfig) {
        turnstileConfig = requestJson<TurnstileConfig>('/api/turnstile-config').catch((e) => {
            turnstileConfig = null;
            throw e;
        });
    }
    return turnstileConfig;
}

/** 測試用 */
export function resetTurnstileConfigCache(): void {
    turnstileConfig = null;
}
