// 週表 live-og 的串流讀取（supabase/functions/_shared/live_og.ts，移植自 functions/lib/live-og-page.js）：
//   1. 頻道頁讀完頭 64KB 就取消；watch 頁讀到 playerResponse 的 </script> 就取消；標記跨 chunk 也找得到
//   2. 結構不符退回整頁比對；串流與整頁切法結果一致
//   3. detectLiveOg：頁面要含自己的頻道 ID；連線層錯誤（Deno「error sending request」）重試一次；失敗原因有分類
import { describe, it, expect, vi } from 'vitest';
import { detectLiveOg, HEAD_CHARS, pageFromText, parseLiveOgHtml, readLiveOgPage } from '../../supabase/functions/_shared/live_og.ts';

const V = 'LiveVideo01';
const UC = 'UC' + 'b'.repeat(22);
const filler = (n: number) => '<script>var x="' + '資料'.repeat(n / 2) + '";</script>';

const watchPage = (opts: { upcoming?: boolean; player?: boolean; channel?: string } = {}) =>
  `<html><head><link rel="canonical" href="https://www.youtube.com/watch?v=${V}"><meta property="og:title" content="直播標題"><title>直播 - YouTube</title>` +
  filler(200_000) +
  (opts.player === false
    ? ''
    : `<script>var ytInitialPlayerResponse = {"videoDetails":{"channelId":"${opts.channel ?? UC}"${opts.upcoming ? ',"isUpcoming":true},"scheduledStartTime":"1790776800"' : '}'}};</script>`) +
  filler(100_000) +
  '</body></html>';

const channelPage = () =>
  `<html><head><link rel="canonical" href="https://www.youtube.com/channel/${UC}"><meta property="og:title" content="頻道">` +
  filler(400_000) +
  '</body></html>';

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

/** detectLiveOg 用的假 fetch：頁面串流回傳，縮圖 HEAD 回指定狀態 */
function fakeFetch(html: string, thumbStatus = 200, failFirst?: Error) {
  let failed = false;
  const fn = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('i.ytimg.com')) return new Response(null, { status: thumbStatus });
    if (failFirst && !failed) {
      failed = true;
      throw failFirst;
    }
    const res = streamed(html).response;
    Object.defineProperty(res, 'url', { value: `https://www.youtube.com/channel/${UC}/live` });
    return res;
  });
  return fn as unknown as typeof fetch & typeof fn;
}

describe('readLiveOgPage（週表）', () => {
  it('頻道頁讀完頭 64KB 就取消下載', async () => {
    const { response, stat, total } = streamed(channelPage());
    const page = await readLiveOgPage(response);
    expect(page).toMatchObject({ player: '', videoId: null, complete: false });
    expect(page.head.length).toBe(HEAD_CHARS);
    expect(stat.canceled).toBe(true);
    expect(stat.read).toBeLessThan(total / 4);
  });

  it('watch 頁讀到 playerResponse 結尾就取消；各種 chunk 大小都和整頁切法一致', async () => {
    const html = watchPage({ upcoming: true });
    const { response, stat, total } = streamed(html);
    const page = await readLiveOgPage(response);
    expect(stat.canceled).toBe(true);
    expect(stat.read).toBeLessThan(total);
    expect(page.player.startsWith('ytInitialPlayerResponse = {')).toBe(true);
    expect(page).toEqual(pageFromText(html, false));
    const expected = pageFromText(html);
    for (const size of [7, 13, 4096, 65_536, 1_000_003]) {
      const p = await readLiveOgPage(streamed(html, size).response);
      expect(p.player, `chunk ${size}`).toBe(expected.player);
      expect(p.videoId, `chunk ${size}`).toBe(V);
    }
  });

  it('找不到 playerResponse：讀完整頁、整頁比對（推薦區塊的待機標記仍會被看到，行為同改版前）', async () => {
    const html = watchPage({ player: false });
    const page = await readLiveOgPage(streamed(html).response);
    expect(page.complete).toBe(true);
    expect(page.player).toBe(html);
  });

  it('退回時先用舊版寬鬆區段：定義寫法改了（沒有「 = {」），推薦區塊的待機標記不會讓直播被當成待機', async () => {
    const html = watchPage().replace('ytInitialPlayerResponse = {', 'ytInitialPlayerResponse={') +
      '<script>var ytInitialData = {"x":{"isUpcoming":true,"scheduledStartTime":"1790776800"}};</script>';
    const page = await readLiveOgPage(streamed(html).response);
    expect(page.fullPage).toBe(true);
    expect(page.player.startsWith('ytInitialPlayerResponse={')).toBe(true);
    expect(parseLiveOgHtml(html).isUpcoming).toBe(false);
  });

  it('頻道頁頁首沒有這個頻道的 ID（例如 canonical 改成 @handle）：不提早結束，讀完整頁再判斷', async () => {
    const html = channelPage().replace(`/channel/${UC}`, '/@somehandle') + `<script>{"externalId":"${UC}"}</script>`;
    const { response, stat } = streamed(html);
    const page = await readLiveOgPage(response, UC);
    expect(stat.canceled).toBe(false);
    expect(page).toMatchObject({ complete: true, fullPage: true, videoId: null });
    expect(page.player).toContain(UC);
  });

  it('parseLiveOgHtml（整頁版）與串流版規則相同：待機時間、標題取頁首', () => {
    const r = parseLiveOgHtml(watchPage({ upcoming: true }));
    expect(r).toEqual({ videoId: V, isUpcoming: true, scheduledStart: new Date(1790776800 * 1000).toISOString(), title: '直播標題' });
  });
});

