// 公開狀態頁 /status 的燈號判斷（純函式，方便測試）
//
// 資料來源：
// - cron_shard_state.last_run_at / last_run_stats（週表排程，見 supabase/functions/_shared/run.ts saveShard）
//   注意：排程中途失敗時 last_run_at 一樣會更新，所以「最近有跑」不等於「跑成功」。
//   不看 last_run_stats.errors：裡面混了單一頻道的錯誤（例如被停權的頻道），而且 heavy 與 Twitch 週表共用同一份，
//   拿來判燈會讓本站週期性誤報黃燈。整輪失敗改看 runJob 寫的 failed／failed_streak。
//   **failed／failed_streak 要等三支排程 Edge Function（schedule-live／light／heavy）重新部署後才會寫入**；
//   之前的舊版排程沒有這兩個欄位＝視為沒失敗（只靠新鮮度判燈）。
// - Twitch 官方 Statuspage（status.twitch.com/api/v2/summary.json）
//
// 燈號：operational（正常）/ degraded（延遲或部分異常）/ down（異常）/ unknown（拿不到資料）
// 文案與門檻一致性由 tests/functions/statusPage.test.ts 鎖住（JOB_KEYS ↔ 五語 services.site.jobs.*、門檻數字 ↔ 文案）。

/** @typedef {'operational'|'degraded'|'down'|'unknown'} Health */

const MIN = 60 * 1000;

/**
 * 各排程的「多久沒跑算延遲／異常」門檻（毫秒）。
 * 間隔來源：supabase/migrations/20261004120000_schedule_cron_slower.sql
 *   live 每 20 分、light 每 10 分、heavy（含 Twitch 週表）每小時
 * 改排程頻率時要一起調整這裡。
 */
export const JOB_THRESHOLDS = {
    schedule_live_og: { degraded: 45 * MIN, down: 90 * MIN },
    schedule_light_rss: { degraded: 25 * MIN, down: 60 * MIN },
    schedule_heavy_rss: { degraded: 150 * MIN, down: 300 * MIN },
    schedule_twitch: { degraded: 150 * MIN, down: 300 * MIN },
};

/** 公開時用的短名稱（不外露內部 job_name）；前端 src/features/status/api.ts 的 JobHealth.key 與五語文案 key 要對應 */
export const JOB_KEYS = {
    schedule_live_og: 'live',
    schedule_light_rss: 'light',
    schedule_heavy_rss: 'heavy',
    schedule_twitch: 'twitchSchedule',
};

/** 連續幾輪整輪失敗就從「延遲」升為「異常」 */
export const FAILED_STREAK_DOWN = 3;

/** YouTube 直播偵測（/live 頁）失敗率門檻（文案「失敗超過 30% 會轉為延遲」要跟著改） */
export const OG_FAIL_RATIO = { degraded: 0.3, down: 0.6 };
/** 一輪檢查少於這個數量時不用失敗率判燈（樣本太小，3 個失敗就會在黃綠之間來回跳） */
export const OG_MIN_SAMPLE = 10;
/** 樣本雖小，但這麼多個以上全數失敗時仍判延遲（YouTube 改版讓解析全壞時，深夜樣本少也要看得到） */
export const OG_ALL_FAIL_MIN = 3;

const RANK = { operational: 0, unknown: 1, degraded: 2, down: 3 };

/**
 * 取最差的燈號。unknown 比 operational 差、比 degraded 好：拿不到資料不該被當成故障。
 * @param {Health[]} list
 * @returns {Health}
 */
export function worstHealth(list) {
    let worst = 'operational';
    for (const h of list) {
        if ((RANK[h] ?? 0) > RANK[worst]) worst = h;
    }
    return /** @type {Health} */ (worst);
}

/**
 * 總燈號。
 * - 本站自己的來源（排程、YouTube 偵測）拿不到資料時算 unknown：本站 DB 查不到正是使用者最該知道的時候，不能顯示正常
 * - 外部來源（Twitch Statuspage）拿不到時忽略：本站與 YouTube 都正常就仍顯示正常（Twitch 卡片自己會顯示「暫時無法取得」）
 * @param {Array<Health|null|undefined>} own
 * @param {Array<Health|null|undefined>} [external]
 * @returns {Health}
 */
export function overallHealth(own, external = []) {
    const list = [
        ...own.map((h) => h ?? 'unknown'),
        ...external.filter((h) => h && h !== 'unknown'),
    ];
    return list.length ? worstHealth(list) : 'unknown';
}

/**
 * 單一排程的燈號
 * @param {{ job_name: string, last_run_at: string|null, last_run_stats: any }|undefined} row
 * @param {number} now
 * @returns {{ key: string, status: Health, lastRunAt: string|null }}
 */
