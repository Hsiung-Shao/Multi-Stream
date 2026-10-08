// GET /api/status — 公開狀態頁 /status 的整頁資料（一次請求拿齊五區）
//
// 回應：{ success: true, checkedAt, overall, site, youtube, twitch, issues, feedbacks, announcements }
//   site / youtube：本站自檢（cron_shard_state，service_role 讀；只撈判燈需要的幾個欄位，不回 errors 字串）
//   twitch：Twitch 官方 Statuspage 摘要（代抓，瀏覽器不直連第三方）
//   issues：known_issues 公開中的條目（未解決，或 14 天內解決）
//   feedbacks：使用者回報（只限送出時已告知會公開、站方標為已讀以上、近 30 天；只回內容／狀態／日期，聯絡資訊已遮蔽）
//   announcements：一般公告（type=announcement、target=all、status=published）含已過期的歷史公告；封存的不公開
// 任一來源失敗就回 null，其他區塊照常回（前端顯示「暫時無法取得」）；總燈號只忽略外部 Twitch 拿不到的情況，
// 本站自己的資料拿不到時總燈號是 unknown。
//
// 快取（這支任何人都能打，必須擋住放大到 DB 的流量）：
//   1. edge Cache API 60 秒（只在自訂網域生效）
//   2. 同一個 isolate 內的記憶體快取 60 秒＋同時進來的請求共用同一次查詢：*.pages.dev 別名上 Cache API 無效，
//      快取失效瞬間的並發請求也不會各自打 5 支查詢
//   Twitch 摘要另外快取：成功 5 分鐘、失敗 2 分鐘（避免 Twitch 掛掉時每次重建都等滿逾時）
// 失敗時寫 system_logs 一律走 waitUntil，不擋主流程。

import { jsonResponse, handleOptions, getCorsHeaders } from '../lib/cors.js';
import { select } from '../lib/supabase-server.js';
import { logError } from '../lib/logger.js';
import { siteHealth, youtubeHealth, summarizeTwitch, overallHealth, JOB_THRESHOLDS } from '../lib/status-health.js';
import { publicIssuesQuery } from '../lib/known-issues.js';
import { publicFeedbackQuery, toPublicFeedback } from '../lib/feedback-public.js';

const PAGE_TTL_SECONDS = 60;
const TWITCH_TTL_SECONDS = 300;
const TWITCH_FAIL_TTL_SECONDS = 120;
const TWITCH_TIMEOUT_MS = 4000;
const TWITCH_SUMMARY_URL = 'https://status.twitch.com/api/v2/summary.json';
const ANNOUNCEMENT_LIMIT = 10;

const PAGE_CACHE_KEY = 'https://status.invalid/page/v1';
const TWITCH_CACHE_KEY = 'https://status.invalid/twitch/v1';

// 同一個 isolate 內的記憶體快取與進行中的請求（見檔頭第 2 點）
let pageMemo = null; // { at: number, text: string }
let pageInflight = null; // { at: number, promise: Promise<string> }
let twitchMemo = null; // { at: number, ttlMs: number, value: object|null }

/** DB 查詢逾時：卡住的查詢不能拖住整個 isolate 的請求 */
const DB_TIMEOUT_MS = 5000;
/** 進行中的共用查詢超過這麼久就視為失效、重新建立（發起的請求被取消時 promise 可能永遠不會 settle） */
const INFLIGHT_STALE_MS = 15000;

/** 測試用：清掉記憶體快取（每個測試要從乾淨狀態開始） */
export function resetStatusMemo() {
    pageMemo = null;
    pageInflight = null;
    twitchMemo = null;
}

/** 每次查詢一個新的逾時訊號（AbortSignal.timeout 不能重複用） */
function dbOpts() {
    return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(DB_TIMEOUT_MS) } : {};
}

function getCache() {
    return typeof caches !== 'undefined' ? caches.default : null;
}

// 瀏覽器不另外快取（伺服器端已快取 60 秒；兩層疊加會讓頁面最多慢 2 分鐘以上）
const CLIENT_HEADERS = { 'Cache-Control': 'no-cache' };

function reply(request, text, source) {
    return new Response(text, {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(request), ...CLIENT_HEADERS, 'X-Edge-Cache': source },
    });
}