describe('detectLiveOg（週表，串流）', () => {
  it('直播中：頻道 ID 在 playerResponse 裡（不在頁首）也算這個頻道的頁面', async () => {
    const r = await detectLiveOg(UC, { fetch: fakeFetch(watchPage()) });
    expect(r).toMatchObject({ ok: true, isLive: true, videoId: V });
  });

  it('待機室：不發縮圖 HEAD', async () => {
    const f = fakeFetch(watchPage({ upcoming: true }));
    const r = await detectLiveOg(UC, { fetch: f });
    expect(r).toMatchObject({ ok: true, isUpcoming: true, videoId: V });
    expect(f.mock.calls.some(([u]) => String(u).includes('i.ytimg.com'))).toBe(false);
  });

  it('離線頻道頁：OFFLINE', async () => {
    expect(await detectLiveOg(UC, { fetch: fakeFetch(channelPage()) })).toMatchObject({ ok: true, isLive: false, videoId: null });
  });

  it('頁面不含自己的頻道 ID（別人的頁、限流頁）：失敗，原因 no_channel_id', async () => {
    const r = await detectLiveOg(UC, { fetch: fakeFetch(watchPage({ channel: 'UC' + 'z'.repeat(22) })) });
    expect(r).toMatchObject({ ok: false, failReason: 'no_channel_id' });
  });

  it('連線層錯誤（error sending request）重試一次就成功', async () => {
    const f = fakeFetch(watchPage(), 200, new TypeError('error sending request from 172.25.0.7:46782 for https://www.youtube.com/channel/x'));
    const r = await detectLiveOg(UC, { fetch: f });
    expect(r).toMatchObject({ ok: true, isLive: true });
    expect(f.mock.calls.filter(([u]) => String(u).includes('/live?')).length).toBe(2);
  });

  it('其他錯誤不重試，失敗原因帶例外名稱；縮圖非 200/404 為 thumb_<狀態碼>', async () => {
    const f = fakeFetch(watchPage(), 200, new TypeError('Fetch failed: Maximum number of redirects (20) reached'));
    expect(await detectLiveOg(UC, { fetch: f })).toMatchObject({ ok: false, failReason: 'error_TypeError' });
    expect(f.mock.calls.filter(([u]) => String(u).includes('/live?')).length).toBe(1);
    expect(await detectLiveOg(UC, { fetch: fakeFetch(watchPage(), 503) })).toMatchObject({ ok: false, failReason: 'thumb_503' });
  });

  it('縮圖 HEAD 逾時或例外：thumb_error_<例外>（和頁面讀取的錯誤分開）', async () => {
    const base = fakeFetch(watchPage());
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('i.ytimg.com')) throw new DOMException('aborted', 'AbortError');
      return base(url, init);
    }) as unknown as typeof fetch;
    expect(await detectLiveOg(UC, { fetch: f })).toMatchObject({ ok: false, failReason: 'thumb_error_AbortError' });
  });

  it('頻道頁頁首沒有自己的 ID 但後段有：讀完整頁仍判定為離線（ok）', async () => {
    const html = channelPage().replace(`/channel/${UC}`, '/@somehandle') + `<script>{"externalId":"${UC}"}</script>`;
    expect(await detectLiveOg(UC, { fetch: fakeFetch(html) })).toMatchObject({ ok: true, isLive: false, videoId: null, fullPage: true });
  });
});
