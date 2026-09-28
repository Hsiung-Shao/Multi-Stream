import { describe, expect, it } from 'vitest';
import { fetchChannelRss, parseYouTubeRss } from '../../supabase/functions/_shared/rss.ts';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>Test Ch.</title>
 <entry>
  <id>yt:video:AbCdEfGhIjK</id>
  <yt:videoId>AbCdEfGhIjK</yt:videoId>
  <yt:channelId>UCxxxxxxxxxxxxxxxxxxxxxx</yt:channelId>
  <title>【待機室】晚上 8 點開台 &amp; 聊天</title>
  <published>2026-09-27T10:00:00+00:00</published>
  <updated>2026-09-27T11:00:00+00:00</updated>
 </entry>
 <entry>
  <id>yt:video:zyxwvutsrqp</id>
  <yt:videoId>zyxwvutsrqp</yt:videoId>
  <title><![CDATA[一般上傳 <剪輯>]]></title>
  <published>2026-09-20T10:00:00+00:00</published>
  <updated>2026-09-20T10:00:00+00:00</updated>
 </entry>
 <entry>
  <yt:videoId>bad id</yt:videoId>
  <title>格式錯的 id 要跳過</title>
 </entry>
</feed>`;

describe('parseYouTubeRss', () => {
  it('解析一般上傳與待機室 entry，處理 XML 跳脫與 CDATA', () => {
    const entries = parseYouTubeRss(FEED);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      videoId: 'AbCdEfGhIjK',
      title: '【待機室】晚上 8 點開台 & 聊天',
      publishedAt: '2026-09-27T10:00:00+00:00',
      updatedAt: '2026-09-27T11:00:00+00:00',
    });
    expect(entries[1].title).toBe('一般上傳 <剪輯>');
  });

  it('空 feed 與非 XML 都回空陣列', () => {
    expect(parseYouTubeRss('<feed></feed>')).toEqual([]);
    expect(parseYouTubeRss('')).toEqual([]);
    expect(parseYouTubeRss('<html>not a feed</html>')).toEqual([]);
  });
});

describe('fetchChannelRss', () => {
  it('HTTP 404 回 ok=false 且 entries 為空', async () => {
    const fetchFn = (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;
    const r = await fetchChannelRss('UCxxxxxxxxxxxxxxxxxxxxxx', { fetch: fetchFn });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
    expect(r.entries).toEqual([]);
    expect(r.error).toBe('http 404');
  });

  it('網路錯誤不丟出，回 error 字串', async () => {
    const fetchFn = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const r = await fetchChannelRss('UCxxxxxxxxxxxxxxxxxxxxxx', { fetch: fetchFn });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('ECONNRESET');
  });

  it('200 時解析內容並帶上 channel_id 查詢', async () => {
    let url = '';
    const fetchFn = (async (input: string | URL | Request) => {
      url = String(input);
      return new Response(FEED, { status: 200 });
    }) as unknown as typeof fetch;
    const r = await fetchChannelRss('UCxxxxxxxxxxxxxxxxxxxxxx', { fetch: fetchFn });
    expect(url).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxxxxxxxxxxxxxxxxxx');
    expect(r.ok).toBe(true);
    expect(r.entries.map((e) => e.videoId)).toEqual(['AbCdEfGhIjK', 'zyxwvutsrqp']);
  });
});
