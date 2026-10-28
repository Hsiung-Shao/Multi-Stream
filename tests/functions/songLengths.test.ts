// 歌曲長度查詢：請求驗證、iTunes 網址、結果配對（純函式）
import { describe, it, expect } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { parseLengthsBody, LENGTHS_ITEMS_MAX, ITUNES_COUNTRIES, itunesUrl, pickItunesMatch } from '../../functions/lib/song-lengths.js';

const item = (trackName: string, artistName: string, ms: number) => ({ trackName, artistName, trackTimeMillis: ms });
const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `歌${i}` }));

describe('常數', () => {
    it('筆數上限 60、查詢國家 TW／JP／US', () => {
        expect(LENGTHS_ITEMS_MAX).toBe(60);
        expect(ITUNES_COUNTRIES).toEqual(['TW', 'JP', 'US']);
    });
});

describe('parseLengthsBody', () => {
    const bad = { ok: false, error: 'invalid_payload' };

    it('L4 請求格式不合法時回 invalid_payload', () => {
        const cases: unknown[] = [
            null, 'x', 5, [],
            {}, { items: 'x' }, { items: {} },
            { items: [] }, { items: mk(61) },
            { items: [{ title: '   ' }] }, { items: [{ title: 123 }] }, { items: [{}] },
            { items: [{ title: 'a'.repeat(201) }] },
            { items: [{ title: '歌', artist: 5 }] }, { items: [{ title: '歌', artist: 'a'.repeat(201) }] },
            { items: [{ title: '歌' }, { title: '' }] },
        ];
        for (const c of cases) expect(parseLengthsBody(c)).toEqual(bad);
    });

    it('L4 邊界：1 筆、60 筆、title 剛好 200 字都合法', () => {
        expect(parseLengthsBody({ items: mk(1) }).ok).toBe(true);
        expect(parseLengthsBody({ items: mk(60) }).ok).toBe(true);
        expect(parseLengthsBody({ items: [{ title: 'a'.repeat(200) }] }).ok).toBe(true);
    });

    it('L4b 合法請求會 trim 並把空原唱轉 null', () => {
        const r = parseLengthsBody({ items: [{ title: '  千鳥 ', artist: '  ' }] });
        expect(r).toEqual({ ok: true, items: [{ title: '千鳥', artist: null }] });
    });

    it('L4b 原唱省略、null、有值時分別為 null、null、trim 後字串', () => {
        const r = parseLengthsBody({ items: [{ title: 'A' }, { title: 'B', artist: null }, { title: 'C', artist: ' ヨルシカ ' }] });
        expect(r.items.map((i: { artist: string | null }) => i.artist)).toEqual([null, null, 'ヨルシカ']);
    });
});

describe('itunesUrl', () => {
    it('L5 帶齊查詢參數', () => {
        const u = new URL(itunesUrl('千鳥', 'ヨルシカ', 'JP'));
        expect(u.host).toBe('itunes.apple.com');
        expect(u.searchParams.get('entity')).toBe('song');
        expect(u.searchParams.get('limit')).toBe('10');
        expect(u.searchParams.get('country')).toBe('JP');
        expect(u.searchParams.get('term')).toBe('千鳥 ヨルシカ');
    });
});

describe('pickItunesMatch', () => {
    it('L3 要歌名與原唱都符合，並排除 live、長度不合理的結果', () => {
        const results = [
            item('千鳥', '別的歌手', 200000),
            item('千鳥 (Live)', 'ヨルシカ', 210000),
            item('千鳥', 'ヨルシカ', 30000),
            item('千鳥', 'ヨルシカ', 233400),
        ];
        expect(pickItunesMatch(results, '千鳥', 'ヨルシカ')).toEqual({ seconds: 233, matched: '千鳥 / ヨルシカ' });
    });

    it('L3 秒數 60 與 900 含邊界，59 與 901 排除', () => {
        expect(pickItunesMatch([item('歌', '手', 60000)], '歌', '手')?.seconds).toBe(60);
        expect(pickItunesMatch([item('歌', '手', 900000)], '歌', '手')?.seconds).toBe(900);
        expect(pickItunesMatch([item('歌', '手', 59000)], '歌', '手')).toBeNull();
        expect(pickItunesMatch([item('歌', '手', 901000)], '歌', '手')).toBeNull();
    });

    it('L3 歌名正規化：大小寫、標點、空白、全形不影響', () => {
        const r = pickItunesMatch([item('Ｓtay-Gold!', 'ＡＢ', 180000)], 'stay gold', 'ab');
        expect(r?.seconds).toBe(180);
    });

    it('L3 remix／inst／karaoke／伴奏 版本排除，但 title 本身含該字時不排除', () => {
        expect(pickItunesMatch([item('歌 (Remix)', '手', 180000)], '歌', '手')).toBeNull();
        expect(pickItunesMatch([item('歌 Instrumental', '手', 180000)], '歌', '手')).toBeNull();
        expect(pickItunesMatch([item('歌 Karaoke', '手', 180000)], '歌', '手')).toBeNull();
        expect(pickItunesMatch([item('歌 伴奏', '手', 180000)], '歌', '手')).toBeNull();
        expect(pickItunesMatch([item('Dance Remix', '手', 180000)], 'Dance Remix', '手')?.seconds).toBe(180);
    });

    it('L3 排除版本後仍會往後找到正確那筆', () => {
        const r = pickItunesMatch([item('歌 live', '手', 180000), item('歌', '手', 200000)], '歌', '手');
        expect(r?.seconds).toBe(200);
    });

    it('L3b 沒有原唱時不配對', () => {
        expect(pickItunesMatch([item('歌', '手', 180000)], '歌', null)).toBeNull();
    });

    it('L3c 原唱寫法包含關係（任一邊包含另一邊）也算符合', () => {
        const r = pickItunesMatch([item('City of Stars', 'Ryan Gosling & Emma Stone', 150000)], 'City of Stars', 'Ryan Gosling');
        expect(r).toEqual({ seconds: 150, matched: 'City of Stars / Ryan Gosling & Emma Stone' });
        const r2 = pickItunesMatch([item('City of Stars', 'Ryan Gosling', 150000)], 'City of Stars', 'Ryan Gosling & Emma Stone');
        expect(r2?.seconds).toBe(150);
    });

    it('L3 歌名不含 title、或原唱完全不相干時不配對；空結果回 null', () => {
        expect(pickItunesMatch([item('別首', '手', 180000)], '歌', '手')).toBeNull();
        expect(pickItunesMatch([item('歌', '另一人', 180000)], '歌', '手')).toBeNull();
        expect(pickItunesMatch([], '歌', '手')).toBeNull();
    });
});
