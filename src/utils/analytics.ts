/**
 * MultiStream Hub — GA4 Analytics Module
 *
 * 設計原則：
 * 1. Native gtag.js 取代 react-ga4（spec 要求）
 * 2. 三段模式：live（正式環境真送）/ mock（內部環境 console.log）/ disabled（無同意）
 * 3. 環境檢查：localhost / 127.0.0.1 / *.pages.dev → mock；multistreaming.org → live
 * 4. send_page_view: false — 由我們手動送 page_view，避免雙計、配合 SPA 路由
 * 5. 結構化 helper（track.*）為新事件首選；保留 logEvent() 為向後相容 wrapper
 * 6. user_id 一律 SHA-256 + salt，禁絕 PII（spec 強制）
 *
 * 與 GTM 的關係：
 * - GTM (GTM-WS5W6JWC) script 已從 index.html 移除，後台 3 個 stream_heartbeat 系列 tag 由本模組完整取代
 * - 詳見 docs/ga4-gtm-investigation.md
 *
 * 與 Cloudflare Zaraz 的關係：
 * - Zaraz 的 GA4 整合導致 user_engagement 沒被收集、跳出率 99%
 * - 須在 CF dashboard 手動停用，見 docs/ga4-zaraz-disable.md
 */

const GA_MEASUREMENT_ID = 'G-Q2LXVMDD46';
const CONSENT_KEY = 'cookie_consent';
/** 使用者回應 Cookie 橫幅後在 window 上廣播（畫布導覽等橫幅關掉才開始） */
export const CONSENT_CHANGE_EVENT = 'cookie-consent-change';
const INTERNAL_USER_KEY = 'ms_internal_user';
const SESSION_WATCH_SECONDS_KEY = 'ms_session_watch_seconds';
const SESSION_MAX_STREAMS_KEY = 'ms_session_max_concurrent_streams';

type Mode = 'uninitialized' | 'live' | 'mock' | 'disabled';
let mode: Mode = 'uninitialized';
let scriptInjected = false;
/** 已同意但 gtag.js 還沒載好時送出的事件（sendEvent 排隊、initGA 進 live 後補送）；設上限防止載入失敗時無限累積 */
const pendingEvents: Array<[string, Record<string, unknown>]> = [];
const MAX_PENDING_EVENTS = 50;

// ===== Cookie 同意 =====

export const isTrackingEnabled = (): boolean => {
    try {
        return localStorage.getItem(CONSENT_KEY) === 'accepted';
    } catch {
        return false;
    }
};

export const hasConsentRecord = (): boolean => {
    try {
        return localStorage.getItem(CONSENT_KEY) !== null;
    } catch {
        return false;
    }
};

export const setTrackingConsent = (accepted: boolean): void => {
    try {
        localStorage.setItem(CONSENT_KEY, accepted ? 'accepted' : 'rejected');
        if (accepted) {
            // 從「先前拒絕」切回接受時,mount 階段 initGA 已把 mode 設為 disabled,
            // 需重置回 uninitialized 才能重新初始化進入 live;並補送當前頁 page_view,
            // 否則使用者得 reload 才會開始有資料。
            if (mode === 'disabled') mode = 'uninitialized';
            initGA().then(() => logPageView());
        } else {
            disableTracking();
        }
    } catch (e) {
        console.warn('Failed to save consent status:', e);
    }
    // 寫不寫得進 localStorage 都要通知：橫幅已經關掉了
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
};

export const disableTracking = (): void => {
    try {
        localStorage.setItem(CONSENT_KEY, 'rejected');
        document.cookie.split(';').forEach((cookie) => {
            const name = cookie.split('=')[0].trim();
            if (name.startsWith('_ga')) {
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
            }
        });
        if (mode === 'live') {
            sendEvent('tracking_disabled', { source: 'user_action' });
        }
        mode = 'disabled';
        pendingEvents.length = 0;
    } catch (e) {
        console.warn('Failed to disable tracking:', e);
    }
};

// ===== 環境判斷 =====

