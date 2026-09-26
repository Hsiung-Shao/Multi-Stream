// 首頁／空畫布的大搜尋框（取代 StreamUrlQuickAdd，原本的案例保留）：
// 與動態島搜尋框共用 useStreamSearch，功能一致——貼網址、打名稱即時搜尋、Twitch／YouTube 切換。
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import i18n from '../../src/i18n/i18n';

const { mockAddStream, mockSetPage, mockSearchTwitch, mockSearchYoutube } = vi.hoisted(() => ({
    mockAddStream: vi.fn(),
    mockSetPage: vi.fn(),
    mockSearchTwitch: vi.fn(),
    mockSearchYoutube: vi.fn(),
}));

vi.mock('../../src/store/useStreamStore', () => ({
    useStreamStore: (selector: (s: { addStream: typeof mockAddStream }) => unknown) =>
        selector({ addStream: mockAddStream }),
}));
vi.mock('../../src/store/useUIStore', () => ({
    useUIStore: (selector: (s: object) => unknown) =>
        selector({ setPage: mockSetPage, isSearchFocused: false, setSearchFocused: vi.fn() }),
}));
vi.mock('../../src/features/twitch/TwitchService', () => ({ twitchService: { searchChannels: mockSearchTwitch } }));
vi.mock('../../src/features/youtube/searchYoutubeChannels', () => ({ searchYoutubeChannels: mockSearchYoutube }));

import { StreamSearchBox } from '../../src/components/StreamSearchBox';

const twitchHit = (login: string) => ({
    id: login, displayName: login, login, isLive: true, gameName: 'Music', url: `https://www.twitch.tv/${login}`,
});
/** 讓防抖計時、動態 import 的搜尋模組與 lazy 結果清單、搜尋 promise 都跑完 */
const flush = async (ms = 600) => {
    await act(async () => { vi.advanceTimersByTime(ms); });
    for (let i = 0; i < 3; i++) {
        await act(async () => { await vi.dynamicImportSettled(); await Promise.resolve(); });
    }
};
const input = () => screen.getByRole('textbox') as HTMLInputElement;
const type = (v: string) => fireEvent.change(input(), { target: { value: v } });
const submit = async () => { await act(async () => { fireEvent.submit(input().closest('form')!); }); };

describe('StreamSearchBox', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        vi.useFakeTimers();
        mockAddStream.mockReset();
        mockSetPage.mockReset();
        mockSearchTwitch.mockReset().mockResolvedValue([]);
        mockSearchYoutube.mockReset().mockResolvedValue([]);
    });
    afterEach(() => { vi.useRealTimers(); });

    it('貼網址：直接加入、清空輸入，navigateToCanvas 時導向畫布；網址不觸發搜尋', async () => {
        mockAddStream.mockResolvedValue({ success: true, streamId: 1 });
        render(<StreamSearchBox navigateToCanvas />);
        type('https://twitch.tv/somechannel');
        await flush();
        expect(mockSearchTwitch).not.toHaveBeenCalled();
        await submit();
        expect(mockAddStream).toHaveBeenCalledWith('https://twitch.tv/somechannel');
        expect(mockSetPage).toHaveBeenCalledWith('canvas');
        expect(input().value).toBe('');
    });

    it('打 Twitch 頻道 ID 馬上送出（還沒搜完）：照舊當頻道 ID 加入；不導向模式不呼叫 setPage', async () => {
        mockAddStream.mockResolvedValue({ success: true });
        render(<StreamSearchBox />);
        type('somechannel');
        await submit();
        expect(mockAddStream).toHaveBeenCalledWith('somechannel');
        expect(mockSetPage).not.toHaveBeenCalled();
    });

    it('失敗：框下方顯示訊息（role=alert），不導向', async () => {
        mockAddStream.mockResolvedValue({ success: false, message: '找不到頻道' });
        render(<StreamSearchBox navigateToCanvas />);
        type('https://twitch.tv/bad');
        await submit();
        expect(screen.getByRole('alert')).toHaveTextContent('找不到頻道');
        expect(mockSetPage).not.toHaveBeenCalled();
        expect(input()).toHaveAttribute('aria-invalid', 'true');
    });

    it('空輸入：送出不呼叫 addStream', async () => {
        render(<StreamSearchBox />);
        await submit();
        expect(mockAddStream).not.toHaveBeenCalled();
    });

    it('打名稱停一下會列出搜尋結果，點結果就加入並導向', async () => {
        mockSearchTwitch.mockResolvedValue([twitchHit('lofigirl')]);
        mockAddStream.mockResolvedValue({ success: true });
        render(<StreamSearchBox navigateToCanvas />);
        type('lofi');
        await flush();
        expect(mockSearchTwitch).toHaveBeenCalledWith('lofi', 5);
        const results = document.querySelector('[data-search-results]')!;
        expect(results).not.toBeNull();
        await act(async () => { fireEvent.mouseDown(screen.getByText('lofigirl')); });
        expect(mockAddStream).toHaveBeenCalledWith('https://www.twitch.tv/lofigirl');
        expect(mockSetPage).toHaveBeenCalledWith('canvas');
    });

    it('Enter 只取「這次查詢」的結果：還在防抖時送出，不會加入上一次查詢的第一筆', async () => {
        mockSearchTwitch.mockResolvedValue([twitchHit('lof_stale')]);
        mockAddStream.mockResolvedValue({ success: true });
        render(<StreamSearchBox />);
        type('lof');
        await flush();
        expect(screen.getByText('lof_stale')).toBeInTheDocument();
        type('lofi'); // 還沒過防抖，清單仍是 lof 的結果
        await submit();
        expect(mockAddStream).toHaveBeenCalledWith('lofi');
        expect(mockAddStream).not.toHaveBeenCalledWith('https://www.twitch.tv/lof_stale');
    });

    it('清空後，晚回來的舊搜尋結果不會把清單重新打開', async () => {
        let resolve!: (v: unknown) => void;
        mockSearchTwitch.mockImplementation(() => new Promise(r => { resolve = r; }));
        render(<StreamSearchBox />);
        type('lofi');
        await act(async () => { vi.advanceTimersByTime(600); }); // 搜尋已送出、還沒回來
        type('');
        await act(async () => { resolve([twitchHit('late')]); await Promise.resolve(); });
        await flush(0); // 結果清單是 lazy 載入：等它載好再斷言，否則單獨跑這條會假綠
        expect(document.querySelector('[data-search-results]')).toBeNull();
        expect(screen.queryByText('late')).toBeNull();
    });

    it('切到 YouTube：提示字改變，打名稱改搜本站 YouTube／VTuber 資料', async () => {
        render(<StreamSearchBox />);
        expect(input().placeholder).toBe('貼上網址，或搜尋 Twitch 頻道');
        fireEvent.click(document.querySelector('[data-search-platform]')!);
        expect(input().placeholder).toBe('貼上網址，或搜尋 VTuber／YouTube 頻道');
        type('ぺこら');
        await flush();
        expect(mockSearchYoutube).toHaveBeenCalledWith('ぺこら', 8);
        expect(mockSearchTwitch).not.toHaveBeenCalled();
    });
});
