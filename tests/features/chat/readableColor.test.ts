// 使用者自訂的名字顏色在深色底上要看得見
import { describe, it, expect } from 'vitest';
import { readableColor } from '../../../src/features/chat/messageParts';

const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('readableColor', () => {
    it('太暗的顏色（純藍）調亮到深色底上看得見', () => {
        const out = readableColor('#0000FF')!;
        expect(out).toMatch(/^#[0-9a-f]{6}$/i);
        expect(lum(out)).toBeGreaterThanOrEqual(0.35);
    });
    it('夠亮的顏色原樣保留', () => {
        expect(readableColor('#FF7F50')?.toLowerCase()).toBe('#ff7f50');
    });
    it('格式不對時回 undefined，不把字串塞進 style', () => {
        expect(readableColor('red;background:url(x)')).toBeUndefined();
        expect(readableColor(undefined)).toBeUndefined();
    });
});