/**
 * 是否為內部環境（dev/preview/QA flag）— 不送任何 GA4 請求
 */
export const isInternalEnvironment = (): boolean => {
    if (typeof window === 'undefined') return true;
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (hostname.endsWith('.pages.dev')) return true;
    try {
        if (localStorage.getItem(INTERNAL_USER_KEY) === '1') return true;
    } catch {
        /* localStorage 不可用視為非內部 */
    }
    return false;
};

// ===== gtag 動態載入 =====

const injectGtagScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (scriptInjected) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
        script.onload = () => {
            scriptInjected = true;
            resolve();
        };
        script.onerror = () => reject(new Error('Failed to load gtag.js'));
        document.head.appendChild(script);
    });
};

const installMockGtag = (): void => {
    // 覆寫 boot stub 的 gtag，改為 console.info 模式
    window.gtag = function mockGtag(...args: unknown[]) {
        console.info('[GA4 Mock]', ...args);
    };
};

// ===== 初始化 =====

/**
 * 初始化 GA4。依環境決定 live / mock / disabled，呼叫多次只會生效一次。
 *
 * Live 模式設定 send_page_view: false — 由 logPageView() 手動送，
 * SPA 路由變更時才會觸發 page_view。
 */
export const initGA = async (): Promise<void> => {
    if (mode !== 'uninitialized') return;

    if (isInternalEnvironment()) {
        mode = 'mock';
        installMockGtag();
        console.info('[GA4] Mock mode (internal environment, no requests sent)');
        return;
    }

    if (!isTrackingEnabled()) {
        mode = 'disabled';
        pendingEvents.length = 0;
        console.info('[GA4] Disabled (no consent)');
        return;
    }

    try {
        await injectGtagScript();
        // 載入期間使用者改按「拒絕」（disableTracking 已設 disabled）：不要再切回 live、也不補送排隊事件
        if (!isTrackingEnabled()) {
            mode = 'disabled';
            pendingEvents.length = 0;
            return;
        }
        // boot stub 已建立 window.gtag = dataLayer.push 形式，可直接使用
        window.gtag('config', GA_MEASUREMENT_ID, {
            send_page_view: false,
            cookie_flags: 'SameSite=None;Secure',
        });
        mode = 'live';
        console.info('[GA4] Live mode initialized');
        // 載入期間排隊的事件補送（見 sendEvent）
        for (const [name, params] of pendingEvents.splice(0)) window.gtag('event', name, params);
    } catch (e) {
        console.error('[GA4] Init failed:', e);
        mode = 'disabled';
        pendingEvents.length = 0;
    }
};

// ===== 事件送出（核心） =====

/**
 * 送 GA4 event。所有 helper 最終都走這裡。
 * 內部環境 → console.info；正式環境 → window.gtag
 */
const sendEvent = (eventName: string, params?: Record<string, unknown>): void => {
    if (mode === 'uninitialized') {
        // initGA 還沒執行，先 fall back 到環境檢查
        if (isInternalEnvironment()) {
            console.info('[GA4 Mock]', 'event', eventName, params);
            return;
        }
        // 已同意、gtag.js 還在載入（進站初期，或剛按下「接受」）：先排隊，initGA 進 live 後補送。
        // 例：web-vitals 的 LCP 就在第一次點擊定案，而新訪客的第一次點擊常常正是 Cookie 橫幅的「接受」。
        // 沒同意（或還沒回應）的事件照舊丟棄。
        if (isTrackingEnabled() && pendingEvents.length < MAX_PENDING_EVENTS) {
            pendingEvents.push([eventName, params || {}]);
        }
        return;
    }
    if (mode === 'disabled') return;
    if (mode === 'mock') {
        console.info('[GA4 Mock]', 'event', eventName, params);
        return;
    }
    // mode === 'live'
    window.gtag('event', eventName, params || {});
};

// ===== Page View =====

