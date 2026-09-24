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
import { sendWebVital } from './analytics';

let started = false;

export function startWebVitalsReporting(): void {
    if (started || typeof window === 'undefined') return;
    started = true;
    const landingPath = window.location.pathname;

    onCLS(m => sendWebVital({
        name: 'CLS', value: m.value, rating: m.rating, landingPath,
        debugTarget: m.attribution.largestShiftTarget ?? '',
    }));
    onLCP(m => sendWebVital({
        name: 'LCP', value: m.value, rating: m.rating, landingPath,
        debugTarget: m.attribution.target ?? '',
    }));
    onINP(m => sendWebVital({
        name: 'INP', value: m.value, rating: m.rating, landingPath,
        debugTarget: m.attribution.interactionTarget ?? '',
    }));
}
