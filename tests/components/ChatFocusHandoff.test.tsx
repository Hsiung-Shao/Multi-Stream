// code review 2026-10-08（a11y）：收合聊天室後焦點不能掉到 body——交給右緣展開標籤；展開後交回聊天室選單按鈕
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import i18n from '../../src/i18n/i18n';
import { useStreamStore } from '../../src/store/useStreamStore';
import { chatsCollapsed } from '../../src/utils/canvasItemOps';
import { ChatLayoutMenu } from '../../src/components/Canvas/ChatLayoutMenu';
import { ChatCollapsedTab } from '../../src/components/Canvas/ChatCollapsedTab';
import { requestChatFocus, consumeChatFocus } from '../../src/components/Canvas/chatFocusIntent';

const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** 與 NewCanvasPage 相同的掛載關係：收合時聊天室（含選單按鈕）卸載、右緣標籤掛載，展開時相反 */
function Harness() {
    const collapsed = useStreamStore(s => chatsCollapsed(s.canvasItems));
    return collapsed ? <ChatCollapsedTab /> : <div data-testid="chat-window"><ChatLayoutMenu /></div>;
}

const flushTimers = () => act(() => new Promise<void>(r => setTimeout(r, 20)));

describe('聊天室收合／展開的焦點交接', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        consumeChatFocus('expand-tab');
        consumeChatFocus('layout-menu');
        useStreamStore.setState({
            streams: [],
            chatColumnWidth: 4,
            canvasItems: [
                { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 20, 12) },
                { i: 'w2', type: 'stream', contentId: 2, layout: L(0, 12, 20, 12) },
                { i: 'chat', type: 'chat', contentId: 1, layout: L(20, 0, 4, 24), sharedChat: true },
            ],
        });
    });

    it('選單「收合」後焦點在展開標籤；按標籤展開後焦點回到聊天室選單按鈕', async () => {
        render(<Harness />);
        const trigger = screen.getByTitle('聊天室寬度與收合');
        trigger.focus();
        fireEvent.keyDown(trigger, { key: 'Enter' });
        fireEvent.click(screen.getByRole('menuitem', { name: '收合聊天室（畫面讓給直播）' }));
        await flushTimers(); // Radix 關閉選單後的 focus 還原跑在 setTimeout 裡，不能把焦點搶走

        const tab = screen.getByRole('button', { name: '展開聊天室' });
        expect(document.activeElement).toBe(tab);

        fireEvent.click(tab);
        await flushTimers();
        expect(screen.queryByRole('button', { name: '展開聊天室' })).toBeNull();
        expect(document.activeElement).toBe(screen.getByTitle('聊天室寬度與收合'));
    });

    it('頁面載入時就是收合狀態：展開標籤不搶焦點（沒有人登記交接）', () => {
        act(() => useStreamStore.getState().collapseChats());
        render(<Harness />);
        expect(document.activeElement).not.toBe(screen.getByRole('button', { name: '展開聊天室' }));
    });

    it('交接登記只能領一次、過期作廢、對象不符不領', () => {
        requestChatFocus('expand-tab');
        expect(consumeChatFocus('layout-menu')).toBe(false);
        expect(consumeChatFocus('expand-tab')).toBe(true);
        expect(consumeChatFocus('expand-tab')).toBe(false);

        const realNow = Date.now;
        try {
            let now = 1_000_000;
            Date.now = () => now;
            requestChatFocus('layout-menu');
            now += 5_000;
            expect(consumeChatFocus('layout-menu')).toBe(false);
        } finally {
            Date.now = realNow;
        }
    });
});