export function jobHealth(jobName, row, now) {
    const key = JOB_KEYS[jobName] ?? jobName;
    const th = JOB_THRESHOLDS[jobName];
    const lastRunAt = row?.last_run_at ?? null;
    const t = lastRunAt ? Date.parse(lastRunAt) : NaN;
    if (!th || !Number.isFinite(t)) return { key, status: 'unknown', lastRunAt };
    const age = now - t;
    let status = age > th.down ? 'down' : age > th.degraded ? 'degraded' : 'operational';
    // 整輪失敗：單次只升到延遲；連續 FAILED_STREAK_DOWN 輪以上判異常
    const stats = row.last_run_stats;
    if (stats?.failed === true) {
        const streak = Number(stats.failed_streak) || 1;
        status = worstHealth([status, streak >= FAILED_STREAK_DOWN ? 'down' : 'degraded']);
    }
    return { key, status: /** @type {Health} */ (status), lastRunAt };
}

/**
 * 本站排程整體燈號（只回公開安全的欄位：燈號與最後執行時間，不回 errors 內容）
 * @param {Array<{ job_name: string, last_run_at: string|null, last_run_stats: any }>} rows
 * @param {number} now
 */
export function siteHealth(rows, now) {
    const byName = new Map((rows || []).map((r) => [r.job_name, r]));
    const jobs = Object.keys(JOB_THRESHOLDS).map((name) => jobHealth(name, byName.get(name), now));
    return { status: worstHealth(jobs.map((j) => j.status)), jobs };
}

/**
 * YouTube 直播偵測燈號（本站偵測，不是 YouTube 官方狀態）
 * 取 schedule_live_og 最後一輪的 og_checked / og_failed；那一輪本身太舊時沿用排程的燈號。
 * @param {{ last_run_at: string|null, last_run_stats: any }|undefined} liveRow
 * @param {number} now
 */
export function youtubeHealth(liveRow, now) {
    const stats = liveRow?.last_run_stats ?? null;
    const checked = Number(stats?.og_checked) || 0;
    const failed = Number(stats?.og_failed) || 0;
    const quotaExceeded = stats?.quota_exceeded === true;
    const runFailed = stats?.failed === true;
    // 只看新鮮度；整輪失敗的嚴重度已反映在本站燈號
    const freshness = jobHealth('schedule_live_og', liveRow ? { ...liveRow, last_run_stats: null } : undefined, now).status;

    // 這一輪沒有要查的頻道（直播中頻道 30 分鐘內查過會跳過，見 OG_LIVE_RECHECK_MS）是正常狀況：沿用排程新鮮度
    let status = 'operational';
    if (checked >= OG_MIN_SAMPLE) {
        const ratio = failed / checked;
        if (ratio > OG_FAIL_RATIO.down) status = 'down';
        else if (ratio > OG_FAIL_RATIO.degraded) status = 'degraded';
    } else if (checked >= OG_ALL_FAIL_MIN && failed === checked) {
        status = 'degraded';
    }
    if (quotaExceeded && RANK[status] < RANK.degraded) status = 'degraded';
    // 這一輪整個失敗：og 數字不可信（可能是 0），YouTube 狀態無法判斷
    if (runFailed) status = 'unknown';
    // 偵測本身停擺或延遲時，最後一輪的失敗率再好看也不代表現在正常
    if (freshness === 'unknown') status = 'unknown';
    else status = worstHealth([status, freshness]);

    return {
        status: /** @type {Health} */ (status),
        checked,
        failed,
        quotaExceeded,
        runFailed,
        lastRunAt: liveRow?.last_run_at ?? null,
    };
}

const TWITCH_INDICATOR = { none: 'operational', minor: 'degraded', major: 'down', critical: 'down' };
const TWITCH_COMPONENT = {
    operational: 'operational',
    degraded_performance: 'degraded',
    partial_outage: 'degraded',
    under_maintenance: 'degraded',
    major_outage: 'down',
};

/**
 * 把 Twitch Statuspage summary.json 縮成公開需要的欄位。
 * 格式不對（沒有可辨識的 indicator、也沒有元件）時回 null：交給呼叫端以「失敗」短快取，
 * 不能判成正常（Statuspage 改版或回維護用 JSON 時，否則會顯示 Twitch 正常並快取 5 分鐘）。
 * @param {any} summary
 */
export function summarizeTwitch(summary) {
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;
    const components = Array.isArray(summary.components)
        ? summary.components
            // Statuspage 的群組元件（group=true）只是容器
            .filter((c) => c && typeof c.name === 'string' && !c.group)
            .slice(0, 12)
            .map((c) => ({ name: c.name.slice(0, 60), status: TWITCH_COMPONENT[c.status] ?? 'unknown' }))
        : [];
    const incidents = Array.isArray(summary.incidents)
        ? summary.incidents
            .filter((i) => i && typeof i.name === 'string')
            .slice(0, 5)
            .map((i) => ({
                name: i.name.slice(0, 200),
                status: typeof i.status === 'string' ? i.status : 'investigating',
                url: typeof i.shortlink === 'string' && i.shortlink.startsWith('https://') ? i.shortlink : null,
                updatedAt: typeof i.updated_at === 'string' ? i.updated_at : null,
            }))
        : [];
    const fromIndicator = TWITCH_INDICATOR[summary.status?.indicator];
    if (!fromIndicator && components.length === 0) return null;
    const status = fromIndicator ?? worstHealth(components.map((c) => c.status));
    return {
        status: /** @type {Health} */ (status),
        components,
        incidents,
        updatedAt: typeof summary.page?.updated_at === 'string' ? summary.page.updated_at : null,
    };
}
