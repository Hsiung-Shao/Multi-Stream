// F6～F8：貼圖選單（分段順序、搜尋、連選不關選單、最近使用）
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmotePicker } from '../../../src/features/chat/EmotePicker';
import type { EmoteSection } from '../../../src/features/chat/emoteSections';
import { RECENT_KEY, pushRecentEmote, readRecentEmotes } from '../../../src/features/chat/recentEmotes';

const sections: EmoteSection[] = [
    { id: 'ch:alice:7tv', title: 'alice 7TV', emotes: [{ name: 'KappaHD', url: 'https://x/1.png' }, { name: 'LUL', url: 'https://x/2.png' }] },
    { id: 'global:twitch', title: 'Twitch', emotes: [{ name: 'Kappa', url: 'https://x/3.png' }, { name: 'PogChamp', url: 'https://x/4.png' }] },
    { id: 'other:bob:bttv', title: 'bob BTTV', note: 'bob', emotes: [{ name: 'monKap', url: 'https://x/5.png' }, { name: 'catJAM', url: 'https://x/6.png' }] },
];

function open(props: Partial<React.ComponentProps<typeof EmotePicker>> = {}) {
    const onPick = vi.fn();
    render(<EmotePicker sections={sections} onPick={onPick} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /^(貼圖|Emotes|chat\.emote_picker)$/ }));
    return onPick;
}
const sectionIds = () => Array.from(document.querySelectorAll('[data-section-id]')).map((e) => e.getAttribute('data-section-id'));
const search = (v: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value: v } });

beforeEach(() => { localStorage.clear(); });

describe('F6 選單分段順序', () => {
    it('沒有最近使用時：段落依傳入順序渲染', () => {
        open();
        expect(sectionIds().filter((i) => i !== 'recent')).toEqual(['ch:alice:7tv', 'global:twitch', 'other:bob:bttv']);
    });

    it('有最近使用時：recent 段在最前面，其後才是各段落', () => {
        localStorage.setItem(RECENT_KEY, JSON.stringify([{ name: 'LUL', url: 'https://x/2.png' }]));
        open();
        expect(sectionIds()).toEqual(['recent', 'ch:alice:7tv', 'global:twitch', 'other:bob:bttv']);
    });
});

describe('F7 搜尋跨所有段落', () => {
    it('搜「kap」：不同段落含 kap 的都在、不含的都不在', () => {
        open();
        search('kap');
        for (const n of ['KappaHD', 'Kappa', 'monKap']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument();
        for (const n of ['LUL', 'PogChamp', 'catJAM']) expect(screen.queryByRole('button', { name: n })).toBeNull();
    });

    it('搜尋不分大小寫：「KAP」與「kap」結果相同', () => {
        open();
        search('KAP');
        for (const n of ['KappaHD', 'Kappa', 'monKap']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'LUL' })).toBeNull();
    });
});

describe('F8 連續選不關選單並記最近使用', () => {
    it('連點兩個貼圖：onPick 依序呼叫、搜尋框仍在、recent 段第一個是最後點的', () => {
        const onPick = open();
        fireEvent.click(screen.getByRole('button', { name: 'Kappa' }));
        fireEvent.click(screen.getByRole('button', { name: 'LUL' }));

        expect(onPick.mock.calls.map((c) => c[0])).toEqual(['Kappa', 'LUL']);
        expect(screen.getByRole('textbox')).toBeInTheDocument();
        const recent = document.querySelector('[data-section-id="recent"]') as HTMLElement;
        expect(recent).not.toBeNull();
        const btns = within(recent).getAllByRole('button');
        expect(btns[0]).toHaveAccessibleName('LUL');
        expect(btns[1]).toHaveAccessibleName('Kappa');
        expect(readRecentEmotes().map((e) => e.name)).toEqual(['LUL', 'Kappa']);
    });

    it('pushRecentEmote：最新放最前、同名去重（移到最前）', () => {
        const a = { name: 'A', url: 'https://x/a.png' };
        const b = { name: 'B', url: 'https://x/b.png' };
        pushRecentEmote(a);
        pushRecentEmote(b);
        const r = pushRecentEmote(a);
        expect(r.map((e) => e.name)).toEqual(['A', 'B']);
        expect(readRecentEmotes().map((e) => e.name)).toEqual(['A', 'B']);
    });

    it('pushRecentEmote：超過 30 個時留最新的 30 個', () => {
        let r: { name: string }[] = [];
        for (let i = 0; i < 35; i++) r = pushRecentEmote({ name: `e${i}`, url: `https://x/${i}.png` });
        expect(r).toHaveLength(30);
        expect(r[0].name).toBe('e34');
        expect(r[29].name).toBe('e5');
        expect(readRecentEmotes()).toHaveLength(30);
    });

    it('readRecentEmotes：壞資料與非 https 網址被丟掉，非 JSON 時回空陣列', () => {
        localStorage.setItem(RECENT_KEY, JSON.stringify([
            { name: 'ok', url: 'https://x/ok.png' },
            { name: 'http', url: 'http://x/a.png' },
            { name: 'nourl' },
            'str',
            null,
        ]));
        expect(readRecentEmotes()).toEqual([{ name: 'ok', url: 'https://x/ok.png' }]);
        localStorage.setItem(RECENT_KEY, '{not json');
        expect(readRecentEmotes()).toEqual([]);
    });
});

describe('needsReauth 提示', () => {
    const re = /chat\.emote_reauth|重新登入|re-?login|sign in again|reauth/i;
    it('needsReauth 為 true 時顯示重新登入提示', () => {
        open({ needsReauth: true });
        expect(screen.getByText(re)).toBeInTheDocument();
    });
    it('needsReauth 沒給時不顯示提示', () => {
        open();
        expect(screen.queryByText(re)).toBeNull();
    });
});