export async function onRequestGet(context) {
    const { request } = context;
    const cache = getCache();
    const key = new Request(PAGE_CACHE_KEY);

    if (cache) {
        const hit = await cache.match(key).catch(() => null);
        // 命中時直接轉送快取的 body，不重新 parse / stringify（最常走的路徑，省 Workers CPU）
        if (hit) return reply(request, hit.body, 'HIT');
    }

    const now = Date.now();
    if (pageMemo && now - pageMemo.at < PAGE_TTL_SECONDS * 1000) return reply(request, pageMemo.text, 'MEMO');

    let source = 'MISS';
    if (pageInflight && now - pageInflight.at < INFLIGHT_STALE_MS) {
        source = 'SHARED';
    } else {
        const entry = { at: now, promise: null };
        entry.promise = buildStatus(context, now)
            .then((body) => {
                const text = JSON.stringify(body);
                pageMemo = { at: now, text };
                if (cache) {
                    context.waitUntil?.(
                        cache.put(key, new Response(text, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${PAGE_TTL_SECONDS}` } }))
                            .catch(() => {}),
                    );
                }
                return text;
            })
            .finally(() => { if (pageInflight === entry) pageInflight = null; });
        pageInflight = entry;
        // 讓發起的請求撐到查詢完成：它的用戶端中途斷線時，共用這份結果的其他請求才不會等到一個被取消的 promise
        context.waitUntil?.(entry.promise.catch(() => {}));
    }
    const text = await pageInflight.promise;
    return reply(request, text, cache ? source : `${source}-NOCACHE`);
}

/**
 * 組出整頁資料（export 給測試用）
 * @param {{ env: any, waitUntil?: Function }} context
 * @param {number} now
 */
export async function buildStatus(context, now) {
    const { env } = context;
    const report = (message, res) => {
        const p = logError(env, 'status', message, { metadata: { status: res.status } });
        if (context.waitUntil) context.waitUntil(p); else p.catch(() => {});
    };
    const [jobs, twitch, issues, announcements, feedbacks] = await Promise.allSettled([
        fetchJobs(env, report),
        fetchTwitch(context),
        fetchIssues(env, now, report),
        fetchAnnouncements(env, now, report),
        fetchFeedbacks(env, now, report),
    ]);
    const val = (r) => (r.status === 'fulfilled' ? r.value : null);

    const jobRows = val(jobs);
    const site = jobRows ? siteHealth(jobRows, now) : null;
    const youtube = jobRows ? youtubeHealth(jobRows.find((r) => r.job_name === 'schedule_live_og'), now) : null;
    const twitchSummary = val(twitch);

    return {
        success: true,
        checkedAt: new Date(now).toISOString(),
        overall: overallHealth([site?.status, youtube?.status], [twitchSummary?.status]),
        site,
        youtube,
        twitch: twitchSummary,
        issues: val(issues),
        announcements: val(announcements),
        feedbacks: val(feedbacks),
    };
}

/** 只撈判燈需要的欄位：last_run_stats 整份很大（errors、og_fail_reasons…），用 PostgREST 的 -> 取子欄位 */
const JOB_STAT_FIELDS = ['failed', 'failed_streak', 'og_checked', 'og_failed', 'quota_exceeded'];

async function fetchJobs(env, report) {
    const names = Object.keys(JOB_THRESHOLDS).join(',');
    const cols = ['job_name', 'last_run_at', ...JOB_STAT_FIELDS.map((f) => `${f}:last_run_stats->${f}`)].join(',');
    const res = await select(env, `cron_shard_state?select=${cols}&job_name=in.(${names})`, dbOpts());
    if (!res.ok || !Array.isArray(res.data)) {
        report('cron_shard_state fetch failed', res);
        throw new Error('jobs_failed');
    }
    return res.data.map((r) => ({
        job_name: r.job_name,
        last_run_at: r.last_run_at,
        last_run_stats: Object.fromEntries(JOB_STAT_FIELDS.map((f) => [f, r[f] ?? null])),
    }));
}

async function fetchIssues(env, now, report) {
    const res = await select(env, publicIssuesQuery(now), dbOpts());
    if (!res.ok || !Array.isArray(res.data)) {
        report('known_issues fetch failed', res);
        throw new Error('issues_failed');
    }
    return res.data;
}

async function fetchAnnouncements(env, now, report) {
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
    const res = await select(env, `announcements?${query}`, dbOpts());
    if (!res.ok || !Array.isArray(res.data)) {
        report('announcements fetch failed', res);
        throw new Error('announcements_failed');
    }
    return res.data;
}

async function fetchFeedbacks(env, now, report) {
    const res = await select(env, publicFeedbackQuery(now), dbOpts());
    if (!res.ok || !Array.isArray(res.data)) {
        report('feedbacks fetch failed', res);
        throw new Error('feedbacks_failed');
    }
    return toPublicFeedback(res.data);
}

/** Twitch 官方摘要（edge 快取＋isolate 記憶體快取：成功 5 分鐘、失敗 2 分鐘） */
async function fetchTwitch(context) {
    const now = Date.now();
    if (twitchMemo && now - twitchMemo.at < twitchMemo.ttlMs) return twitchMemo.value;

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

    const ttl = summary ? TWITCH_TTL_SECONDS : TWITCH_FAIL_TTL_SECONDS;
    twitchMemo = { at: now, ttlMs: ttl * 1000, value: summary };
    if (cache) {
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
