import ReactGA from 'react-ga4';
import { identityManager } from '../features/analytics/IdentityManager';
import { userSegmentationManager } from './userSegmentation';

const EVENT_QUEUE: Array<() => void> = [];
let isInitialized = false;
let gaMeasurementId: string | null = null;
let isInitializing = false;

// ===== Cookie 同意相關 =====

const CONSENT_KEY = 'cookie_consent';

/**
 * 檢查追蹤是否已啟用（使用者已同意）
 */
export const isTrackingEnabled = (): boolean => {
    try {
        const consent = localStorage.getItem(CONSENT_KEY);
        return consent === 'accepted';
    } catch {
        return false;
    }
};

/**
 * 檢查是否已有同意記錄（無論同意或拒絕）
 */
export const hasConsentRecord = (): boolean => {
    try {
        const consent = localStorage.getItem(CONSENT_KEY);
        return consent !== null;
    } catch {
        return false;
    }
};

/**
 * 設定追蹤同意狀態
 */
export const setTrackingConsent = (accepted: boolean): void => {
    try {
        localStorage.setItem(CONSENT_KEY, accepted ? 'accepted' : 'rejected');

        if (accepted) {
            // 使用者同意，初始化 GA4
            initGA();
        } else {
            // 使用者拒絕，清除 GA cookies
            disableTracking();
        }
    } catch (e) {
        console.warn('Failed to save consent status:', e);
    }
};

/**
 * 停用追蹤並清除 GA cookies
 */
export const disableTracking = (): void => {
    try {
        localStorage.setItem(CONSENT_KEY, 'rejected');

        // 清除 GA4 cookies
        document.cookie.split(';').forEach(cookie => {
            const name = cookie.split('=')[0].trim();
            if (name.startsWith('_ga')) {
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
            }
        });

        // 記錄事件（在停用前）
        if (isInitialized) {
            logEvent('Privacy', 'tracking_disabled', 'user_action');
        }
    } catch (e) {
        console.warn('Failed to disable tracking:', e);
    }
};

// ===== GA 設定取得 =====

// 立即觸發設定取得 (最優先載入)
// 這樣當 initGA 被呼叫時，請求可能已經完成或正在進行中，不用等待 React 渲染
const configPromise = fetch('/api/ga-config')
    .then(res => {
        if (!res.ok) throw new Error(`GA Config Fetch Error: ${res.status}`);
        return res.json();
    })
    .then((data: any) => {
        return data.measurementId as string;
    })
    .catch(err => {
        console.warn('Failed to fetch GA Config:', err);
        return null;
    });

// ===== GA 初始化 =====

/**
 * 初始化 Google Analytics 4
 * 
 * 優化後的初始化順序：
 * 1. 檢查使用者同意狀態
 * 2. 初始化 IdentityManager（取得 UUID 和 isNew）
 * 3. 初始化 GA4（帶著 User ID）
 * 4. 設定使用者屬性
 * 5. 初始化使用者分群
 * 6. 處理事件佇列
 */
export const initGA = async () => {
    // 防止重複初始化
    if (isInitialized || isInitializing) return;

    // 檢查使用者是否已同意追蹤
    if (!isTrackingEnabled()) {
        console.info('GA4: Tracking not enabled (no consent)');
        return;
    }

    isInitializing = true;

    try {
        // 1. 取得 GA Measurement ID
        const fetchedId = await configPromise;

        if (!fetchedId) {
            console.warn('GA4 Measurement ID not found (Async). Analytics disabled.');
            isInitializing = false;
            return;
        }

        // 2. 先初始化 IdentityManager（確保 UUID 在 GA4 初始化前就緒）
        const { uuid, isNew } = await identityManager.init();

        // 3. 初始化 GA4（帶著 User ID）
        gaMeasurementId = fetchedId;
        ReactGA.initialize(fetchedId, {
            gaOptions: {
                userId: uuid
            }
        });

        isInitialized = true;
        isInitializing = false;

        // 4. 設定基本使用者屬性
        ReactGA.set({
            user_properties: {
                visitor_type: isNew ? 'new' : 'returning',
            }
        });

        // 5. 初始化使用者分群系統
        const segment = userSegmentationManager.init();

        // 設定完整的使用者分群屬性
        ReactGA.set({
            user_properties: {
                visitor_type: segment.visitor_type,
                visit_frequency: segment.visit_frequency,
                feature_depth: segment.feature_depth,
                session_length: segment.session_length,
            }
        });

        // 6. 處理積壓的事件
        processQueue();

    } catch (e) {
        console.error('GA Init Error:', e);
        isInitializing = false;
    }
};

const processQueue = () => {
    if (!isInitialized) return;
    while (EVENT_QUEUE.length > 0) {
        const eventTask = EVENT_QUEUE.shift();
        if (eventTask) eventTask();
    }
};

// ===== GA 事件追蹤 =====

/**
 * 記錄頁面瀏覽 (Page View)
 */
export const logPageView = () => {
    // 如果追蹤未啟用，不發送事件
    if (!isTrackingEnabled()) return;

    const task = () => {
        if (!gaMeasurementId) return;
        ReactGA.send({
            hitType: "pageview",
            page: window.location.pathname + window.location.search
        });
    };

    if (isInitialized) {
        task();
    } else {
        EVENT_QUEUE.push(task);
    }
};

/**
 * 記錄自定義事件 (Custom Event)
 */
export const logEvent = (category: string, action: string, label?: string, value?: number) => {
    // 如果追蹤未啟用，不發送事件
    if (!isTrackingEnabled()) return;

    const task = () => {
        if (!gaMeasurementId) return;
        ReactGA.event({
            category,
            action,
            label,
            value
        });
    };

    if (isInitialized) {
        task();
    } else {
        EVENT_QUEUE.push(task);
    }
};

/**
 * 特別為使用者屬性設定
 */
export const setUserProperties = (properties: any) => {
    // 如果追蹤未啟用，不發送事件
    if (!isTrackingEnabled()) return;

    const task = () => {
        if (!gaMeasurementId) return;
        ReactGA.set(properties);
    };

    if (isInitialized) {
        task();
    } else {
        EVENT_QUEUE.push(task);
    }
};
