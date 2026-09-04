import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { SiteFooter } from '../../src/components/SiteFooter';
import { useUIStore } from '../../src/store/useUIStore';
import { PAGE_PATHS } from '../../src/config/routes';
import { DISCORD_URL } from '../../src/config/links';
import i18n from '../../src/i18n/i18n';

// 真 i18n 鎖 zh-TW(jsdom 預設 en-US),對著實際文案斷言
beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
});

vi.mock('../../src/store/useUIStore');
vi.mock('../../src/utils/analytics', () => ({ logEvent: vi.fn() }));

describe('SiteFooter', () => {
    const openModal = vi.fn();
    const setPage = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (useUIStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (selector: (s: { openModal: typeof openModal; setPage: typeof setPage }) => unknown) =>
                selector({ openModal, setPage }),
        );
    });

    it('links every static page with a real href (crawlable)', () => {
        render(<SiteFooter />);
        const expected: Array<[string, keyof typeof PAGE_PATHS]> = [
            ['關於我們', 'about'],
            ['使用教學', 'instructions'],
            ['常見問題', 'faq'],
            ['支持我們', 'support'],
            ['隱私權政策', 'privacy'],
        ];
        for (const [label, page] of expected) {
            expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', PAGE_PATHS[page]);
        }
        // 比較頁文案來自 compare namespace,用 href 反查;開發者頁刻意不放(About 內文已連)
        const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
        expect(hrefs).toContain(PAGE_PATHS.compare);
        expect(hrefs).not.toContain(PAGE_PATHS.creator);
    });

    it('links Discord in a new tab with noopener, and nothing else external', () => {
        render(<SiteFooter />);
        const discord = screen.getByRole('link', { name: 'Discord' });
        expect(discord).toHaveAttribute('href', DISCORD_URL);
        expect(discord).toHaveAttribute('target', '_blank');
        expect(discord).toHaveAttribute('rel', 'noopener noreferrer');

        expect(screen.queryByRole('link', { name: 'GitHub' })).toBeNull();
    });

    it('does not duplicate the global feedback FAB', () => {
        render(<SiteFooter />);
        expect(screen.queryByRole('button', { name: '意見回饋' })).toBeNull();
    });

    it('internal links use client-side routing on plain click', () => {
        render(<SiteFooter />);
        fireEvent.click(screen.getByRole('link', { name: '關於我們' }));
        expect(setPage).toHaveBeenCalledWith('about');
    });

    it('renders copyright, disclaimer and optional children', () => {
        render(<SiteFooter><span data-testid="extra">lang</span></SiteFooter>);
        expect(screen.getByText(/MultiStream Hub\. All rights reserved/)).toBeInTheDocument();
        expect(screen.getByText(/Twitch 或 YouTube 無官方關聯/)).toBeInTheDocument();
        expect(screen.getByTestId('extra')).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: '網站導覽' })).toBeInTheDocument();
    });
});
