import { render, screen, fireEvent } from '@testing-library/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouteLink } from '../../../src/components/Navigation/RouteLink';
import { PAGE_PATHS, pathToPage, pageToPath } from '../../../src/config/routes';

const { mockSetPage } = vi.hoisted(() => ({ mockSetPage: vi.fn() }));

vi.mock('../../../src/store/useUIStore', () => ({
    useUIStore: (selector: (s: { setPage: typeof mockSetPage }) => unknown) => selector({ setPage: mockSetPage }),
}));

describe('RouteLink', () => {
    beforeEach(() => {
        mockSetPage.mockClear();
    });

    it('渲染真實 <a href>，href 來自 PAGE_PATHS', () => {
        render(<RouteLink to="about">關於</RouteLink>);
        const link = screen.getByRole('link', { name: '關於' });
        expect(link).toHaveAttribute('href', PAGE_PATHS.about);
        expect(link.getAttribute('href')).toBe('/about');
    });

    it('純左鍵點擊：preventDefault 並走 client-side 路由 setPage', () => {
        render(<RouteLink to="faq">FAQ</RouteLink>);
        const link = screen.getByRole('link', { name: 'FAQ' });
        // fireEvent.click 回傳 false 代表 defaultPrevented
        const notPrevented = fireEvent.click(link, { button: 0 });
        expect(notPrevented).toBe(false);
        expect(mockSetPage).toHaveBeenCalledTimes(1);
        expect(mockSetPage).toHaveBeenCalledWith('faq');
    });

    it.each([
        ['ctrlKey', { ctrlKey: true }],
        ['metaKey', { metaKey: true }],
        ['shiftKey', { shiftKey: true }],
        ['altKey', { altKey: true }],
        ['middle button', { button: 1 }],
    ])('修飾鍵/中鍵（%s）：交給瀏覽器原生行為，不呼叫 setPage', (_label, init) => {
        render(<RouteLink to="canvas">Canvas</RouteLink>);
        const link = screen.getByRole('link', { name: 'Canvas' });
        const notPrevented = fireEvent.click(link, { button: 0, ...init });
        expect(notPrevented).toBe(true);
        expect(mockSetPage).not.toHaveBeenCalled();
    });

    it('target="_blank"：不攔截', () => {
        render(<RouteLink to="privacy" target="_blank">隱私</RouteLink>);
        const notPrevented = fireEvent.click(screen.getByRole('link', { name: '隱私' }), { button: 0 });
        expect(notPrevented).toBe(true);
        expect(mockSetPage).not.toHaveBeenCalled();
    });

    it('外部 onClick 先執行；若它已 preventDefault 就不導頁', () => {
        const onClick = vi.fn((e: ReactMouseEvent<HTMLAnchorElement>) => e.preventDefault());
        render(<RouteLink to="home" onClick={onClick}>首頁</RouteLink>);
        fireEvent.click(screen.getByRole('link', { name: '首頁' }), { button: 0 });
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(mockSetPage).not.toHaveBeenCalled();
    });

    it('轉發 className / id 等 anchor 屬性', () => {
        render(<RouteLink to="instructions" id="landing-start-btn" className="btn">教學</RouteLink>);
        const link = screen.getByRole('link', { name: '教學' });
        expect(link).toHaveAttribute('id', 'landing-start-btn');
        expect(link).toHaveClass('btn');
    });
});

describe('routes 對照表', () => {
    it('pathToPage 與 pageToPath 互為反函數（含舊版 .html 別名與 404）', () => {
        expect(pathToPage('/')).toBe('home');
        expect(pathToPage('/index.html')).toBe('home');
        expect(pathToPage('/about.html')).toBe('about');
        expect(pathToPage('/privacy.html')).toBe('privacy');
        expect(pathToPage('/canvas')).toBe('canvas');
        expect(pathToPage('/admin')).toBe('admin');
        expect(pathToPage('/does-not-exist')).toBe('not-found');

        expect(pageToPath('home')).toBe('/');
        expect(pageToPath('faq')).toBe('/faq');
        expect(pageToPath('not-found')).toBeNull();
        expect(pageToPath('settings')).toBe('/');
    });
});
