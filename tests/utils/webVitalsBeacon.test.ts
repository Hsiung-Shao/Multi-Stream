// CLS／INP 不良指標的匿名回報（sendBeacon → /api/vitals）：欄位白名單、good 與內部環境不送
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Cb = (m: unknown) => void;
const handlers: Record<string, Cb> = {};
vi.mock('web-vitals/attribution', () => ({
    onCLS: (cb: Cb) => { handlers.CLS = cb; },
    onLCP: (cb: Cb) => { handlers.LCP = cb; },
    onINP: (cb: Cb) => { handlers.INP = cb; },
}));

const h = vi.hoisted(() => ({ internal: false }));
vi.mock('../../src/utils/analytics', () => ({
    sendWebVital: vi.fn(),
    isInternalEnvironment: () => h.internal,
}));

const readBlob = (b: Blob) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
});

const FIELDS = ['device', 'landing_path', 'name', 'page_path', 'rating', 'target', 'value', 'vh', 'vw'];

describe('webVitals 匿名回報', () => {
    let beacon: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.resetModules();
        for (const k of Object.keys(handlers)) delete handlers[k];
        h.internal = false;
        beacon = vi.fn(() => true);
        Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true, writable: true });
        window.history.pushState({}, '', '/schedule/taione');
        const { startWebVitalsReporting } = await import('../../src/utils/webVitals');
        startWebVitalsReporting();
    });

    afterEach(() => {
        Reflect.deleteProperty(navigator, 'sendBeacon');
    });

    it('不良 CLS 會送匿名回報', async () => {
        handlers.CLS({ value: 0.2431, rating: 'poor', attribution: { largestShiftTarget: 'main>div.hero' } });
        expect(beacon).toHaveBeenCalledTimes(1);
        const [url, blob] = beacon.mock.calls[0] as [string, Blob];
        expect(url).toBe('/api/vitals');
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('application/json');
        const body = JSON.parse(await readBlob(blob));
        // 欄位恰為白名單（不得夾帶 UA 或任何 id）
        expect(Object.keys(body).sort()).toEqual(FIELDS);
        expect(body).toMatchObject({ name: 'CLS', rating: 'poor', target: 'main>div.hero', page_path: '/schedule/taione' });
        expect(typeof body.value).toBe('number');
        expect(body.landing_path.startsWith('/')).toBe(true);
        expect(['mobile', 'desktop']).toContain(body.device);
        expect(typeof body.vw).toBe('number');
        expect(typeof body.vh).toBe('number');
    });

    it('INP needs-improvement 也送；target 截 100 字、page_path 不含 query 與 hash', async () => {
        window.history.pushState({}, '', '/schedule/taione?utm=1#top');
        handlers.INP({ value: 320, rating: 'needs-improvement', attribution: { interactionTarget: 'x'.repeat(300) } });
        expect(beacon).toHaveBeenCalledTimes(1);
        const body = JSON.parse(await readBlob((beacon.mock.calls[0] as [string, Blob])[1]));
        expect(body.name).toBe('INP');
        expect(body.value).toBe(320);
        expect(body.target).toHaveLength(100);
        expect(body.page_path).toBe('/schedule/taione');
    });

    // 每個「不送」測試末尾補一筆不良指標當對照，確認 sendBeacon 路徑本身有通，不是恆真
    const poor = () => handlers.CLS({ value: 0.5, rating: 'poor', attribution: { largestShiftTarget: 'a' } });

    it('良好指標不送', () => {
        handlers.CLS({ value: 0.01, rating: 'good', attribution: {} });
        handlers.INP({ value: 50, rating: 'good', attribution: {} });
        expect(beacon).not.toHaveBeenCalled();
        poor();
        expect(beacon).toHaveBeenCalledTimes(1);
    });

    it('LCP 不送（即使評等不良）', () => {
        handlers.LCP({ value: 5000, rating: 'poor', attribution: { target: 'img.hero' } });
        expect(beacon).not.toHaveBeenCalled();
        poor();
        expect(beacon).toHaveBeenCalledTimes(1);
    });

    it('內部環境不送', () => {
        h.internal = true;
        poor();
        handlers.INP({ value: 900, rating: 'poor', attribution: {} });
        expect(beacon).not.toHaveBeenCalled();
        h.internal = false;
        poor();
        expect(beacon).toHaveBeenCalledTimes(1);
    });
});