/**
 * 手動送 page_view。SPA 路由變更時呼叫。
 * 確保 document.title 已是當前頁面標題（呼叫端應在 title 更新後才呼叫，
 * 例如用 queueMicrotask / requestAnimationFrame）。
 */
export const logPageView = (): void => {
    sendEvent('page_view', {
        page_location: window.location.href,
        page_path: window.location.pathname + window.location.search,
        page_title: document.title,
    });
};

// ===== 結構化事件 helper（spec 要求） =====

export const track = {
    /** 套用預設配置 */
    applyPreset: (presetName: string, streamCount: number) =>
        sendEvent('apply_preset', { preset_name: presetName, stream_count: streamCount }),

    /** 套用自訂配置 */
    applyCustom: (streamCount: number) =>
        sendEvent('apply_custom', { stream_count: streamCount }),

    /** 建立新自訂配置 */
    createCustom: (streamCount: number) =>
        sendEvent('create_custom', { stream_count: streamCount }),

    /** 切換布局 */
    changeLayout: (layoutType: string, streamCount: number) =>
        sendEvent('change_layout', { layout_type: layoutType, stream_count: streamCount }),

    /** 切換聊天室布局 */
    changeChatLayout: (chatPosition: string) =>
        sendEvent('change_chat_layout', { chat_position: chatPosition }),

    /** 新增收藏 */
    addFavorite: (platform: string, channelName: string) =>
        sendEvent('add_favorite', { platform, channel_name: channelName }),

    /** 移除收藏 */
    removeFavorite: (platform: string, channelName: string) =>
        sendEvent('remove_favorite', { platform, channel_name: channelName }),

    /** 批量匯入 */
    batchImport: (importCount: number, source: string) =>
        sendEvent('batch_import', { import_count: importCount, source }),

    /** Twitch 匯入 */
    twitchImport: (importCount: number) =>
        sendEvent('twitch_import', { import_count: importCount }),

    /** 匯出 JSON 設定 */
    exportJson: () => sendEvent('export_json'),

    /** 匯入 JSON 設定 */
    importJson: () => sendEvent('import_json'),

    /** 全體靜音切換 */
    toggleMuteAll: (isMuted: boolean) =>
        sendEvent('toggle_mute_all', { is_muted: isMuted }),

    /** 點擊贊助按鈕 */
    clickDonationCta: (location: string, paymentMethod: string) =>
        sendEvent('click_donation_cta', { location, payment_method: paymentMethod }),

    /** 搜尋結果出現 */
    viewSearchResults: (searchTerm: string, resultCount: number) =>
        sendEvent('view_search_results', { search_term: searchTerm, result_count: resultCount }),

    /** 直播視窗開啟 */
    streamStart: (platform: string, isFirstStream: boolean) =>
        sendEvent('stream_start', { platform, is_first_stream: isFirstStream }),

    /** 週表勾選後在畫布開啟（tab：live/upcoming；scope：all/favorites） */
    scheduleOpenMulti: (selectedCount: number, addedCount: number, tab: string, scope: string) =>
        sendEvent('schedule_open_multi', { selected_count: selectedCount, added_count: addedCount, tab, scope }),

    /** 週表／個人頁點卡片在畫布觀看（result：added/switched/full/failed；source：board/person） */
    scheduleWatch: (platform: string, status: string, source: string, result: string) =>
        sendEvent('schedule_watch', { platform, status, source, result }),

    /** 週表篩選變更（filter：scope/nationality/group/platform/day） */
    scheduleFilterChange: (filter: string, value: string) =>
        sendEvent('schedule_filter_change', { filter, value }),

    /** 觀看里程碑（5/15/30/60 分鐘） */
    streamMilestone: (milestoneMinutes: number) =>
        sendEvent('stream_milestone', { milestone_minutes: milestoneMinutes }),
} as const;

// ===== Web Vitals（真實使用者量測，見 utils/webVitals.ts） =====

