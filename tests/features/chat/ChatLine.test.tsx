// C5：聊天訊息渲染的 XSS 防護
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatLine } from '../../../src/features/chat/MergedChat';
import type { ChatMessage } from '../../../src/features/chat/ircParse';

const msg = (text: string): ChatMessage => ({
    id: 'm1', channel: 'chan', user: 'u', displayName: 'U', text, emotes: [], ts: 1, action: false,
});
const none = new Map<string, string>();

describe('C5 HTML 與 javascript: 不被執行', () => {
    it('訊息含 <img onerror> 與 javascript: 連結：DOM 沒有 img[onerror]、沒有 javascript: 的 a', () => {
        const { container } = render(
            <ChatLine message={msg('<img src=x onerror=alert(1)> javascript:alert(1)')} emotes={none} />,
        );
        expect(container.querySelector('img[onerror]')).toBeNull();
        expect(container.querySelector('img')).toBeNull();
        const bad = Array.from(container.querySelectorAll('a')).filter((a) =>
            (a.getAttribute('href') ?? '').trim().toLowerCase().startsWith('javascript:'),
        );
        expect(bad).toHaveLength(0);
        // 原文仍以文字顯示，沒被吞掉
        expect(container.textContent).toContain('onerror=alert(1)');
        expect(container.textContent).toContain('javascript:alert(1)');
    });

    it('http(s) 連結：渲染成 a，rel 含 noopener 與 nofollow，且 href 正確', () => {
        const { container } = render(<ChatLine message={msg('看這個 https://example.com/x?y=1 喔')} emotes={none} />);
        const a = container.querySelector('a')!;
        expect(a).not.toBeNull();
        expect(a.getAttribute('href')).toBe('https://example.com/x?y=1');
        const rel = a.getAttribute('rel') ?? '';
        expect(rel).toContain('noopener');
        expect(rel).toContain('nofollow');
    });

    it('第三方表情：渲染成 img，src 為對照表的 url', () => {
        const { container } = render(
            <ChatLine message={msg('KEKW')} emotes={new Map([['KEKW', 'https://cdn.example/kekw.png']])} />,
        );
        expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/kekw.png');
    });
});
