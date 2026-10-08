// GET /api/status — 公開狀態頁 /status 的整頁資料（一次請求拿齊四區）
//
// 回應：{ success: true, checkedAt, overall, site, youtube, twitch, issues, announcements }
//   site / youtube：本站自檢（cron_shard_state，service_role 讀；只回燈號、時間與數字，不回 errors 字串）
//   twitch：Twitch 官方 Statuspage 摘要（代抓，瀏覽器不直連第三方）
//   issues：known_issues 公開中的條目（未解決，或 14 天內解決）
//   feedbacks：使用者回報（只限送出時已告知會公開、未封存、近 30 天；只回內容／狀態／日期，聯絡資訊已遮蔽）
//   announcements：一般公告（type=announcement、target=all、status=published）含已過期的歷史公告；封存的不公開
// 任一來源失敗就回 null，其他區塊照常回（前端顯示「暫時無法取得」）。
//
// 快取：整份結果在 edge 快取 60 秒、Twitch 摘要另快取 5 分鐘（Cache API 只在自訂網域生效，*.pages.dev 不快取）。
// 這支會被任何人打，所以不寫 KV、不逐次寫 system_logs，只在 DB 查詢失敗時記一筆（受 60 秒快取限流）。

import { jsonResponse, handleOptions, getCorsHeaders } from '../lib/cors.js';
import { select } from '../lib/supabase-server.js';
import { logError } from '../lib/logger.js';
import { siteHealth, youtubeHealth, summarizeTwitch, worstHealth, JOB_THRESHOLDS } from '../lib/status-health.js';
import { publicIssuesQuery } from '../lib/known-issues.js';
import { publicFeedbackQuery, toPublicFeedback } from '../lib/feedback-public.js';

const PAGE_TTL_SECONDS = 60;
const TWITCH_TTL_SECONDS = 300;
const TWITCH_FAIL_TTL_SECONDS = 60;
const TWITCH_TIMEOUT_MS = 5000;
const TWITCH_SUMMARY_URL = 'https://status.twitch.com/api/v2/summary.json';
const ANNOUNCEMENT_LIMIT = 10;

const PAGE_CACHE_KEY = 'https://status.invalid/page/v1';
const TWITCH_CACHE_KEY = 'https://status.invalid/twitch/v1';

function getCache() {
    return typeof caches !== 'undefined' ? caches.default : null;
}

// 瀏覽器不另外快取（edge 已快取 60 秒；兩層疊加會讓頁面最多慢 2 分鐘以上）
const CLIENT_HEADERS = { 'Cache-Control': 'no-cache' };

export async function onRequestGet(context) {
    const { request } = context;
    const cache = getCache();
    const key = new Request(PAGE_CACHE_KEY);

    if (cache) {
        const hit = await cache.match(key).catch(() => null);
        // 命中時直接轉送快取的 body，不重新 parse / stringify（最常走的路徑，省 Workers CPU）
        if (hit) {
            return new Response(hit.body, {
                status: 200,
                headers: { 'Content-Type': 'application/json', ...getCorsHeaders(request), ...CLIENT_HEADERS, 'X-Edge-Cache': 'HIT' },
            });
        }
    }

    const body = await buildStatus(context, Date.now());
    if (cache) {
        context.waitUntil?.(
            cache.put(key, new Response(JSON.stringify(body), { headers: { 'Cache-Control': `public, max-age=${PAGE_TTL_SECONDS}` } }))
                .catch(() => {}),
        );
    }
    return jsonResponse(body, 200, request, { ...CLIENT_HEADERS, 'X-Edge-Cache': cache ? 'MISS' : 'SKIP' });
}

/**
 * 組出整頁資料（export 給測試用）
 * @param {{ env: any, waitUntil?: Function }} context
 * @param {number} now
 */
