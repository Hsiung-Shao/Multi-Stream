// 歌回入口：首頁導覽列（開台週表之後）與手機設定頁都有連到 /songs 的連結
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { LandingPage } from '../../src/components/Pages/LandingPage';
import { MobileSettingsPage } from '../../src/components/Mobile/MobileSettingsPage';
import { useUIStore } from '../../src/store/useUIStore';
import { DISCORD_URL } from '../../src/config/links';
import i18n from '../../src/i18n/i18n';

// 真 i18n 鎖 zh-TW（jsdom 預設 en-US）
beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
});

vi.mock('../../src/store/useUIStore');
vi.mock('../../src/hooks/useEffectiveTheme', () => ({ useEffectiveTheme: () => 'light' }));
vi.mock('../../src/utils/analytics', () => ({ logEvent: vi.fn() }));
vi.mock('../../src/components/SiteFooter', () => ({ SiteFooter: () => <footer /> }));
vi.mock('../../src/components/StreamSearchBox', () => ({ StreamSearchBox: () => <div /> }));
vi.mock('../../src/components/SEO', () => ({ SEO: () => null }));

const ui = { theme: 'light', toggleTheme: vi.fn(), openModal: vi.fn(), setPage: vi.fn() };
(useUIStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (s: typeof ui) => unknown) => selector(ui));

const hrefs = (root: HTMLElement) => Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'));

describe('歌回入口', () => {
    it('首頁導覽列有 /songs 連結，且排在 /schedule 之後', () => {
        const { container } = render(<LandingPage />);
        const links = hrefs(container);
        const schedule = links.indexOf('/schedule');
        const songs = links.indexOf('/songs');
        expect(schedule).toBeGreaterThanOrEqual(0);
        expect(songs).toBeGreaterThan(schedule);
        const songsLink = container.querySelector('a[href="/songs"]');
        expect(songsLink?.textContent?.trim()).toBeTruthy();
        // 文字是翻譯過的頁面標題，不是 i18n key
        expect(songsLink?.textContent).not.toMatch(/^songs:|\.title$/);
    });

    it('手機設定頁有指向 /songs 的連結', () => {
        const { container } = render(<MobileSettingsPage />);
        expect(hrefs(container)).toContain('/songs');
        expect(container.querySelector('a[href="/songs"]')?.textContent?.trim()).toBeTruthy();
    });
});

describe('首頁導覽列「更多」選單', () => {
    it('開台週表與歌回仍直接在 nav 內，「更多」選單內含次要連結', async () => {
        const { container } = render(<LandingPage />);
        const nav = container.querySelector('header nav') as HTMLElement;
        expect(nav.querySelector('a[href="/schedule"]')).not.toBeNull();
        expect(nav.querySelector('a[href="/songs"]')).not.toBeNull();

        const more = within(nav).getByRole('button', { name: '更多' });
        expect(more).toHaveAttribute('aria-haspopup', 'menu');
        // Radix DropdownMenu 的 trigger 靠鍵盤／pointerdown 開啟，不是 click
        fireEvent.keyDown(more, { key: 'Enter' });

        const menu = await screen.findByRole('menu');
        const hrefs = Array.from(menu.querySelectorAll('a')).map((a) => a.getAttribute('href'));
        for (const href of ['/about', '/instructions', '/faq', '/support', DISCORD_URL]) {
            expect(hrefs, href).toContain(href);
        }
    });
});
