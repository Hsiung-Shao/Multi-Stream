import ReactGA from 'react-ga4';
import { identityManager } from '../features/analytics/IdentityManager';

const EVENT_QUEUE: Array<() => void> = [];
let isInitialized = false;
let gaMeasurementId: string | null = null;
let isInitializing = false;

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

/**
 * 初始化 Google Analytics 4
 */
export const initGA = async () => {
    // 防止重複初始化
    if (isInitialized || isInitializing) return;
    isInitializing = true;

    try {
        const fetchedId = await configPromise;

        if (!fetchedId) {
            console.warn('GA4 Measurement ID not found (Async). Analytics disabled.');
            isInitializing = false;
            return;
        }

        gaMeasurementId = fetchedId;
        ReactGA.initialize(fetchedId);

        // 初始化 IdentityManager 以取得/生成 UUID
        // 必須等待 Identity 初始化完成，確保 userId 被設定
        // 這樣第一個 page_view 才會帶有正確的 uid，避免被切分為兩個使用者 (Anonymous -> Identified)
        try {
            const { uuid, isNew } = await identityManager.init();

            // 設定 User ID
            ReactGA.set({ userId: uuid });

            // 設定使用者屬性
            ReactGA.set({
                user_properties: {
                    visitor_type: isNew ? 'new' : 'returning',
                }
            });
        } catch (err) {
            console.warn('IdentityManager init failed:', err);
            // 即使 Identity 失敗，我們仍繼續初始化 GA，只是沒有 User ID
        }

        isInitialized = true;
        isInitializing = false;

        // 處理積壓的事件 (現在發出的事件都會帶有 User ID)
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

/**
 * 記錄頁面瀏覽 (Page View)
 */
export const logPageView = () => {
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