export interface WebVitalPayload {
    name: 'CLS' | 'LCP' | 'INP';
    /** CLS 為無單位分數，LCP/INP 為毫秒 */
    value: number;
    rating: 'good' | 'needs-improvement' | 'poor';
    /** 造成此數值的元素 selector（CLS 最大位移、LCP 元素、INP 互動目標） */
    debugTarget: string;
    /** 進站網址：CrUX 把 SPA 整段工作階段算在進站網址上，換頁後 page_path 會不同 */
    landingPath: string;
}

export const sendWebVital = (p: WebVitalPayload): void => {
    sendEvent('web_vitals', {
        metric_name: p.name,
        // 不用 GA4 保留字 value（會被當成事件價值加總進「事件價值」報表）。
        // CLS 放大 1000 倍取整：GA4 自訂指標只收數字，方便加總與平均
        metric_value: p.name === 'CLS' ? Math.round(p.value * 1000) : Math.round(p.value),
        metric_rating: p.rating,
        debug_target: p.debugTarget.slice(0, 100),
        landing_path: p.landingPath,
        page_path: window.location.pathname,
    });
};

// ===== Heartbeat 與 Session 事件（spec 要求） =====

export interface HeartbeatPayload {
    streamCount: number;
    platforms: string; // "twitch,youtube"
    totalWatchSeconds: number;
    isActive: boolean;
}

export const sendStreamHeartbeat = (payload: HeartbeatPayload): void => {
    sendEvent('stream_heartbeat', {
        stream_count: payload.streamCount,
        platforms: payload.platforms,
        total_watch_seconds: payload.totalWatchSeconds,
        is_active: payload.isActive,
    });
};

export const sendSessionPause = (activeWatchSeconds: number): void => {
    sendEvent('session_pause', {
        active_watch_seconds: activeWatchSeconds,
    });
};

export const sendSessionResume = (): void => {
    sendEvent('session_resume', {});
};

export const sendSessionEnd = (totalWatchSeconds: number, maxConcurrentStreams: number): void => {
    sendEvent('session_end', {
        total_watch_seconds: totalWatchSeconds,
        max_concurrent_streams: maxConcurrentStreams,
    });
};

// ===== Session storage：跨頁面重整保留累積秒數 =====

export const getStoredWatchSeconds = (): number => {
    try {
        const v = sessionStorage.getItem(SESSION_WATCH_SECONDS_KEY);
        return v ? Math.max(0, Number(v)) : 0;
    } catch {
        return 0;
    }
};

export const setStoredWatchSeconds = (seconds: number): void => {
    try {
        sessionStorage.setItem(SESSION_WATCH_SECONDS_KEY, String(Math.max(0, Math.floor(seconds))));
    } catch {
        /* sessionStorage 不可用就放棄持久化，當下值仍可用 */
    }
};

export const getStoredMaxStreams = (): number => {
    try {
        const v = sessionStorage.getItem(SESSION_MAX_STREAMS_KEY);
        return v ? Math.max(0, Number(v)) : 0;
    } catch {
        return 0;
    }
};

export const setStoredMaxStreams = (count: number): void => {
    try {
        sessionStorage.setItem(SESSION_MAX_STREAMS_KEY, String(Math.max(0, Math.floor(count))));
    } catch {
        /* ignore */
    }
};

// ===== 向後相容 =====

/**
 * @deprecated 請改用 `track.*` 結構化 helper（spec 要求）。
 *
 * 既有 25+ 處呼叫保留可用：(category, action, label?, value?) → GA4 event(action, {event_category, event_label, value})。
 * 此 wrapper 不會被刪除，但新事件不要用。
 */
export const logEvent = (category: string, action: string, label?: string, value?: number): void => {
    sendEvent(action, {
        event_category: category,
        event_label: label,
        value,
    });
};

/**
 * @deprecated 用於既有 ReactGA.set 呼叫。新程式請用 track.* helper。
 */
export const setUserProperties = (properties: Record<string, unknown>): void => {
    if (mode === 'mock') {
        console.info('[GA4 Mock]', 'set user_properties', properties);
        return;
    }
    if (mode !== 'live') return;
    window.gtag('set', 'user_properties', properties);
};
