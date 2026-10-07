import { useState, useCallback } from 'react';
import { favoritesService } from './FavoritesService';
import { twitchService } from '../twitch/TwitchService';
import { youtubeApi } from '../../utils/youtubeApi';
import { cacheChannelIfAbsent } from '../youtube/YouTubeChannelRepository';
import { FavoriteStream } from './types';
import { shouldCheckChannel, recordChannelCheck, recordChannelFailure, readCheckMap, lastAttemptAt } from './liveCheckThrottle';
import { fetchLiveStatuses, isLiveStatusFresh, toLiveStatusResult, autoFreshMaxAge, LIVE_STATUS_FRESH_FORCE_MS, type LiveStatusRow } from './liveStatusRepository';

/**
 * 每輪（每個分頁）最多打幾次 live-og 端點；共享表讀到的不算。這裡的節流、冷卻、上限都只針對 YouTube——
 * live-og 每次要抓整頁 YouTube 再解析，Workers CPU 成本高；Twitch 走 Helix 批次 API（100 個一次），每次觸發都查。
 * 2026-10-04 正式站：收藏上百個 YouTube 頻道的使用者每 2 秒打一次、整輪打完上百次，佔全站一半流量並造成 CPU 超限。
 * 超過的頻道不記錄、留到下一輪，候選依「最久沒查的先查」排序，幾輪內輪流涵蓋全部收藏。
 */
export const MAX_ENDPOINT_CALLS_PER_ROUND = 10;
/**
 * 手動重新整理（force）那一輪的上限。2026-10-08 使用者回報「按重新整理沒反應」：收藏多時 10 個額度輪不到正在看的頻道，
 * 其餘沿用共享表較舊的資料。手動有 3 分鐘冷卻，每位使用者最多每 3 分鐘 20 次，量級遠小於自動輪詢。
 */
export const MAX_ENDPOINT_CALLS_FORCE = 20;

// 整個分頁同一時間只跑一輪 YouTube（背景輪詢、收藏選單、收藏管理各自用這個 hook，實例層級的 isRefreshing 擋不住彼此）。
// 併發時：自動輪詢直接略過；手動重新整理等目前這輪跑完再跑，讓使用者按的那一下一定有作用
let inflight: Promise<YouTubeRoundStats | null> | null = null;
// Twitch 每次觸發都查，只把「同時」的觸發併成一次請求
let twitchInflight: Promise<TwitchStats> | null = null;

/**
 * YouTube 的手動重新整理（force）3 分鐘內只能用一次，跨分頁共用（使用者 2026-10-04 指定）。
 * 冷卻期間按下去會當成一般輪詢：仍受每頻道節流與每輪上限，不會為了連點多打端點。
 * 3 分鐘也是 live-og 端點 edge 快取的 TTL，再快也拿不到更新的結果。
 */
export const FORCE_COOLDOWN_MS = 3 * 60 * 1000;
const FORCE_STORAGE_KEY = 'ms_yt_live_force_at';

/** 手動重新整理還要等多久才能再用（0＝現在可以）；讀不到 localStorage 時放行（每頻道 1 分鐘下限與每輪上限仍在） */
export function forceCooldownRemaining(now = Date.now()): number {
    try {
        const last = Number(localStorage.getItem(FORCE_STORAGE_KEY));
        if (!Number.isFinite(last) || last <= 0) return 0;
        const elapsed = now - last;
        if (elapsed < 0) return 0; // 時鐘被往回調：不卡住使用者
        return Math.max(0, FORCE_COOLDOWN_MS - elapsed);
    } catch {
        return 0;
    }
}

function markForce(now = Date.now()): void {
    try {
        localStorage.setItem(FORCE_STORAGE_KEY, String(now));
    } catch {
        // 寫不進去：下次照樣放行
    }
}

// 端點之間的間隔。抽成可替換的函式：測試若把全域 setTimeout 換成立即執行，連整輪逾時也會立刻觸發
let sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
/** 僅供測試：替換端點間隔的等待（傳 undefined 還原） */
export function __setLiveCheckSleepForTests(fn?: (ms: number) => Promise<void>): void {
    sleep = fn ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
}

// 一輪的時間上限：任何一個環節卡住（例如 Twitch 設定讀取沒有逾時）都不能讓 inflight 永遠不清，擋住整個分頁
const ROUND_TIMEOUT_MS = 2 * 60 * 1000;

export interface CheckNowOptions {
    /** 使用者手動觸發：YouTube 略過每頻道節流（3 分鐘內只生效一次，見 FORCE_COOLDOWN_MS）；Twitch 本來就每次都查 */
    force?: boolean;
}

export interface CheckNowResult {
    /** 這次手動重新整理有沒有真的對 YouTube 生效（冷卻中或被併入進行中的一輪時為 false） */
    forced: boolean;
    /** 冷卻中時，還要等多少毫秒才能再手動重新整理 YouTube */
    cooldownRemainingMs: number;
    /** 這次直播狀態有改變的收藏數（Twitch＋YouTube） */
    changed: number;
    /** 這輪 YouTube 額度用完、留到下一輪才查的頻道數 */
    deferred: number;
}

