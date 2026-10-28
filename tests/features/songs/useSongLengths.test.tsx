// useSongLengths：分批（伺服器每請求只查 8 首）、暫時失敗的指數退避、retryAfter
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSongLengths, type SongLengthQuery } from '../../../src/features/songs/hooks/useSongLengths';

type Call = { items: SongLengthQuery[] };
let calls: Call[] = [];
let respond: (call: Call, n: number) => Response | Promise<Response> | never;

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
const songs = (n: number): SongLengthQuery[] => Array.from({ length: n }, (_, i) => ({ title: `歌${i}`, artist: `手${i}` }));
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
// 分段前進：每段結束 React 才會把狀態更新（version）刷出去、重跑 effect
const run = async (totalMs: number, stepMs = 700) => {
    for (let t = 0; t < totalMs; t += stepMs) await advance(stepMs);
};

beforeEach(() => {
    calls = [];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
        const call = { items: JSON.parse(String(init?.body)).items } as Call;
        calls.push(call);
        return respond(call, calls.length);
    }));
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

// 同一份查詢陣列要保持身分，否則 hook 每次 render 都重算 todo（呼叫端用 useMemo）
const mount = (queries: SongLengthQuery[]) => renderHook(() => useSongLengths(queries));

describe('useSongLengths 分批與重試', () => {
    it('H1 12 首未知、第一批只回 8 首結果＋4 首 pending（無 retryAfter），會自動送第二批查剩下 4 首', async () => {
        const q = songs(12);
        respond = (call, n) =>
            n === 1
                ? json({ ok: true, items: call.items.map((_, i) => (i < 8 ? { seconds: 200 + i, source: 'itunes' } : { seconds: null, source: 'pending' })) })
                : json({ ok: true, items: call.items.map(() => ({ seconds: 250, source: 'itunes' })) });
        const { result } = mount(q);

        await advance(700);
        expect(calls).toHaveLength(1);
        expect(calls[0].items).toHaveLength(12);

        // 沒輪到的不是失敗：不退避，debounce 後立刻接著送；第二批只含沒查到的 4 首
        await advance(700);
        expect(calls).toHaveLength(2);
        expect(calls[1].items.map((x) => x.title)).toEqual(['歌8', '歌9', '歌10', '歌11']);
        expect(result.current.lengthOf(q[0])).toBe(200);
        expect(result.current.lengthOf(q[11])).toBe(250);

        // 全部查完就不再送
        await advance(60_000);
        expect(calls).toHaveLength(2);
    });

    it('H1b 30 首、每批只回 3 首結果：沒輪到的不計失敗次數，要送 10 批才查完', async () => {
        const q = songs(30);
        respond = (call) => json({ ok: true, items: call.items.map((_, i) => (i < 3 ? { seconds: 200, source: 'itunes' } : { seconds: null, source: 'pending' })) });
        const { result } = mount(q);
        // 沒輪到也累加失敗次數的話，同一首第 5 次 pending 後就被放棄，後面的歌永遠查不到
        await run(30_000);
        expect(calls).toHaveLength(10);
        expect(result.current.lengthOf(q[29])).toBe(200);
    });

    it('H2 回 retryAfter 超過 30 秒時，本頁不再重試', async () => {
        respond = (call) => json({ ok: true, items: call.items.map(() => ({ seconds: null, source: 'pending' })), retryAfter: 3600 });
        const { result } = mount(songs(2));
        await advance(700);
        expect(calls).toHaveLength(1);
        await advance(1000);
        expect(calls).toHaveLength(1);
        await advance(2 * 3600 * 1000);
        // 配額用完還每幾秒重打，會把已經耗盡的額度拖成無限請求
        expect(calls).toHaveLength(1);
        expect(result.current.lengthOf(songs(2)[0])).toBeUndefined();
    });

    it('H3 回 retryAfter 10 秒：1 秒內不會重打，約 10 秒後才重打', async () => {
        respond = (call, n) =>
            n === 1
                ? json({ ok: true, items: call.items.map(() => ({ seconds: null, source: 'pending' })), retryAfter: 10 })
                : json({ ok: true, items: call.items.map(() => ({ seconds: 180, source: 'itunes' })) });
        const q = songs(1);
        const { result } = mount(q);
        await advance(700);
        expect(calls).toHaveLength(1);
        await advance(1000);
        expect(calls).toHaveLength(1);
        await advance(7000);
        expect(calls).toHaveLength(1);
        await advance(2500);
        expect(calls).toHaveLength(2);
        expect(result.current.lengthOf(q[0])).toBe(180);
    });

    it('H4 網路錯誤指數退避 2s、4s、8s、16s，共 5 次後停止', async () => {
        respond = () => { throw new Error('network down'); };
        mount(songs(1));
        await advance(700);
        expect(calls).toHaveLength(1);
        await advance(1900);
        expect(calls).toHaveLength(1);
        await advance(200); // 2s
        expect(calls).toHaveLength(2);
        await advance(3900);
        expect(calls).toHaveLength(2);
        await advance(200); // 4s
        expect(calls).toHaveLength(3);
        await advance(8100); // 8s
        expect(calls).toHaveLength(4);
        await advance(16_100); // 16s
        expect(calls).toHaveLength(5);
        await advance(120_000);
        expect(calls).toHaveLength(5);
    });

    it('H5 非 2xx 與逾時視同暫時失敗，累加次數並退避', async () => {
        respond = () => new Response('boom', { status: 500 });
        mount(songs(1));
        await advance(700);
        expect(calls).toHaveLength(1);
        await advance(1000);
        expect(calls).toHaveLength(1);
        await advance(1500);
        expect(calls).toHaveLength(2);
    });

    it('H6 伺服器一直回 pending 又沒有任何進展（也沒 retryAfter）時，不會無限快速重打', async () => {
        respond = (call) => json({ ok: true, items: call.items.map(() => ({ seconds: null, source: 'pending' })) });
        mount(songs(1));
        await run(300_000, 1000);
        expect(calls.length).toBeLessThanOrEqual(5);
        expect(calls.length).toBeGreaterThan(1);
    });
});
