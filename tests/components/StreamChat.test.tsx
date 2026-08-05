import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamChat } from '../../src/components/StreamChat';

// i18n 未初始化時 t() 會回傳 key 本身，因此以 key 當作查找依據
const POPOUT_LABEL = 'chat.popout';

describe('StreamChat', () => {
    let openSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    });

    afterEach(() => {
        openSpy.mockRestore();
    });

    describe('iframe sandbox 權限', () => {
        // 這兩個權限是「能不能在聊天室發言」的關鍵：
        // allow-forms 讓訊息送得出去，allow-storage-access-by-user-activation 讓
        // Twitch/YouTube 能向瀏覽器索取第三方 cookie，iframe 內才可能維持登入態。
        it('Twitch 聊天室帶有發言所需的 sandbox 權限', () => {
            const { container } = render(<StreamChat platform="twitch" channelId="somechannel" />);
            const sandbox = container.querySelector('iframe')!.getAttribute('sandbox')!;

            expect(sandbox).toContain('allow-forms');
            expect(sandbox).toContain('allow-storage-access-by-user-activation');
            // 原有權限不可退化
            expect(sandbox).toContain('allow-scripts');
            expect(sandbox).toContain('allow-same-origin');
            expect(sandbox).toContain('allow-popups');
        });

        it('YouTube 聊天室帶有相同權限', () => {
            const { container } = render(<StreamChat platform="youtube" channelId="c1" videoId="vid123" />);
            const sandbox = container.querySelector('iframe')!.getAttribute('sandbox')!;

            expect(sandbox).toContain('allow-forms');
            expect(sandbox).toContain('allow-storage-access-by-user-activation');
        });
    });

    describe('另開視窗按鈕', () => {
        it('Twitch 開啟的是 popout 聊天室網址，且不帶 parent 參數', () => {
            render(<StreamChat platform="twitch" channelId="somechannel" />);

            fireEvent.click(screen.getByTitle(POPOUT_LABEL));

            expect(openSpy).toHaveBeenCalledTimes(1);
            const [url, target, features] = openSpy.mock.calls[0] as [string, string, string];
            expect(url).toBe('https://www.twitch.tv/popout/somechannel/chat?popout=');
            // 新視窗必須是第一方情境，帶 parent 會退回嵌入模式
            expect(url).not.toContain('parent=');
            expect(target).toBe('_blank');
            // 防止第三方頁面透過 window.opener 反向操作本站
            expect(features).toContain('noopener');
        });

        it('YouTube 開啟的是 live_chat 網址，且不帶 embed_domain', () => {
            render(<StreamChat platform="youtube" channelId="c1" videoId="vid123" />);

            fireEvent.click(screen.getByTitle(POPOUT_LABEL));

            const [url] = openSpy.mock.calls[0] as [string];
            expect(url).toContain('https://www.youtube.com/live_chat?v=vid123');
            expect(url).not.toContain('embed_domain');
        });

        it('YouTube 沒有 videoId 時不顯示按鈕（無從組出聊天室網址）', () => {
            // 沒有 videoId 的 YouTube 會走「No Chat Configured」分支
            const { container } = render(<StreamChat platform="youtube" channelId="c1" />);
            expect(screen.queryByTitle(POPOUT_LABEL)).toBeNull();
            expect(container.querySelector('iframe')).toBeNull();
        });
    });

    describe('showToolbar', () => {
        it('預設渲染自帶工具列', () => {
            render(<StreamChat platform="twitch" channelId="somechannel" />);
            expect(screen.getByTitle(POPOUT_LABEL)).toBeInTheDocument();
        });

        it('關閉時不渲染工具列，iframe 仍保有原本的填滿樣式', () => {
            // 呼叫端（如 CanvasStreamContent）已有自己的視窗工具列，不該疊第二條
            const { container } = render(
                <StreamChat platform="twitch" channelId="somechannel" showToolbar={false} />
            );

            expect(screen.queryByTitle(POPOUT_LABEL)).toBeNull();
            const iframe = container.querySelector('iframe')!;
            expect(iframe.className).toContain('h-full');
            // 沒有多包一層 wrapper
            expect(container.firstChild).toBe(iframe);
        });

        it('關閉工具列時 className 仍套用到 iframe 本身', () => {
            const { container } = render(
                <StreamChat platform="twitch" channelId="c" showToolbar={false} className="custom-x" />
            );
            expect(container.querySelector('iframe')!.className).toContain('custom-x');
        });
    });
});