interface TwitchStats { changed: number }
interface YouTubeRoundStats { changed: number; deferred: number }

type FavoritePatch = Partial<FavoriteStream>;

/**
 * 把這次查到的變更套到「當下最新」的收藏清單再存。Twitch 與 YouTube 分開跑、YouTube 一輪可能要一兩分鐘，
 * 若各自拿開始時的清單整份覆寫，會蓋掉對方（或使用者這段期間的編輯）。
 */
function applyFavoritePatches(patches: Map<string, FavoritePatch>): void {
    if (patches.size === 0) return;
    let touched = false;
    const next = favoritesService.getFavorites().map(fav => {
        const patch = patches.get(fav.id);
        if (!patch) return fav;
        touched = true;
        return { ...fav, ...patch };
    });
    if (touched) favoritesService.saveFavorites(next);
}

export const useLiveStatusCheck = () => {
    const [isRefreshing, setIsRefreshing] = useState(false);

    const checkNow = useCallback(async (options?: CheckNowOptions): Promise<CheckNowResult> => {
        const wantForce = options?.force === true;
        // Twitch 不受 YouTube 的節流、冷卻與進行中的輪次影響：每次觸發都立刻查、查完立刻存
        const twitch = twitchInflight ?? (twitchInflight = runTwitchCheck().finally(() => { twitchInflight = null; }));

        const pending = inflight;
        // 自動輪詢遇到進行中的 YouTube 輪次：YouTube 略過，Twitch 照查
        if (pending && !wantForce) {
            const tw = await twitch;
            return { forced: false, cooldownRemainingMs: 0, changed: tw.changed, deferred: 0 };
        }
        // 手動重新整理：等待前一輪的期間就讓按鈕轉圈，使用者才知道有在處理
        setIsRefreshing(true);
        try {
            let yt: YouTubeRoundStats | null = null;
            let forced = false;
            let cooldownRemainingMs = 0;
            if (pending) await pending.catch(() => {});
            // 等待期間別的觸發搶先開始：這次的 YouTube 併入那一輪
            if (!(pending && inflight)) {
                // 冷卻判斷放在確定要開跑之後，被併掉的那次不會白白用掉額度
                cooldownRemainingMs = wantForce ? forceCooldownRemaining() : 0;
                forced = wantForce && cooldownRemainingMs === 0;
                if (forced) markForce();
                const round = Promise.race([
                    runYouTubeRound(forced),
                    new Promise<null>(resolve => setTimeout(() => resolve(null), ROUND_TIMEOUT_MS)),
                ]);
                inflight = round;
                try {
                    yt = await round;
                } finally {
                    if (inflight === round) inflight = null;
                }
            }
            const tw = await twitch;
            return { forced, cooldownRemainingMs, changed: tw.changed + (yt?.changed ?? 0), deferred: yt?.deferred ?? 0 };
        } finally {
            setIsRefreshing(false);
        }
    }, []);

    return {
        isRefreshing,
        checkNow
    };
};

async function runTwitchCheck(): Promise<TwitchStats> {
    try {
        const twitchFavorites = favoritesService.getFavorites().filter(f => f.platform === 'twitch' && f.channelId);
        if (twitchFavorites.length === 0) return { changed: 0 };
        const liveStatuses = await twitchService.checkMultipleChannelsLiveStatus(twitchFavorites.map(f => f.channelId!));
        const patches = new Map<string, FavoritePatch>();
        let changed = 0;
        for (const fav of twitchFavorites) {
            // 結果 key 為小寫 login;舊收藏的 channelId 可能含大寫(如 twitch.tv/Shroud)。查詢失敗的批次沒有結果，保留原狀態
            const status = liveStatuses[fav.channelId!.toLowerCase()];
            if (!status) continue;
            if (fav.isLive !== status.isLive ||
                fav.viewerCount !== status.viewerCount ||
                fav.gameName !== status.gameName) {
                // 摘要只算直播狀態真的改變的（觀看人數變動不算）
                if (!!fav.isLive !== !!status.isLive) changed++;
                patches.set(fav.id, {
                    isLive: status.isLive || false,
                    lastChecked: new Date().toISOString(),
                    viewerCount: status.viewerCount,
                    gameName: status.gameName
                });
            }
        }
        applyFavoritePatches(patches);
        return { changed };
    } catch (e) {
        console.error('[LiveCheck] Twitch check failed', e);
        return { changed: 0 };
    }
}

