// /live 頁串流讀取（functions/lib/live-og-page.js）與端點的行為：
//   1. 離線頻道頁：讀完前 64KB 就取消下載
//   2. watch 頁：讀到 ytInitialPlayerResponse 的 </script> 就取消；標記被切在兩個 chunk 之間也找得到
//   3. 推薦區塊（playerResponse 之外）的待機標記不算
//   4. 找不到 playerResponse 時退回整頁比對（行為同改版前）
//   5. 端點：待機室不再發 HEAD；輸出欄位與改版前相同
import { describe, it, expect, vi, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { readLiveOgPage, pageFromText, videoIdFromHead, HEAD_CHARS } from '../../functions/lib/live-og-page.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet } from '../../functions/api/youtube-channel-live-og.js';

const V = 'LiveVideo01';
const CHANNEL = 'UC' + 'b'.repeat(22);
const filler = (n: number) => '<script>var x="' + '資料'.repeat(n / 2) + '";</script>';

const watchPage = (opts: { upcoming?: boolean; recommendedUpcoming?: boolean; player?: boolean } = {}) =>
    `<html><head><link rel="canonical" href="https://www.youtube.com/watch?v=${V}"><title>直播 - YouTube</title>` +
    filler(200_000) +
    (opts.player === false
        ? ''
        : `<script>var ytInitialPlayerResponse = {"videoDetails":{"author":"官方頻道名"${opts.upcoming ? ',"isUpcoming":true},"scheduledStartTime":"1790776800"' : '}'}};</script>`) +
    filler(100_000) +
    (opts.recommendedUpcoming ? '<script>var ytInitialData = {"x":{"isUpcoming":true,"scheduledStartTime":"1790776800"}};</script>' : '') +
    (opts.player === false && opts.upcoming ? '"isUpcoming":true,"scheduledStartTime":"1790776800"' : '') +
    '</body></html>';

const channelPage = () =>
    `<html><head><link rel="canonical" href="https://www.youtube.com/channel/${CHANNEL}"><meta property="og:title" content="頻道 &amp; 名稱">` +
    `<meta property="og:image" content="https://yt3.ggpht.com/avatar.jpg">` +
    filler(400_000) +
    '</body></html>';

/** 以固定大小分塊串流回傳，記錄讀了多少 bytes、有沒有被取消 */
function streamed(html: string, chunk = 16_384) {
    const bytes = new TextEncoder().encode(html);
    const stat = { read: 0, canceled: false };
    let pos = 0;
    const body = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (pos >= bytes.length) return controller.close();
            const end = Math.min(pos + chunk, bytes.length);
            controller.enqueue(bytes.subarray(pos, end));
            stat.read += end - pos;
            pos = end;
        },
        cancel() {
            stat.canceled = true;
        },
    });
    return { response: new Response(body), stat, total: bytes.length };
}

describe('readLiveOgPage', () => {
    it('離線頻道頁：前 64KB 找不到影片就取消下載，player 為空', async () => {
        const { response, stat, total } = streamed(channelPage());
        const page = await readLiveOgPage(response);
        expect(page.complete).toBe(false);
        expect(page.player).toBe('');
        expect(page.head.length).toBe(HEAD_CHARS);
        expect(stat.canceled).toBe(true);
        expect(stat.read).toBeLessThan(total / 4);
    });

    it('watch 頁：讀到 playerResponse 的 </script> 就取消，區段內容正確', async () => {
        const html = watchPage({ upcoming: true });
        const { response, stat, total } = streamed(html);
        const page = await readLiveOgPage(response);
        expect(stat.canceled).toBe(true);
        expect(stat.read).toBeLessThan(total);
        expect(page.player.startsWith('ytInitialPlayerResponse')).toBe(true);
        expect(page.player).toContain('"isUpcoming":true');
        expect(page.player).not.toContain('</script>');
        expect(page).toEqual({ ...pageFromText(html, false) });
    });

    it('標記被切在兩個 chunk 之間也找得到（各種 chunk 大小都和整頁切法一致）', async () => {
        const html = watchPage({ upcoming: true });
        const expected = pageFromText(html);
        for (const size of [7, 13, 1000, 4096, 65_536, 1_000_003]) {
            const page = await readLiveOgPage(streamed(html, size).response);
            expect(page.player, `chunk ${size}`).toBe(expected.player);
            expect(page.head, `chunk ${size}`).toBe(expected.head);
        }
    });

    it('找不到 playerResponse：讀完整頁、退回整頁比對', async () => {
        const html = watchPage({ player: false, upcoming: true });
        const page = await readLiveOgPage(streamed(html).response);
        expect(page.complete).toBe(true);
        expect(page.player).toBe(html);
    });

    it('沒有 body 串流（測試或舊環境）時用整份文字', async () => {
        const html = channelPage();
        const fake = { body: null, text: async () => html } as unknown as Response;
        expect(await readLiveOgPage(fake)).toEqual(pageFromText(html));
    });

    it('先出現引用（不是定義）的 ytInitialPlayerResponse 不會被當成區段', async () => {
        const html = watchPage({ upcoming: true }).replace('<title>', '<script>if(window.ytInitialPlayerResponse){}</script><title>');
        const page = await readLiveOgPage(streamed(html).response);
        expect(page.player.startsWith('ytInitialPlayerResponse = {')).toBe(true);
        expect(page.player).toContain('"isUpcoming":true');
    });

    it('區段裡沒有 videoDetails（不是真正的定義）：讀完整頁、退回整頁比對', async () => {
        const html = watchPage({ upcoming: true }).replace('{"videoDetails":', '{"other":');
        const { response, stat } = streamed(html);
        const page = await readLiveOgPage(response);
        expect(page.complete).toBe(true);
        expect(stat.canceled).toBe(false);
        expect(page.player).toBe(html);
        expect(page).toEqual(pageFromText(html));
    });

    it('前 64KB 沒有 canonical（不能確定是頻道頁）：繼續讀，在整頁找影片', async () => {
        const html = `<html><head><title>x</title>${filler(200_000)}<link rel="canonical" href="https://www.youtube.com/watch?v=${V}">` +
            `<script>var ytInitialPlayerResponse = {"videoDetails":{"author":"A"},"isUpcoming":true};</script></body></html>`;
        const page = await readLiveOgPage(streamed(html).response);
        expect(page.videoId).toBe(V);
        expect(page.player).toContain('"isUpcoming":true');
        expect(page).toEqual(pageFromText(html));
    });

    it('小於 64KB 的頻道頁：串流與整頁切法結果相同（player 都是空字串）', async () => {
        const html = channelPage().slice(0, 3000) + '</html>';
        expect(await readLiveOgPage(streamed(html).response)).toEqual(pageFromText(html));
        expect(pageFromText(html).player).toBe('');
    });

    it('videoIdFromHead：og:image → canonical → og:url；頻道網址與頭像不算', () => {
        expect(videoIdFromHead(`<meta property="og:image" content="https://i.ytimg.com/vi/${V}/hqdefault_live.jpg">`)).toEqual({ videoId: V, source: 'meta-image' });
        expect(videoIdFromHead(`<link rel="canonical" href="https://www.youtube.com/watch?v=${V}">`)).toEqual({ videoId: V, source: 'canonical-link' });
        expect(videoIdFromHead(`<meta property="og:url" content="https://www.youtube.com/watch?v=${V}">`)).toEqual({ videoId: V, source: 'og-url' });
        expect(videoIdFromHead(channelPage().slice(0, HEAD_CHARS)).videoId).toBeNull();
    });
});

