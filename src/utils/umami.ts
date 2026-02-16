import { isTrackingEnabled } from './analytics';

// ===== Type 定義 =====

interface UmamiTracker {
    track: {
        (): void;
        (event: string, data?: Record<string, string | number>): void;
        (callback: (props: Record<string, unknown>) => Record<string, unknown>): void;
    };
    identify: (data: Record<string, string | number>) => void;
}

declare global {
    interface Window {
        umami?: UmamiTracker;
    }
}

// ===== Bot 偵測 =====

/**
 * 客戶端 Bot 偵測
 * Umami 伺服器端已有 isbot 過濾，這裡做前端第一層攔截
 */
const isBot = (): boolean => {
    try {
        // 1. headless browser / automation
        if (navigator.webdriver) return true;

        // 2. 常見 bot user-agent 關鍵字
        const ua = navigator.userAgent.toLowerCase();
        const botPatterns = [
            'bot', 'crawl', 'spider', 'slurp', 'mediapartners',
            'headless', 'phantom', 'selenium', 'puppeteer', 'playwright',
            'lighthouse', 'pagespeed', 'gtmetrix', 'pingdom',
        ];
        if (botPatterns.some(p => ua.includes(p))) return true;

        // 3. 無語言 / 無 plugins 且無 touch（簡易 headless 特徵）
        if (!navigator.language && !navigator.languages?.length) return true;

        return false;
    } catch {
        return false;
    }
};

// ===== 狀態 =====

const EVENT_QUEUE: Array<() => void> = [];
let isInitialized = false;
let isInitializing = false;
let detectedBot = false;

// 預先載入設定（與 GA4 的 configPromise 對稱）
const configPromise = fetch('/api/umami-config')
    .then(res => {
        if (!res.ok) throw new Error(`Umami Config Fetch Error: ${res.status}`);
        return res.json();
    })
    .then((data: { scriptUrl: string | null; websiteId: string | null }) => data)
    .catch(err => {
        console.warn('Failed to fetch Umami Config:', err);
        return null;
    });

// ===== 初始化 =====

/**
 * 初始化 Umami 追蹤
 * 動態注入 Umami script 標籤至 <head>
 */
export const initUmami = async (): Promise<void> => {
    if (isInitialized || isInitializing) return;
    if (!isTrackingEnabled()) return;

    // Bot 偵測：跳過機器人流量
    if (isBot()) {
        detectedBot = true;
        return;
    }

    isInitializing = true;

    try {
        const config = await configPromise;

        if (!config?.scriptUrl || !config?.websiteId) {
            console.warn('Umami config incomplete. Umami analytics disabled.');
            isInitializing = false;
            return;
        }

        // 動態建立 script 標籤
        await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.defer = true;
            script.src = config.scriptUrl!;
            script.dataset.websiteId = config.websiteId!;
            script.dataset.autoTrack = 'false'; // SPA 手動控制路由追蹤
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Umami script'));
            document.head.appendChild(script);
        });

        isInitialized = true;
        isInitializing = false;

        // 處理積壓的事件
        processQueue();

    } catch (e) {
        console.warn('Umami Init Error:', e);
        isInitializing = false;
    }
};

const processQueue = () => {
    if (!isInitialized) return;
    while (EVENT_QUEUE.length > 0) {
        const task = EVENT_QUEUE.shift();
        if (task) task();
    }
};

// ===== 追蹤方法 =====

/**
 * 發送 Umami pageview（SPA 路由切換時手動呼叫）
 */
export const trackPageView = (url?: string): void => {
    if (!isTrackingEnabled() || detectedBot) return;

    const task = () => {
        if (!window.umami) return;
        if (url) {
            window.umami.track((props: any) => ({ ...props, url }));
        } else {
            window.umami.track();
        }
    };

    if (isInitialized) {
        task();
    } else {
        EVENT_QUEUE.push(task);
    }
};

/**
 * 發送自訂事件
 */
export const trackEvent = (name: string, data?: Record<string, string | number>): void => {
    if (!isTrackingEnabled() || detectedBot) return;

    const task = () => {
        if (!window.umami) return;
        window.umami.track(name, data);
    };

    if (isInitialized) {
        task();
    } else {
        EVENT_QUEUE.push(task);
    }
};
