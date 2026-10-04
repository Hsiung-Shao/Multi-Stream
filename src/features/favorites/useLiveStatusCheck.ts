import { useState, useCallback } from 'react';
import { favoritesService } from './FavoritesService';
import { twitchService } from '../twitch/TwitchService';
import { youtubeApi } from '../../utils/youtubeApi';
import { cacheChannelIfAbsent } from '../youtube/YouTubeChannelRepository';
import { FavoriteStream } from './types';
import { shouldCheckChannel, recordChannelCheck, recordChannelFailure, readCheckMap, lastAttemptAt } from './liveCheckThrottle';
import { fetchLiveStatuses, isLiveStatusFresh, toLiveStatusResult, autoFreshMaxAge, LIVE_STATUS_FRESH_FORCE_MS, type LiveStatusRow } from './liveStatusRepository';

/**
 * 每輪（每個分頁）最多打幾次 live-og 端點；共享表讀到的不算。
 * 2026-10-04 正式站：收藏上百個 YouTube 頻道的使用者每 2 秒打一次、整輪打完上百次，佔全站一半流量並造成 CPU 超限。
 * 超過的頻道不記錄、留到下一輪，候選依「最久沒查的先查」排序，幾輪內輪流涵蓋全部收藏。
 */
export const MAX_ENDPOINT_CALLS_PER_ROUND = 10;

// 整個分頁同一時間只跑一輪（背景輪詢、收藏選單、收藏管理各自用這個 hook，實例層級的 isRefreshing 擋不住彼此）。
// 併發時：自動輪詢直接略過；手動重新整理等目前這輪跑完再跑，讓使用者按的那一下一定有作用
let inflight: Promise<void> | null = null;

/**
 * 手動重新整理（force）3 分鐘內只能用一次，跨分頁共用（使用者 2026-10-04 指定）。
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
    /** 使用者手動觸發：略過每頻道節流（3 分鐘內只生效一次，見 FORCE_COOLDOWN_MS） */
    force?: boolean;
}

export interface CheckNowResult {
    /** 這次手動重新整理有沒有真的生效（冷卻中或被併入進行中的一輪時為 false） */
    forced: boolean;
    /** 冷卻中時，還要等多少毫秒才能再手動重新整理 */
    cooldownRemainingMs: number;
}

export const useLiveStatusCheck = () => {
    const [isRefreshing, setIsRefreshing] = useState(false);

    const checkNow = useCallback(async (options?: CheckNowOptions): Promise<CheckNowResult> => {
        const wantForce = options?.force === true;
        const pending = inflight;
        // 自動輪詢遇到進行中的一輪：直接略過
        if (pending && !wantForce) return { forced: false, cooldownRemainingMs: 0 };
        // 手動重新整理：等待前一輪的期間就讓按鈕轉圈，使用者才知道有在處理
        setIsRefreshing(true);
        try {
            if (pending) {
                await pending.catch(() => {});
                if (inflight) return { forced: false, cooldownRemainingMs: 0 }; // 等待期間別的觸發搶先開始
            }
            // 冷卻判斷放在確定要開跑之後，被併掉的那次不會白白用掉額度
            const cooldownRemainingMs = wantForce ? forceCooldownRemaining() : 0;
            const force = wantForce && cooldownRemainingMs === 0;
            if (force) markForce();
            const round = Promise.race([
                runRound(force),
                new Promise<void>(resolve => setTimeout(resolve, ROUND_TIMEOUT_MS)),
            ]);
            inflight = round;
            try {
                await round;
            } finally {
                if (inflight === round) inflight = null;
            }
            return { forced: force, cooldownRemainingMs };
        } finally {
            setIsRefreshing(false);
        }
    }, []);

    return {
        isRefreshing,
        checkNow
    };
};

