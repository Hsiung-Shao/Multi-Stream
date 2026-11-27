// R1～R5：輸入框（可放圖片的編輯區）review 第 1 輪回歸
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatComposer } from '../../../src/features/chat/MergedChat';
import { getInputCaret, serializeInput, setInputCaret } from '../../../src/features/chat/emoteInput';
import type { TwitchChatClient } from '../../../src/features/chat/TwitchChatClient';

const tw = [{ name: 'Kappa', id: '25', ownerId: '0', type: 'globals', url: 'https://x/kappa.png' }];
const emotes = (extra: Record<string, string> = {}) => ({
    twitch: { byName: { Kappa: '25' }, emotes: tw, needsReauth: false },
    owners: {}, follower: {}, channelGroups: {}, global: { '7tv': {}, bttv: {}, ffz: {} }, personal: extra,
});

function setup() {
    const send = vi.fn(() => true);
    const c = { send } as unknown as TwitchChatClient;
    const props = { c, logins: ['xqc'], cred: 'ready' as const };
    const view = render(<ChatComposer {...props} emotes={emotes()} />);
    const box = screen.getByRole('textbox') as HTMLDivElement;
    const type = (value: string) => {
        box.focus();
        box.textContent = value;
        setInputCaret(box, value.length);
        fireEvent.input(box);
    };
    return { send, box, type, rerender: (e: ReturnType<typeof emotes>) => view.rerender(<ChatComposer {...props} emotes={e} />) };
}

afterEach(() => document.getSelection()?.removeAllRanges());

describe('ChatComposer review 回歸', () => {
    it('R1 焦點離開後背景重畫，從選單插入的貼圖仍接在原游標後', () => {
        const { box, type, rerender } = setup();
        type('hello');
        // 焦點移到別處但選取仍留在輸入框（Firefox 開選單時的情況）
        box.blur();
        setInputCaret(box, 5);
        rerender(emotes({ catJAM: 'https://x/cat.png' }));
        act(() => { document.dispatchEvent(new Event('selectionchange')); });
        fireEvent.click(screen.getByRole('button', { name: /^(貼圖|Emotes|chat\.emote_picker)$/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Kappa' }));
        expect(serializeInput(box)).toBe('hello Kappa ');
    });

    it('R2 Safari 選字確認的 Enter（keyCode 229）不送出', () => {
        const { send, box, type } = setup();
        type('你好');
        fireEvent.compositionEnd(box);
        fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 });
        expect(send).not.toHaveBeenCalled();
    });

    it('R3 一般打字不換掉文字節點（保留瀏覽器的復原紀錄）', () => {
        const { box, type } = setup();
        type('hel');
        const node = box.firstChild!;
        (node as Text).nodeValue = 'hell';
        setInputCaret(box, 4);
        fireEvent.input(box);
        expect(box.firstChild).toBe(node);
        expect(box.textContent).toBe('hell');
    });

    it('R4 貼上超過字數時截到剩餘字數', () => {
        const { box, type } = setup();
        type('a'.repeat(495));
        fireEvent.paste(box, { clipboardData: { getData: () => 'bcdefghij' } });
        expect(box.textContent).toBe('a'.repeat(495) + 'bcdef');
    });

    it('R5 選字中按送出：送出畫面上的內容，輸入框清空', () => {
        const { send, box, type } = setup();
        type('hi');
        fireEvent.compositionStart(box);
        box.textContent = 'hi 你好';
        fireEvent.click(screen.getByRole('button', { name: /送出|Send|chat\.send/ }));
        expect(send).toHaveBeenCalledWith('xqc', 'hi 你好', expect.anything());
        fireEvent.compositionEnd(box);
        expect(box.textContent).toBe('');
    });

    it('R6 復原／重做回到上一步內容，游標在結尾', () => {
        const { box, type } = setup();
        type('hi');
        type('hi Kappa ');
        const history = (inputType: string) => {
            const e = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
            act(() => { box.dispatchEvent(e); });
            return e.defaultPrevented;
        };
        expect(history('historyUndo')).toBe(true);
        expect(serializeInput(box)).toBe('hi');
        expect(getInputCaret(box)).toBe(2);
        history('historyRedo');
        expect(serializeInput(box)).toBe('hi Kappa ');
        expect(box.querySelector('img')?.alt).toBe('Kappa');
    });

    it('R7 Ctrl+Z／Ctrl+Y 快捷鍵直接復原重做（瀏覽器紀錄是空的也要有效）', () => {
        const { box, type } = setup();
        type('a');
        type('a b');
        fireEvent.keyDown(box, { key: 'z', ctrlKey: true });
        expect(serializeInput(box)).toBe('a');
        fireEvent.keyDown(box, { key: 'y', ctrlKey: true });
        expect(serializeInput(box)).toBe('a b');
        fireEvent.keyDown(box, { key: 'Z', metaKey: true, shiftKey: true });
        expect(serializeInput(box)).toBe('a b');
        fireEvent.keyDown(box, { key: 'z', metaKey: true });
        fireEvent.keyDown(box, { key: 'Z', metaKey: true, shiftKey: true });
        expect(serializeInput(box)).toBe('a b');
    });
});
