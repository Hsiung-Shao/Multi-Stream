/**
 * 真實使用者的 Core Web Vitals 歸因回報（2026-09 PageSpeed 優化）。
 *
 * 為什麼需要：PageSpeed 的桌機實測 CLS 是 0.24（不及格），但實驗室把首頁、畫布、分享網址、
 * 主題與語言各種情境都跑過一輪，全部接近 0，重現不出來。要知道真實使用者是被哪個元素推擠，
 * 只能從現場回報：CLS 回報最大位移的元素，LCP 回報 LCP 元素，INP 回報互動目標。
 *
 * - 只經由 analytics.sendEvent 送出，因此沿用同一套 Cookie 同意與內部環境判斷（未同意不送、本機只印 console）
 * - web-vitals 內部的 PerformanceObserver 都用 buffered，由 DeferredGlobals 延後啟動也能拿到載入期間的資料
 * - CLS 與 INP 在頁面切到背景（visibilitychange hidden）時才定案回報；GA4 gtag 在該時機用 sendBeacon 送出
 */
import { onCLS, onINP, onLCP } from 'web-vitals/attribution';
import { isInternalEnvironment, sendWebVital } from './analytics';

let started = false;

/**
 * 匿名回報（2026-11-19）：GA4 只收得到同意 Cookie 的訪客，解釋不了 CrUX 的實測數字。
 * 不良的 CLS／INP 另外送到自家 /api/vitals（functions/api/vitals.js）：不設 Cookie、不帶識別碼，
 * 所以不看同意狀態（隱私權政策 2.5 節第 9 項有告知）。良好的不送，省流量。
 */
function sendAnonymousVital(name: 'CLS' | 'INP', value: number, rating: string, target: string, landingPath: string): void {
    if (rating === 'good' || isInternalEnvironment() || typeof navigator.sendBeacon !== 'function') return;
    const body = {
        name, value, rating,
        target: target.slice(0, 100),
        landing_path: landingPath.slice(0, 120),
        page_path: window.location.pathname.slice(0, 120),
        device: window.matchMedia?.('(pointer: coarse)').matches ? 'mobile' : 'desktop',
        vw: window.innerWidth,
        vh: window.innerHeight,
    };
    try {
        navigator.sendBeacon('/api/vitals', new Blob([JSON.stringify(body)], { type: 'application/json' }));
    } catch {
        // 送不出去就算了：這只是診斷資料
    }
}

/**
 * 這份文件的進站路徑（CrUX 歸屬整段工作階段的網址）。取自導覽記錄而不是當下的 location：
 * 本模組在延後載入的 DeferredGlobals 裡才啟動，那之前 SPA 可能已經換過頁。
 */
function landingPathOf(): string {
    try {
        const nav = performance.getEntriesByType('navigation')[0];
        if (nav?.name) return new URL(nav.name).pathname;
    } catch {
        // 不支援 Navigation Timing：退回當下路徑
    }
    return window.location.pathname;
}

export function startWebVitalsReporting(): void {
    if (started || typeof window === 'undefined') return;
    started = true;
    const landingPath = landingPathOf();

    onCLS(m => {
        const debugTarget = m.attribution.largestShiftTarget ?? '';
        sendWebVital({ name: 'CLS', value: m.value, rating: m.rating, landingPath, debugTarget });
        sendAnonymousVital('CLS', m.value, m.rating, debugTarget, landingPath);
    });
    onLCP(m => sendWebVital({
        name: 'LCP', value: m.value, rating: m.rating, landingPath,
        debugTarget: m.attribution.target ?? '',
    }));
    onINP(m => {
        const debugTarget = m.attribution.interactionTarget ?? '';
        sendWebVital({ name: 'INP', value: m.value, rating: m.rating, landingPath, debugTarget });
        sendAnonymousVital('INP', m.value, m.rating, debugTarget, landingPath);
    });
}