async function runRound(force: boolean): Promise<void> {
        try {
            const favoritesList = favoritesService.getFavorites();
            const twitchFavorites = favoritesList.filter(f => f.platform === 'twitch' && f.channelId);
            const youtubeFavorites = favoritesList.filter(f => f.platform === 'youtube' && f.channelId);

            let updatedFavorites = [...favoritesList];
            let hasUpdates = false;

            // 1. Check Twitch Status
            if (twitchFavorites.length > 0) {
                try {
                    const channelIds = twitchFavorites.map(f => f.channelId!);
                    const liveStatuses = await twitchService.checkMultipleChannelsLiveStatus(channelIds);

                    updatedFavorites = updatedFavorites.map(fav => {
                        // 結果 key 為小寫 login;舊收藏的 channelId 可能含大寫(如 twitch.tv/Shroud)
                        const status = fav.platform === 'twitch' && fav.channelId
                            ? liveStatuses[fav.channelId.toLowerCase()]
                            : undefined;
                        if (status) {

                            // Check if status actually changed to avoid unnecessary updates
                            if (fav.isLive !== status.isLive ||
                                fav.viewerCount !== status.viewerCount ||
                                fav.gameName !== status.gameName) {
                                hasUpdates = true;
                                return {
                                    ...fav,
                                    isLive: status.isLive || false,
                                    lastChecked: new Date().toISOString(),
                                    viewerCount: status.viewerCount,
                                    gameName: status.gameName
                                } as FavoriteStream;
                            }
                        }
                        return fav;
                    });
                } catch (e) {
                    console.error('[LiveCheck] Twitch check failed', e);
                }
            }

            // 2. Check YouTube Status
            if (youtubeFavorites.length > 0) {
                // 先決定這一輪要處理哪些頻道（節流紀錄整輪只讀一次快照）
                const checkMap = readCheckMap();
                const candidates = youtubeFavorites
                    .filter(fav => {
                        if (!fav.channelId) return false;
                        // 每頻道節流：離線 15 分鐘、直播中 60 分鐘內查過、或 5 分鐘內失敗過就跳過（跨分頁、跨重新整理共用）；
                        // 手動重新整理（force）只受 1 分鐘下限
                        return shouldCheckChannel(fav.channelId, Date.now(), force, checkMap);
                    })
                    // 最久沒處理（或從沒查過）的先查：每輪有上限時，幾輪內輪流涵蓋全部收藏
                    .sort((a, b) => lastAttemptAt(a.channelId as string, checkMap) - lastAttemptAt(b.channelId as string, checkMap));

                // 共享表：週表排程或別的使用者查過、夠新的頻道直接用資料庫的結果，不打端點（整輪只讀一次）。
                // 自動輪詢接受 22 分鐘內的資料（直播中的列 62 分鐘，配合排程每小時重查直播中頻道）；手動重新整理只接受 3 分鐘內的（使用者要的是最新狀態）
                const shared = candidates.length > 0
                    ? await fetchLiveStatuses(candidates.map(fav => fav.channelId as string))
                    : new Map<string, LiveStatusRow>();

                let endpointCalls = 0;
                for (const fav of candidates) {
                    const channelId = fav.channelId as string;
                    const sharedRow = shared.get(channelId);
                    const overBudget = endpointCalls >= MAX_ENDPOINT_CALLS_PER_ROUND;
                    // 手動重新整理只接受 3 分鐘內的共享資料；但額度用完時，自動輪詢門檻內的也比完全不更新好
                    const fromShared = !!sharedRow && (force && !overBudget
                        ? isLiveStatusFresh(sharedRow, Date.now(), LIVE_STATUS_FRESH_FORCE_MS)
                        : isLiveStatusFresh(sharedRow, Date.now(), autoFreshMaxAge(sharedRow)));

                    if (!fromShared) {
                        // 這輪打端點的額度用完：不記錄，留到下一輪（排序會讓它排在前面）
                        if (overBudget) continue;
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

                        // Check if updates are needed
                        // Important: Always update if we have a new liveUrl (finalUrl) and it's different
                        const newLiveUrl = status.finalUrl || null;
                        const newLiveVideoId = status.liveVideoId || null;
                        const newIsLive = status.isLive || false;

                        // Identify if anything meaningful changed
                        // Specifically check liveUrl because that was the bug
                        if (fav.isLive !== newIsLive ||
                            fav.liveUrl !== newLiveUrl ||
                            fav.liveVideoId !== newLiveVideoId) {

                            hasUpdates = true;
                            updatedFavorites = updatedFavorites.map(f => {
                                if (f.id === fav.id) {
                                    return {
                                        ...f,
                                        isLive: newIsLive,
                                        lastChecked: new Date().toISOString(),
                                        liveUrl: newLiveUrl,
                                        liveVideoId: newLiveVideoId
                                    };
                                }
                                return f;
                            });
                        }
                    } catch (e) {
                        // 記下失敗時間：5 分鐘內不重試、排序排到後面，避免持續失敗的頻道每輪佔住額度
                        recordChannelFailure(channelId);
                        console.warn(`[LiveCheck] YouTube check failed for ${channelId}`, e);
                    }
                }
            }

            // 3. Save only if there were updates
            if (hasUpdates) {

                favoritesService.saveFavorites(updatedFavorites);
            } else {

            }

        } catch (e) {
            console.error('[LiveCheck] Global check failed', e);
        }
}
