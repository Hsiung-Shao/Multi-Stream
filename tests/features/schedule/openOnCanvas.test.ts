import { describe, expect, it } from 'vitest';
import { CANVAS_MAX_STREAMS, openOnCanvas, toOpenTargets } from '../../../src/features/schedule/openOnCanvas';
import { canvasInput, thumbnailUrl, watchUrl } from '../../../src/features/schedule/streamLinks';
import { makeSnapshot } from './fixtures';

describe('streamLinks', () => {
    const snap = makeSnapshot();
    it('YouTube 用 watch 網址與 hqdefault 縮圖', () => {
        const s = snap.upcoming[0];
        expect(watchUrl(s, snap.channels.v1)).toBe('https://www.youtube.com/watch?v=TaiOneWait1');
        expect(canvasInput(s, snap.channels.v1)).toBe('https://www.youtube.com/watch?v=TaiOneWait1');
        expect(thumbnailUrl(s, snap.channels.v1)).toBe('https://i.ytimg.com/vi/TaiOneWait1/hqdefault.jpg');
    });
    it('Twitch 用 login；沒有 login 回 null', () => {
        const s = snap.live[0];
        expect(watchUrl(s, snap.channels.v1)).toBe('https://www.twitch.tv/TaiOne');
        expect(canvasInput(s, snap.channels.v1)).toBe('TaiOne');
        expect(thumbnailUrl(s, snap.channels.v1)).toBe('https://static-cdn.jtvnw.net/previews-ttv/live_user_TaiOne-640x360.jpg');
        expect(canvasInput(s, { name: 'x', nationality: 'TW' })).toBeNull();
    });
});

describe('toOpenTargets', () => {
    it('去重、略過沒有輸入的、帶實況主名稱', () => {
        const snap = makeSnapshot();
        const targets = toOpenTargets([snap.live[0], snap.live[0], snap.upcoming[0], { ...snap.live[2], vtuber_id: 'missing' }], snap.channels);
        expect(targets).toEqual([
            { input: 'TaiOne', displayName: '台一' },
            { input: 'https://www.youtube.com/watch?v=TaiOneWait1', displayName: '台一' },
        ]);
    });
});

describe('openOnCanvas', () => {
    const targets = Array.from({ length: 5 }, (_, i) => ({ input: `ch${i}`, displayName: `n${i}` }));

    it('依序呼叫（前一個完成才開始下一個），並帶聊天室與名稱', async () => {
        const order: string[] = [];
        let active = 0;
        const add = async (url: string, opts: { displayName?: string; withChat?: boolean }) => {
            active++;
            expect(active).toBe(1);
            order.push(`${url}|${opts.displayName}|${opts.withChat}`);
            await new Promise((r) => setTimeout(r, 1));
            active--;
            return { success: true };
        };
        const res = await openOnCanvas(targets.slice(0, 3), 0, add);
        expect(order).toEqual(['ch0|n0|true', 'ch1|n1|true', 'ch2|n2|true']);
        expect(res).toEqual({ added: 3, failed: 0, skipped: 0 });
    });

    it('只加到剩餘路數；失敗與例外都算 failed', async () => {
        const calls: string[] = [];
        const add = async (url: string) => {
            calls.push(url);
            if (url === 'ch0') return { success: false, message: 'bad' };
            if (url === 'ch1') throw new Error('boom');
            return { success: true };
        };
        const res = await openOnCanvas(targets, CANVAS_MAX_STREAMS - 3, add);
        expect(calls).toEqual(['ch0', 'ch1', 'ch2']);
        expect(res).toEqual({ added: 1, failed: 2, skipped: 2 });
    });

    it('畫布已滿：一個都不加', async () => {
        const res = await openOnCanvas(targets, CANVAS_MAX_STREAMS, async () => ({ success: true }));
        expect(res).toEqual({ added: 0, failed: 0, skipped: 5 });
    });
});
