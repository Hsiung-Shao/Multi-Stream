// 空畫布的「你的收藏」（2026-09 使用者需求：只列出正在直播的收藏，一鍵加入）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import i18n from '../../src/i18n/i18n';
import type { FavoriteStream } from '../../src/features/favorites/types';

const loadFavoritesToCanvas = vi.fn(async (favs: FavoriteStream[]) => favs.length);
vi.mock('../../src/features/favorites/loadFavoritesToCanvas', () => ({
    loadFavoritesToCanvas: (favs: FavoriteStream[]) => loadFavoritesToCanvas(favs),
}));

import { EmptyStateFavorites, liveFavoritesForEmptyState } from '../../src/components/Canvas/EmptyStateFavorites';
import { CanvasEmptyState } from '../../src/components/Canvas/CanvasEmptyState';

const fav = (id: string, name: string, extra: Partial<FavoriteStream> = {}): FavoriteStream => ({
    id, name, url: `https://www.twitch.tv/${name}`, platform: 'twitch', addedAt: '2026-01-01', isLive: true, ...extra,
});
const seed = (list: FavoriteStream[]) => localStorage.setItem('favoriteStreams', JSON.stringify(list));

describe('EmptyStateFavorites', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        localStorage.clear();
        loadFavoritesToCanvas.mockClear();
    });

    it('只留正在直播的，觀眾多的在前', () => {
        const live = liveFavoritesForEmptyState([
            fav('1', 'offline', { isLive: false }),
            fav('2', 'unknown', { isLive: null }),
            fav('3', 'small', { viewerCount: 10 }),
            fav('4', 'big', { viewerCount: 900 }),
        ]);
        expect(live.map(f => f.name)).toEqual(['big', 'small']);
    });

    it('沒有收藏時不渲染', () => {
        const { container } = render(<EmptyStateFavorites />);
        expect(container.innerHTML).toBe('');
    });

    it('點一下就加入該頻道', async () => {
        seed([fav('1', 'streamer', { isLive: true, viewerCount: 5 })]);
        render(<EmptyStateFavorites />);
        expect(screen.getByText('1 個頻道正在直播')).toBeInTheDocument();
        fireEvent.click(screen.getByTitle('把 streamer 加入畫布'));
        await waitFor(() => expect(loadFavoritesToCanvas).toHaveBeenCalledTimes(1));
        expect(loadFavoritesToCanvas.mock.calls[0][0].map((f: FavoriteStream) => f.id)).toEqual(['1']);
    });

    it('勾選多個後「加入所選（n）」一次加入', async () => {
        seed([fav('1', 'a'), fav('2', 'b'), fav('3', 'c')]);
        render(<EmptyStateFavorites />);
        const addSelected = () => screen.getByRole('button', { name: /加入所選/ });
        expect(addSelected()).toBeDisabled();
        fireEvent.click(screen.getByLabelText('選取 a'));
        fireEvent.click(screen.getByLabelText('選取 c'));
        expect(addSelected()).toHaveTextContent('加入所選（2）');
        fireEvent.click(addSelected());
        await waitFor(() => expect(loadFavoritesToCanvas).toHaveBeenCalledTimes(1));
        expect(loadFavoritesToCanvas.mock.calls[0][0].map((f: FavoriteStream) => f.id).sort()).toEqual(['1', '3']);
    });

    it('勾選後在別處刪掉的收藏：「加入所選」只算仍存在的', async () => {
        seed([fav('1', 'a'), fav('2', 'b')]);
        render(<EmptyStateFavorites />);
        fireEvent.click(screen.getByLabelText('選取 a'));
        fireEvent.click(screen.getByLabelText('選取 b'));
        expect(screen.getByRole('button', { name: /加入所選/ })).toHaveTextContent('加入所選（2）');
        // 別處刪掉 b（收藏服務會廣播 favoritesUpdated）
        seed([fav('1', 'a')]);
        await act(async () => { window.dispatchEvent(new Event('favoritesUpdated')); });
        expect(screen.getByRole('button', { name: /加入所選/ })).toHaveTextContent('加入所選（1）');
    });

    it('沒開播的收藏不列出；全部沒開播時整區不渲染', () => {
        seed([fav('on', 'onair'), fav('off', 'offair', { isLive: false })]);
        const { unmount } = render(<EmptyStateFavorites />);
        expect(screen.getByText('onair')).toBeInTheDocument();
        expect(screen.queryByText('offair')).toBeNull();
        unmount();
        seed([fav('off', 'offair', { isLive: false })]);
        const { container } = render(<EmptyStateFavorites />);
        expect(container.innerHTML).toBe('');
    });

    it('收藏下播（直播狀態更新）時從清單消失，勾選數也跟著扣掉', async () => {
        seed([fav('1', 'a'), fav('2', 'b')]);
        render(<EmptyStateFavorites />);
        fireEvent.click(screen.getByLabelText('選取 a'));
        fireEvent.click(screen.getByLabelText('選取 b'));
        seed([fav('1', 'a'), fav('2', 'b', { isLive: false })]);
        await act(async () => { window.dispatchEvent(new Event('favoritesUpdated')); });
        expect(screen.queryByText('b')).toBeNull();
        expect(screen.getByRole('button', { name: /加入所選/ })).toHaveTextContent('加入所選（1）');
    });
});

describe('CanvasEmptyState', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        localStorage.clear();
    });

    it('沒有收藏：維持功能介紹', () => {
        render(<CanvasEmptyState />);
        expect(screen.getByText('功能介紹')).toBeInTheDocument();
        expect(screen.queryByText('你的收藏')).toBeNull();
        // 導覽「貼連結」那一步要框的中央輸入框
        expect(document.querySelector('[data-tour="quick-add"]')).not.toBeNull();
    });

    it('有收藏但都沒在直播：維持功能介紹', () => {
        seed([fav('t', 'twch', { isLive: false }), fav('y', 'ytch', { platform: 'youtube', url: 'https://www.youtube.com/channel/UC1', isLive: false })]);
        render(<CanvasEmptyState />);
        expect(screen.getByText('功能介紹')).toBeInTheDocument();
        expect(screen.queryByText('你的收藏')).toBeNull();
    });

    it('有收藏正在直播：「你的收藏」取代功能介紹', () => {
        seed([fav('1', 'a')]);
        render(<CanvasEmptyState />);
        expect(screen.getByText('你的收藏')).toBeInTheDocument();
        expect(screen.queryByText('功能介紹')).toBeNull();
    });
});
