// 前端安全強化：後台外部連結只放行 http(s)（B1）、page_view 不外洩網址 hash（B7）
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import * as contributions from '../../src/features/admin/components/ContributionsTab';
import { logPageView } from '../../src/utils/analytics';

describe('ContributionsTab 的 Ext 外部連結', () => {
    it('B1 javascript: 網址不產生 a 連結但保留文字；https 照常連結', () => {
        // Ext 目前未匯出：此題預期先失敗在這行斷言
        const Ext = (contributions as Record<string, unknown>).Ext as (p: { href: string; children: React.ReactNode }) => JSX.Element;
        expect(typeof Ext).toBe('function');

        const bad = render(<Ext href="javascript:alert(1)">壞連結文字</Ext>);
        expect(bad.container.querySelector('a[href^="javascript"]')).toBeNull();
        expect(bad.container.textContent).toContain('壞連結文字');
        bad.unmount();

        const good = render(<Ext href="https://example.com/a">好連結</Ext>);
        expect(good.container.querySelector('a[href="https://example.com/a"]')).not.toBeNull();
    });
});

describe('logPageView 網址清理', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        window.history.replaceState(null, '', '/');
    });

    it('B7 page_location 不含 # 與 access_token，仍含路徑與 query', () => {
        // jsdom 的 localhost 屬內部環境，事件走 console.info 的 GA4 Mock 輸出（參數順序：標籤、event、事件名、參數）
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const gtag = vi.fn();
        (window as unknown as { gtag: unknown }).gtag = gtag;
        window.history.replaceState(null, '', '/schedule?x=1#access_token=abc');
        logPageView();
        const fromInfo = info.mock.calls.find((c) => c[2] === 'page_view')?.[3];
        const fromGtag = gtag.mock.calls.find((c) => c[0] === 'event' && c[1] === 'page_view')?.[2];
        const params = (fromInfo ?? fromGtag) as { page_location: string } | undefined;
        expect(params).toBeDefined();
        expect(params!.page_location).not.toContain('#');
        expect(params!.page_location).not.toContain('access_token');
        expect(params!.page_location).toContain('/schedule?x=1');
    });
});