async function runYouTubeRound(force: boolean): Promise<YouTubeRoundStats> {
    const stats: YouTubeRoundStats = { changed: 0, deferred: 0 };
    try {
        const youtubeFavorites = favoritesService.getFavorites().filter(f => f.platform === 'youtube' && f.channelId);
        if (youtubeFavorites.length === 0) return stats;

        // 先決定這一輪要處理哪些頻道（節流紀錄整輪只讀一次快照）
        const checkMap = readCheckMap();
        const candidates = youtubeFavorites
            // 每頻道節流：離線 15 分鐘、直播中 30 分鐘內查過、或 5 分鐘內失敗過就跳過（跨分頁、跨重新整理共用）；
            // 手動重新整理（force）只受 1 分鐘下限
            .filter(fav => shouldCheckChannel(fav.channelId as string, Date.now(), force, checkMap))
            // 最久沒處理（或從沒查過）的先查：每輪有上限時，幾輪內輪流涵蓋全部收藏。
            // 手動重新整理時，畫面上顯示直播中的排最前面：使用者按重新整理多半是想確認誰下播了
            .sort((a, b) => {
                if (force && !!a.isLive !== !!b.isLive) return a.isLive ? -1 : 1;
                return lastAttemptAt(a.channelId as string, checkMap) - lastAttemptAt(b.channelId as string, checkMap);
            });

        // 共享表：週表排程或別的使用者查過、夠新的頻道直接用資料庫的結果，不打端點（整輪只讀一次）。
        // 自動輪詢接受 22 分鐘內的資料（直播中的列 32 分鐘，配合排程重查直播中頻道的間隔）；手動重新整理只接受 3 分鐘內的（使用者要的是最新狀態）
        const shared = candidates.length > 0
            ? await fetchLiveStatuses(candidates.map(fav => fav.channelId as string))
            : new Map<string, LiveStatusRow>();

        const maxCalls = force ? MAX_ENDPOINT_CALLS_FORCE : MAX_ENDPOINT_CALLS_PER_ROUND;
        const patches = new Map<string, FavoritePatch>();
        let endpointCalls = 0;
        for (const fav of candidates) {
            const channelId = fav.channelId as string;
            const sharedRow = shared.get(channelId);
            const overBudget = endpointCalls >= maxCalls;
            // 手動重新整理只接受 3 分鐘內的共享資料；但額度用完時，自動輪詢門檻內的也比完全不更新好
            const fromShared = !!sharedRow && (force && !overBudget
                ? isLiveStatusFresh(sharedRow, Date.now(), LIVE_STATUS_FRESH_FORCE_MS)
                : isLiveStatusFresh(sharedRow, Date.now(), autoFreshMaxAge(sharedRow)));

            if (!fromShared) {
                // 這輪打端點的額度用完：不記錄，留到下一輪（排序會讓它排在前面）
                if (overBudget) {
                    stats.deferred++;
                    continue;
                }
                // 別的分頁可能在這輪進行中剛查過這個頻道：打之前看一次最新紀錄（先看再等，避免白等 2 秒）
                if (!shouldCheckChannel(channelId, Date.now(), force)) continue;
                // Rate limiting: 打端點之間間隔 2 秒；讀共享表的結果不需要
                if (endpointCalls > 0) {
                    await sleep(2000);
                }
                endpointCalls++;
            }

            try {
                const status = fromShared && sharedRow
                    ? toLiveStatusResult(sharedRow)
                    : await youtubeApi.checkChannelLiveStatus(channelId);
                // 用共享表的結果時，記它實際被查的時間（不是現在），否則舊結果會被當成剛查過、延後下一次檢查
                const sharedAt = fromShared && sharedRow ? Date.parse(sharedRow.checked_at) : NaN;
                recordChannelCheck(channelId, !!status.isLive, Number.isFinite(sharedAt) ? Math.min(sharedAt, Date.now()) : Date.now());

                // 順手蒐集到離線頻道資料庫:寫官方頻道名、查 DB 去重、不更動使用者收藏資料。
                // fire-and-forget,失敗不影響直播狀態檢查。只在真的打了端點時做——
                // 讀共享表時每輪都做會讓每個頻道多一次 Supabase 查詢。
                if (!fromShared && status.channelTitle) {
                    cacheChannelIfAbsent(channelId, status.channelTitle).catch(() => {});
                }

                // liveUrl 也要比：同一頻道換了一場直播（新 videoId）時要更新連結
                const newLiveUrl = status.finalUrl || null;
                const newLiveVideoId = status.liveVideoId || null;
                const newIsLive = status.isLive || false;
                if (fav.isLive !== newIsLive ||
                    fav.liveUrl !== newLiveUrl ||
                    fav.liveVideoId !== newLiveVideoId) {
                    if (!!fav.isLive !== newIsLive) stats.changed++;
                    patches.set(fav.id, {
                        isLive: newIsLive,
                        lastChecked: new Date().toISOString(),
                        liveUrl: newLiveUrl,
                        liveVideoId: newLiveVideoId
                    });
                }
            } catch (e) {
                // 記下失敗時間：5 分鐘內不重試、排序排到後面，避免持續失敗的頻道每輪佔住額度
                recordChannelFailure(channelId);
                console.warn(`[LiveCheck] YouTube check failed for ${channelId}`, e);
            }
        }

        applyFavoritePatches(patches);
    } catch (e) {
        console.error('[LiveCheck] YouTube check failed', e);
    }
    return stats;
}
