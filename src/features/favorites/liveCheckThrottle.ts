// YouTube 收藏直播偵測的「每頻道節流」。
//
// 背景：/api/youtube-channel-live-og 每次呼叫都要抓約 1.6MB 的 YouTube 頁面再解析，單次 CPU 約 8–11ms，
// 貼著 Cloudflare 免費方案 10ms 上限（2026-09 單月 1.32M 次、佔全站流量 78%，觸發 CPU 超限）。
// 單次成本壓不下來，只能減少呼叫次數，所以：
//   - 離線頻道每 15 分鐘最多查一次（開播偵測最多延遲 15 分鐘，使用者已接受此取捨）
//   - 直播中頻道每 30 分鐘最多查一次（下播最多延遲約 30 分鐘）。2026-10-01 前是「直播中 1 小時內完全不查、
//     連手動重新整理也不查」，當時改成 10 分鐘；2026-10-04 使用者改為 1 小時（直播多半 1～1.5 小時，
//     10 分鐘查一次多半白查）；2026-10-08 使用者回報下播反映太慢，改為 30 分鐘。手動重新整理照樣可以立刻更新（force 只受 1 分鐘下限）
// 只針對 YouTube（live-og 端點成本高）；Twitch 走批次 API，每次觸發都查，不經過這裡
// 紀錄放 localStorage（分頁間共用、重新整理後保留），與收藏資料分開存：
// 收藏的 lastChecked 只在狀態改變時才寫，不能拿來判斷「上次查詢時間」，而每輪都寫收藏會觸發備份與雲端同步。
// 使用者手動按「重新整理」走 force：只受 1 分鐘下限（擋連點；端點本來就有 3 分鐘快取，再快也拿不到更新的結果）。
// 每輪打端點的次數另有上限（useLiveStatusCheck 的 MAX_ENDPOINT_CALLS_PER_ROUND），收藏很多時分幾輪輪流查完。

const STORAGE_KEY = 'ms_yt_live_checked_at';

export const FORCE_MIN_RECHECK_MS = 60 * 1000;
export const OFFLINE_RECHECK_MS = 15 * 60 * 1000;
// 與週表排程 OG_LIVE_RECHECK_MS（supabase/functions/_shared/sweep.ts）、共享表 LIVE_STATUS_FRESH_LIVE_MS 連動，改一處要同步
export const LIVE_RECHECK_MS = 30 * 60 * 1000;
// 查詢失敗（逾時、403、5xx）後多久內不重試。沒有這段退避，持續失敗的頻道因為「從沒成功查過」永遠排在最前面，
// 每輪都把打端點的額度用在同樣幾個頻道上，其他收藏永遠輪不到
export const FAIL_BACKOFF_MS = 5 * 60 * 1000;
// 超過一天的紀錄已不影響任何判斷，寫入時順手清掉，避免退訂的頻道永久殘留
const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

interface CheckRecord {
    t?: number; // 上次成功查詢的 epoch ms（只失敗過的頻道沒有）
    live?: boolean; // 當次查詢結果
    a?: number; // 上次查詢失敗的 epoch ms
}

export type CheckMap = Record<string, CheckRecord>;

function readMap(): CheckMap {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        // 個別紀錄壞掉（null、非物件）就丟掉，否則 prune 會丟錯、之後每一輪都中斷
        const map: CheckMap = {};
        for (const [id, r] of Object.entries(parsed as Record<string, unknown>)) {
            if (r && typeof r === 'object') map[id] = r as CheckRecord;
        }
        return map;
    } catch {
        return {};
    }
}

function writeMap(map: CheckMap): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        // 私密模式或配額已滿：節流失效只會多查幾次，不影響功能
    }
}

/** 此頻道現在是否該查（force 為使用者手動觸發，只受 1 分鐘下限）。map 可傳入整輪共用的快照，省去重複讀 localStorage */
export function shouldCheckChannel(channelId: string, now = Date.now(), force = false, map: CheckMap = readMap()): boolean {
    const record = map[channelId];
    if (!record) return true;
    // 最近失敗過、而且之後沒有成功：自動輪詢先退避，手動重新整理照樣可以重試
    if (!force && typeof record.a === 'number' && record.a > (record.t ?? 0)) {
        const sinceFail = now - record.a;
        if (sinceFail >= 0 && sinceFail < FAIL_BACKOFF_MS) return false;
    }
    if (typeof record.t !== 'number') return true;
    const elapsed = now - record.t;
    // 時鐘被往回調（elapsed < 0）時視為可查，避免永久卡住
    if (elapsed < 0) return true;
    if (force) return elapsed >= FORCE_MIN_RECHECK_MS;
    return elapsed >= (record.live ? LIVE_RECHECK_MS : OFFLINE_RECHECK_MS);
}

function prune(map: CheckMap, now: number): void {
    for (const id of Object.keys(map)) {
        const last = Math.max(map[id].t ?? 0, map[id].a ?? 0);
        if (now - last > PRUNE_AFTER_MS) delete map[id];
    }
}

/** 記錄一次成功的查詢結果 */
export function recordChannelCheck(channelId: string, live: boolean, now = Date.now()): void {
    const map = readMap();
    prune(map, now);
    map[channelId] = { t: now, live };
    writeMap(map);
}

/** 記錄一次失敗的查詢：保留上次成功的結果，只標記失敗時間（FAIL_BACKOFF_MS 內自動輪詢不重試、排序排到後面） */
export function recordChannelFailure(channelId: string, now = Date.now()): void {
    const map = readMap();
    prune(map, now);
    map[channelId] = { ...map[channelId], a: now };
    writeMap(map);
}

/** 整輪共用的紀錄快照（排序與節流判斷時不必每個頻道都重讀、重新解析 localStorage） */
export function readCheckMap(): CheckMap {
    return readMap();
}

/** 排序用的「上次處理時間」：成功或失敗取較新者，沒查過回 0；最久沒處理的先查 */
export function lastAttemptAt(channelId: string, map: CheckMap = readMap()): number {
    const r = map[channelId];
    return r ? Math.max(r.t ?? 0, r.a ?? 0) : 0;
}

export const LIVE_CHECK_STORAGE_KEY = STORAGE_KEY;