export async function buildStatus(context, now) {
    const { env } = context;
    const [jobs, twitch, issues, announcements, feedbacks] = await Promise.allSettled([
        fetchJobs(env),
        fetchTwitch(context),
        fetchIssues(env, now),
        fetchAnnouncements(env, now),
        fetchFeedbacks(env, now),
    ]);
    const val = (r) => (r.status === 'fulfilled' ? r.value : null);

    const jobRows = val(jobs);
    const site = jobRows ? siteHealth(jobRows, now) : null;
    const youtube = jobRows ? youtubeHealth(jobRows.find((r) => r.job_name === 'schedule_live_og'), now) : null;
    const twitchSummary = val(twitch);

    return {
        success: true,
        checkedAt: new Date(now).toISOString(),
        overall: worstHealth([site?.status ?? 'unknown', youtube?.status ?? 'unknown', twitchSummary?.status ?? 'unknown']),
        site,
        youtube,
        twitch: twitchSummary,
        issues: val(issues),
        announcements: val(announcements),
        feedbacks: val(feedbacks),
    };
}

async function fetchJobs(env) {
    const names = Object.keys(JOB_THRESHOLDS).join(',');
    const res = await select(env, `cron_shard_state?select=job_name,last_run_at,last_run_stats&job_name=in.(${names})`);
    if (!res.ok || !Array.isArray(res.data)) {
        await logError(env, 'status', 'cron_shard_state fetch failed', { metadata: { status: res.status } });
        throw new Error('jobs_failed');
    }
    return res.data;
}

async function fetchIssues(env, now) {
    const res = await select(env, publicIssuesQuery(now));
    if (!res.ok || !Array.isArray(res.data)) {
        await logError(env, 'status', 'known_issues fetch failed', { metadata: { status: res.status } });
        throw new Error('issues_failed');
    }
    return res.data;
}

async function fetchAnnouncements(env, now) {
    const query = [
        'select=id,title,body,starts_at,ends_at',
        'type=eq.announcement',
        'target_segment=eq.all',
        // 只放已發布（含已過期）：封存＝站方撤回，不再公開
        'status=eq.published',
        `starts_at=lte.${encodeURIComponent(new Date(now).toISOString())}`,
        'order=starts_at.desc',
        `limit=${ANNOUNCEMENT_LIMIT}`,
    ].join('&');
    const res = await select(env, `announcements?${query}`);
    if (!res.ok || !Array.isArray(res.data)) {
        await logError(env, 'status', 'announcements fetch failed', { metadata: { status: res.status } });
        throw new Error('announcements_failed');
    }
    return res.data;
}

async function fetchFeedbacks(env, now) {
    const res = await select(env, publicFeedbackQuery(now));
    if (!res.ok || !Array.isArray(res.data)) {
        await logError(env, 'status', 'feedbacks fetch failed', { metadata: { status: res.status } });
        throw new Error('feedbacks_failed');
    }
    return toPublicFeedback(res.data);
}

/** Twitch 官方摘要（另外快取：成功 5 分鐘、失敗 1 分鐘，避免 Twitch 掛掉時每次都等滿逾時） */
async function fetchTwitch(context) {
    const cache = getCache();
    const key = new Request(TWITCH_CACHE_KEY);
    if (cache) {
        const hit = await cache.match(key).catch(() => null);
        if (hit) return hit.json();
    }

    let summary = null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TWITCH_TIMEOUT_MS);
    try {
        const res = await fetch(TWITCH_SUMMARY_URL, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
        if (res.ok) summary = summarizeTwitch(await res.json());
    } catch {
        summary = null;
    } finally {
        clearTimeout(timer);
    }

    if (cache) {
        const ttl = summary ? TWITCH_TTL_SECONDS : TWITCH_FAIL_TTL_SECONDS;
        context.waitUntil?.(
            cache.put(key, new Response(JSON.stringify(summary), { headers: { 'Cache-Control': `public, max-age=${ttl}` } }))
                .catch(() => {}),
        );
    }
    return summary;
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, OPTIONS' });
}
