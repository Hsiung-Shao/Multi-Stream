// YouTube 收藏直播偵測的「每頻道節流」。
//
// 背景：/api/youtube-channel-live-og 每次呼叫都要抓約 1.6MB 的 YouTube 頁面再解析，單次 CPU 約 8–11ms，
// 貼著 Cloudflare 免費方案 10ms 上限（2026-09 單月 1.32M 次、佔全站流量 78%，觸發 CPU 超限）。
// 單次成本壓不下來，只能減少呼叫次數，所以：
//   - 離線頻道每 15 分鐘最多查一次（開播偵測最多延遲 15 分鐘，使用者已接受此取捨）
//   - 直播中頻道每 10 分鐘最多查一次（下播最多延遲約 10～15 分鐘）。2026-10-01 前是「直播中 1 小時內完全不查、
//     連手動重新整理也不查」，下播後收藏可能還掛著直播中將近 1 小時，使用者要求修正
// 紀錄放 localStorage（分頁間共用、重新整理後保留），與收藏資料分開存：
// 收藏的 lastChecked 只在狀態改變時才寫，不能拿來判斷「上次查詢時間」，而每輪都寫收藏會觸發備份與雲端同步。
// 使用者手動按「重新整理」走 force：只受 1 分鐘下限（擋連點；端點與共享表本來就有 3 分鐘快取，再快也拿不到更新的結果）。

const STORAGE_KEY = 'ms_yt_live_checked_at';

export const FORCE_MIN_RECHECK_MS = 60 * 1000;
export const OFFLINE_RECHECK_MS = 15 * 60 * 1000;
export const LIVE_RECHECK_MS = 10 * 60 * 1000;
// 超過一天的紀錄已不影響任何判斷，寫入時順手清掉，避免退訂的頻道永久殘留
const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

interface CheckRecord {
    t: number; // 上次查詢的 epoch ms
    live: boolean; // 當次查詢結果
}

type CheckMap = Record<string, CheckRecord>;

function readMap(): CheckMap {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? (parsed as CheckMap) : {};
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

/** 此頻道現在是否該查（force 為使用者手動觸發，只受 1 分鐘下限） */
export function shouldCheckChannel(channelId: string, now = Date.now(), force = false): boolean {
    const record = readMap()[channelId];
    if (!record || typeof record.t !== 'number') return true;
    const elapsed = now - record.t;
    // 時鐘被往回調（elapsed < 0）時視為可查，避免永久卡住
    if (elapsed < 0) return true;
    if (force) return elapsed >= FORCE_MIN_RECHECK_MS;
    return elapsed >= (record.live ? LIVE_RECHECK_MS : OFFLINE_RECHECK_MS);
}

/** 記錄一次成功的查詢結果（失敗不記，下一輪會重試） */
export function recordChannelCheck(channelId: string, live: boolean, now = Date.now()): void {
    const map = readMap();
    for (const id of Object.keys(map)) {
        if (now - map[id].t > PRUNE_AFTER_MS) delete map[id];
    }
    map[channelId] = { t: now, live };
    writeMap(map);
}

export const LIVE_CHECK_STORAGE_KEY = STORAGE_KEY;
