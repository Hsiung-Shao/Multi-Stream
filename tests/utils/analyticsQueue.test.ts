/**
 * @vitest-environment-options {"url":"https://multistreaming.org/"}
 */
// GA4 事件排隊（2026-09 code review）：已同意但 gtag.js 還在載入時送出的事件原本會被靜默丟棄。
// 例如 web-vitals 的 LCP 在第一次點擊時定案，而新訪客的第一次點擊常常就是 Cookie 橫幅的「接受」。
// 這裡用正式網域跑（非內部環境），才會走 live 路徑。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Analytics = typeof import('../../src/utils/analytics');

let loadScript: (() => void) | null = null;
let gtag: ReturnType<typeof vi.fn>;

async function fresh(): Promise<Analytics> {
    vi.resetModules();
    return import('../../src/utils/analytics');
}

describe('analytics 事件排隊', () => {
    beforeEach(() => {
        localStorage.clear();
        loadScript = null;
        gtag = vi.fn();
        (window as unknown as { gtag: unknown }).gtag = gtag;
        // gtag.js 不真的下載：攔下 <script>，由測試決定何時「載入完成」
        vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
            const s = node as unknown as HTMLScriptElement;
            loadScript = () => s.onload?.(new Event('load'));
            return node;
        });
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const events = () => gtag.mock.calls.filter(c => c[0] === 'event').map(c => c[1]);

    it('剛按下「接受」、gtag.js 還在載入時送的事件先排隊，載入完成後補送', async () => {
        const a = await fresh();
        await a.initGA(); // 還沒同意 → disabled
        a.setTrackingConsent(true); // 回到 uninitialized，開始載入 gtag.js
        a.sendWebVital({ name: 'LCP', value: 1834.6, rating: 'good', debugTarget: 'img.hero', landingPath: '/' });
        expect(events()).toEqual([]);

        loadScript!();
        await vi.waitFor(() => expect(events()).toContain('web_vitals'));
        const call = gtag.mock.calls.find(c => c[1] === 'web_vitals')!;
        // 不用 GA4 保留字 value
        expect(call[2]).toMatchObject({ metric_name: 'LCP', metric_value: 1835 });
        expect(call[2]).not.toHaveProperty('value');
    });

    it('沒有同意時照舊丟棄，不排隊', async () => {
        const a = await fresh();
        a.sendWebVital({ name: 'CLS', value: 0.1, rating: 'needs-improvement', debugTarget: 'x', landingPath: '/' });
        localStorage.setItem('cookie_consent', 'accepted');
        const init = a.initGA();
        loadScript!();
        await init;
        expect(events()).not.toContain('web_vitals');
    });

    it('載入期間改按「拒絕」：不切回 live、排隊的事件不補送', async () => {
        const a = await fresh();
        localStorage.setItem('cookie_consent', 'accepted');
        const init = a.initGA();
        a.sendWebVital({ name: 'CLS', value: 0.1, rating: 'needs-improvement', debugTarget: 'x', landingPath: '/' });
        a.setTrackingConsent(false);
        loadScript!();
        await init;
        a.sendWebVital({ name: 'LCP', value: 900, rating: 'good', debugTarget: 'y', landingPath: '/' });
        expect(events()).toEqual([]);
        expect(gtag.mock.calls.some(c => c[0] === 'config')).toBe(false);
    });
});