describe('youtube-channel-live-og 端點（串流解析）', () => {
    afterEach(() => vi.unstubAllGlobals());

    async function run(html: string, headStatus = 404) {
        const calls: string[] = [];
        vi.stubGlobal('caches', undefined);
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            calls.push(`${init?.method ?? 'GET'} ${url}`);
            if (String(url).includes('i.ytimg.com')) return new Response(null, { status: headStatus });
            return streamed(html).response;
        }));
        const request = new Request(`https://multistreaming.org/api/youtube-channel-live-og?channelId=${CHANNEL}`, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
        const res = await onRequestGet({ request, env: undefined, waitUntil: () => {} });
        return { body: await res.json(), calls };
    }

    it('待機室：不發 HEAD，回傳預定時間與頻道名', async () => {
        const { body, calls } = await run(watchPage({ upcoming: true }));
        expect(calls.filter((c) => c.startsWith('HEAD'))).toHaveLength(0);
        expect(body).toMatchObject({ isLive: false, isUpcoming: true, videoId: V, scheduledStartTime: '1790776800', channelTitle: '官方頻道名', finalUrl: `https://www.youtube.com/watch?v=${V}` });
    });

    it('直播中：HEAD 200 → isLive；推薦區塊的待機標記不會讓直播被當成待機', async () => {
        const { body } = await run(watchPage({ recommendedUpcoming: true }), 200);
        expect(body).toMatchObject({ isLive: true, videoId: V, channelTitle: '官方頻道名' });
        expect(body.isUpcoming).toBeUndefined();
    });

    it('watch 頁找不到 author：頻道名回 null，不拿 og:title（影片標題）充當', async () => {
        const html = watchPage().replace('"author":"官方頻道名"', '"x":"y"').replace('<title>', '<meta property="og:title" content="影片標題"><title>');
        const { body } = await run(html, 200);
        expect(body).toMatchObject({ isLive: true, videoId: V });
        expect(body.channelTitle).toBeNull();
    });

    it('YouTube 一直不送完頁面：逾時後回 500（不快取、不寫庫），不會卡住', async () => {
        vi.useFakeTimers();
        try {
            vi.stubGlobal('caches', undefined);
            vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
                const body = new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode('<html><head>'));
                        init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
                    },
                });
                return new Response(body);
            }));
            const request = new Request(`https://multistreaming.org/api/youtube-channel-live-og?channelId=${CHANNEL}`, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
            const pending = onRequestGet({ request, env: undefined, waitUntil: () => {} });
            await vi.advanceTimersByTimeAsync(8_000);
            expect((await pending).status).toBe(500);
        } finally {
            vi.useRealTimers();
        }
    });

    it('離線頻道頁：沒有影片，頻道名取 og:title（解 entity）', async () => {
        const { body, calls } = await run(channelPage());
        expect(body).toMatchObject({ isLive: false, channelTitle: '頻道 & 名稱', message: 'Video ID not found in HTML' });
        expect(calls).toHaveLength(1);
    });
});
