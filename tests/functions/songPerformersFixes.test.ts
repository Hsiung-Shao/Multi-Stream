// 歌回合唱／剪輯來源 review 修正（2026-11-06）：剪輯網址收緊（E）與百分比編碼解碼（F）
import { describe, it, expect } from 'vitest';
import { normalizeClipSource, CLIP_URL_RE } from '../../functions/lib/songs.js';

describe('E 剪輯網址收緊', () => {
    it('E1 handle 含反斜線、..、百分比編碼的路徑跳脫 → 拒絕', () => {
        for (const url of [
            'https://www.youtube.com/@a\\..\\logout',
            'https://www.youtube.com/@a..b',
            'https://www.youtube.com/@a%2F..%2Flogout',
            'https://www.youtube.com/@a%5C..%5Clogout',
        ]) {
            expect(normalizeClipSource('x', url).ok, url).toBe(false);
        }
    });

    it('E2 正常 handle（含 . _ -）仍可通過', () => {
        for (const url of ['https://www.youtube.com/@zz.clip_ch-1', 'https://www.youtube.com/@hyur0udr']) {
            expect(normalizeClipSource('x', url)).toEqual({ ok: true, value: { name: 'x', url } });
        }
    });

    it('E3 CLIP_URL_RE 直接拒絕反斜線與 ..', () => {
        expect(CLIP_URL_RE.test('https://www.youtube.com/@a\\b')).toBe(false);
        expect(CLIP_URL_RE.test('https://www.youtube.com/@a..b')).toBe(false);
    });
});

describe('F 中日韓 handle 的百分比編碼', () => {
    it('F1 oEmbed 給的百分比編碼網址解碼後存成原文，12 個中文字也能過', () => {
        const handle = '剪輯小幫手頻道很長很長的名字';
        const encoded = `https://www.youtube.com/@${encodeURIComponent(handle)}`;
        expect(encoded.length).toBeGreaterThan(100);
        expect(normalizeClipSource('x', encoded)).toEqual({ ok: true, value: { name: 'x', url: `https://www.youtube.com/@${handle}` } });
    });

    it('F3 解碼後含控制字元或隱形格式字元（NUL、RLO、零寬）→ 拒絕', () => {
        for (const url of ['https://www.youtube.com/@a%00', 'https://www.youtube.com/@a%01', 'https://www.youtube.com/@a%E2%80%AE', 'https://www.youtube.com/@a%E2%80%8B']) {
            expect(normalizeClipSource('x', url).ok, url).toBe(false);
        }
    });

    it('F2 解碼失敗（壞的百分比序列）→ 拒絕', () => {
        expect(normalizeClipSource('x', 'https://www.youtube.com/@%E5%').ok).toBe(false);
    });
});
