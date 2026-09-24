// 真實使用者 Web Vitals 歸因（2026-09 PageSpeed）：桌機實測 CLS 0.24 在實驗室重現不了，
// 靠 GA4 web_vitals 事件回報「哪個元素」造成位移。這裡鎖住欄位對應與同意機制。
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Cb = (m: unknown) => void;
const handlers: Record<string, Cb> = {};
vi.mock('web-vitals/attribution', () => ({
    onCLS: (cb: Cb) => { handlers.CLS = cb; },
    onLCP: (cb: Cb) => { handlers.LCP = cb; },
    onINP: (cb: Cb) => { handlers.INP = cb; },
}));

describe('webVitals', () => {
    beforeEach(() => {
        vi.resetModules();
        for (const k of Object.keys(handlers)) delete handlers[k];
    });

    it('三個指標都送出 web_vitals 事件，帶元素 selector 與進站網址；CLS 放大 1000 倍取整', async () => {
        const analytics = await import('../../src/utils/analytics');
        await analytics.initGA(); // jsdom 是 localhost → mock 模式，事件改印 console.info
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const { startWebVitalsReporting } = await import('../../src/utils/webVitals');
        startWebVitalsReporting();
        startWebVitalsReporting(); // 重複呼叫只註冊一次

        handlers.CLS({ value: 0.2431, rating: 'poor', attribution: { largestShiftTarget: 'main>div.hero' } });
        handlers.LCP({ value: 1834.6, rating: 'good', attribution: { target: 'img.hero' } });
        handlers.INP({ value: 96, rating: 'good', attribution: {} });

        const events = info.mock.calls.filter(c => c[2] === 'web_vitals').map(c => c[3] as Record<string, unknown>);
        expect(events).toHaveLength(3);
        expect(events[0]).toMatchObject({ metric_name: 'CLS', value: 243, metric_rating: 'poor', debug_target: 'main>div.hero', landing_path: '/' });
        expect(events[1]).toMatchObject({ metric_name: 'LCP', value: 1835, debug_target: 'img.hero' });
        // 沒有歸因目標時送空字串，不送 undefined
        expect(events[2]).toMatchObject({ metric_name: 'INP', value: 96, debug_target: '' });
        info.mockRestore();
    });

    it('selector 截到 100 字（GA4 參數長度上限）', async () => {
        const analytics = await import('../../src/utils/analytics');
        await analytics.initGA();
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        analytics.sendWebVital({ name: 'CLS', value: 0.1, rating: 'needs-improvement', debugTarget: 'x'.repeat(300), landingPath: '/' });
        const ev = info.mock.calls.find(c => c[2] === 'web_vitals')![3] as Record<string, string>;
        expect(ev.debug_target).toHaveLength(100);
        info.mockRestore();
    });
});
