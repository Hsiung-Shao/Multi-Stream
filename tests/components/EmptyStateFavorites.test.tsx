// 空畫布的「你的收藏」（2026-09 使用者需求：有收藏的人一進畫布就能一鍵加入正在直播的頻道）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import i18n from '../../src/i18n/i18n';
import type { FavoriteStream } from '../../src/features/favorites/types';

const loadFavoritesToCanvas = vi.fn(async (favs: FavoriteStream[]) => favs.length);
vi.mock('../../src/features/favorites/loadFavoritesToCanvas', () => ({
    loadFavoritesToCanvas: (favs: FavoriteStream[]) => loadFavoritesToCanvas(favs),
}));

import { EmptyStateFavorites, sortFavoritesForEmptyState } from '../../src/components/Canvas/EmptyStateFavorites';
import { CanvasEmptyState } from '../../src/components/Canvas/CanvasEmptyState';

const fav = (id: string, name: string, extra: Partial<FavoriteStream> = {}): FavoriteStream => ({
    id, name, url: `https://www.twitch.tv/${name}`, platform: 'twitch', addedAt: '2026-01-01', ...extra,
});
const seed = (list: FavoriteStream[]) => localStorage.setItem('favoriteStreams', JSON.stringify(list));

describe('EmptyStateFavorites', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        localStorage.clear();
        loadFavoritesToCanvas.mockClear();
    });

    it('直播中在前（觀眾多的優先），其餘依名稱', () => {
        const sorted = sortFavoritesForEmptyState([
            fav('1', 'zed'),
            fav('2', 'alpha'),
            fav('3', 'small', { isLive: true, viewerCount: 10 }),
            fav('4', 'big', { isLive: true, viewerCount: 900 }),
        ]);
        expect(sorted.map(f => f.name)).toEqual(['big', 'small', 'alpha', 'zed']);
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

    it('YouTube 沒開播：停用、標示未開播；Twitch 沒開播仍可加入', () => {
        seed([
            fav('y', 'ytch', { platform: 'youtube', url: 'https://www.youtube.com/channel/UC1', isLive: false }),
            fav('t', 'twch', { isLive: false }),
        ]);
        render(<EmptyStateFavorites />);
        expect(screen.getByTitle('未開播（YouTube 開播後才能加入）')).toBeDisabled();
        expect(screen.getByLabelText('選取 ytch')).toBeDisabled();
        expect(screen.getByTitle('把 twch 加入畫布')).not.toBeDisabled();
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

    it('只有沒開播的 YouTube 收藏（沒有能加入的）：維持功能介紹', () => {
        seed([fav('y', 'ytch', { platform: 'youtube', url: 'https://www.youtube.com/channel/UC1', isLive: false })]);
        render(<CanvasEmptyState />);
        expect(screen.getByText('功能介紹')).toBeInTheDocument();
        expect(screen.queryByText('你的收藏')).toBeNull();
    });

    it('有收藏：「你的收藏」取代功能介紹', () => {
        seed([fav('1', 'a')]);
        render(<CanvasEmptyState />);
        expect(screen.getByText('你的收藏')).toBeInTheDocument();
        expect(screen.queryByText('功能介紹')).toBeNull();
    });
});
