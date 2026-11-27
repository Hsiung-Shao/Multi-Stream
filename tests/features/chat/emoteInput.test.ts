// G1～G9：輸入框貼圖縮圖化的純函式（jsdom，不 mock 任何東西）
import { afterEach, describe, expect, it } from 'vitest';
import {
    getInputCaret,
    inputParts,
    renderInput,
    replaceRange,
    serializeInput,
    setInputCaret,
    type InputPart,
} from '../../../src/features/chat/emoteInput';

const URL_JAM = 'https://cdn.example/catJAM.webp';
const URL_KAPPA = 'https://cdn.example/Kappa.png';
const emotes = new Map<string, string>([
    ['catJAM', URL_JAM],
    ['Kappa', URL_KAPPA],
]);

const flatten = (parts: InputPart[]) => parts.map((p) => (p.type === 'emote' ? p.name : p.text)).join('');

const made: HTMLElement[] = [];
const makeEl = () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    document.body.appendChild(el);
    made.push(el);
    return el;
};

afterEach(() => {
    made.splice(0).forEach((el) => el.remove());
    document.getSelection()?.removeAllRanges();
});

describe('G1～G3 inputParts 切段', () => {
    it('G1 貼圖名後面有空白時切成 emote 段、其餘為文字段', () => {
        const parts = inputParts('hi catJAM yo', emotes);
        const emoteParts = parts.filter((p) => p.type === 'emote');
        expect(emoteParts).toEqual([{ type: 'emote', name: 'catJAM', url: URL_JAM }]);
        const textJoined = parts.filter((p): p is Extract<InputPart, { type: 'text' }> => p.type === 'text').map((p) => p.text).join('');
        expect(textJoined).toBe('hi  yo');
        expect(flatten(parts)).toBe('hi catJAM yo');
    });

    it('G2 貼圖名在結尾、後面沒空白時不轉成 emote 段', () => {
        const parts = inputParts('hi catJAM', emotes);
        expect(parts.some((p) => p.type === 'emote')).toBe(false);
        expect(flatten(parts)).toBe('hi catJAM');
    });

    it('G3 連續空白與不認識的字：串回去等於原字串且沒有 emote 段', () => {
        for (const s of ['a  b ', 'foo bar baz', ' ', '', 'catjam ', 'xcatJAM ']) {
            const parts = inputParts(s, emotes);
            expect(flatten(parts)).toBe(s);
            expect(parts.some((p) => p.type === 'emote')).toBe(false);
        }
        // 含 emote 的字串也要能串回原樣（空白不被吃掉）
        for (const s of ['catJAM ', 'a  catJAM  Kappa b', ' Kappa  catJAM ']) {
            expect(flatten(inputParts(s, emotes))).toBe(s);
        }
    });
});

describe('G4～G5 renderInput／serializeInput', () => {
    it('G4 render 後 serialize 等於原文，且 img 的 alt／src／數量正確', () => {
        const el = makeEl();
        const text = 'hi catJAM yo Kappa  end';
        renderInput(el, text, emotes);
        expect(serializeInput(el)).toBe(text);
        const imgs = Array.from(el.querySelectorAll('img'));
        expect(imgs).toHaveLength(2);
        expect(imgs.map((i) => i.getAttribute('alt'))).toEqual(['catJAM', 'Kappa']);
        expect(imgs.map((i) => i.getAttribute('src'))).toEqual([URL_JAM, URL_KAPPA]);
        expect(imgs.every((i) => i.hasAttribute('data-emote'))).toBe(true);
    });

    it('G4b 重畫時會先清空舊內容，不會越疊越多', () => {
        const el = makeEl();
        renderInput(el, 'a catJAM b', emotes);
        renderInput(el, 'x', emotes);
        expect(serializeInput(el)).toBe('x');
        expect(el.querySelectorAll('img')).toHaveLength(0);
    });

    it('G5 編輯區出現 <br> 時 serialize 不帶換行', () => {
        const el = makeEl();
        el.innerHTML = 'hi<br>there<br>';
        expect(serializeInput(el)).toBe('hithere');
        expect(serializeInput(el)).not.toMatch(/[\r\n]/);
    });
});

describe('G6～G8 游標', () => {
    it('G6 選取在 img 之後時，caret 等於 img 前面純文字加 alt 長度', () => {
        const el = makeEl();
        renderInput(el, 'hi catJAM yo', emotes);
        const img = el.querySelector('img')!;
        const range = document.createRange();
        range.setStartAfter(img);
        range.collapse(true);
        const sel = document.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        expect(getInputCaret(el)).toBe('hi catJAM'.length);
    });

    it('G7 setInputCaret 後 getInputCaret 讀回相同位置，超過長度時放結尾', () => {
        const el = makeEl();
        const text = 'hi catJAM yo';
        renderInput(el, text, emotes);
        for (const pos of ['hi catJAM'.length, 0, 3, text.length]) {
            setInputCaret(el, pos);
            expect(getInputCaret(el)).toBe(pos);
        }
        setInputCaret(el, 999);
        expect(getInputCaret(el)).toBe(text.length);
    });

    it('G8 選取在別的元素時，getInputCaret 回 null', () => {
        const el = makeEl();
        renderInput(el, 'hi catJAM yo', emotes);
        const other = document.createElement('div');
        other.textContent = 'elsewhere';
        document.body.appendChild(other);
        made.push(other);
        const range = document.createRange();
        range.setStart(other.firstChild!, 2);
        range.collapse(true);
        const sel = document.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        expect(getInputCaret(el)).toBeNull();
    });
});

describe('G9 replaceRange', () => {
    it('G9 取代區間並把換行換成單一空白，caret 在插入內容之後', () => {
        expect(replaceRange('xyz', 1, 2, 'a\nb')).toEqual({ text: 'xa bz', caret: 4 });
        // \r\n 只算一個空白，不是兩個
        expect(replaceRange('xyz', 1, 2, 'a\r\nb')).toEqual({ text: 'xa bz', caret: 4 });
        // 單獨的 \r 也換成空白
        expect(replaceRange('xyz', 1, 2, 'a\rb')).toEqual({ text: 'xa bz', caret: 4 });
    });
});
