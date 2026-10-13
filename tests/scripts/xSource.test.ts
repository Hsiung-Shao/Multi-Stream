// scripts/schedule-posts 的 X 來源：關於頁外部連結、X 帳號比對、fxtwitter 時間軸、依發文時間取代舊週表。
// fixture 由 2026-10-08 真實回應精簡：懶貓子的 /about（另加一個 intent 連結與第二個帳號）、fxtwitter 個人資料與時間軸
// （時間軸含週表貼文、自我串文、無圖貼文，另加一則轉推與一則回覆別人）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { csvCell, decideHandle, extractXHandles, nameMatches, nameTokens, normalizeName, parseAboutLinks, sharesCjkRun, xUrlOf } from '../../scripts/schedule-posts/lib/xhandles.mjs';
import { handleFromXUrl, isXScheduleCandidate, parseXTimeline, xPostKey, xPostUrl } from '../../scripts/schedule-posts/lib/xposts.mjs';
import { postExternalId, postKeyFromExternalId, supersede } from '../../scripts/schedule-posts/lib/rules.mjs';
import { candidateSection } from '../../scripts/schedule-posts/lib/instructions.mjs';

const aboutHtml = readFileSync('tests/scripts/fixtures/youtube-about-page.html', 'utf8');
const timeline = JSON.parse(readFileSync('tests/scripts/fixtures/fxtwitter-statuses.json', 'utf8'));
const profile = JSON.parse(readFileSync('tests/scripts/fixtures/fxtwitter-profile.json', 'utf8'));
/** fixture 抓取當下 */
const NOW = Date.parse('2026-10-07T21:00:00Z');
const DAY = 86400e3;

describe('關於頁外部連結 → X 帳號', () => {
  it('關於頁連結依頁面順序取出 X 帳號', () => {
    // 含連結標題；排除 intent 等保留路徑
    const links = parseAboutLinks(aboutHtml)!;
    expect(links[0]).toEqual({ title: 'Twitter', link: 'twitter.com/Rumi__0813' });
    expect(links.some((l) => l.link.startsWith('x.com/intent'))).toBe(true);
    expect(extractXHandles(links)).toEqual(['Rumi__0813', 'Rumi_sub']);
  });

  it('X 網址各種寫法都認得並去重', () => {
    // 大小寫不同的重複只留一個；不是 X 的不收
    expect(
      extractXHandles([
        { title: '', link: 'https://x.com/abc_1' },
        { title: '', link: 'mobile.twitter.com/ABC_1/' },
        { title: '', link: 'www.x.com/def?lang=ja' },
        { title: '', link: 'x.com/home' },
        { title: '', link: 'instagram.com/abc_1' },
        { title: '', link: 'xx.com/foo' },
      ]),
    ).toEqual(['abc_1', 'def']);
    expect(parseAboutLinks('<html></html>')).toBeNull();
  });
});

describe('X 帳號是不是本人', () => {
  it('名稱互相包含或簡介提到名稱就算本人', () => {
    // 名稱先正規化再比
    expect(normalizeName('Rumi / 懶貓子')).toBe('rumi懶貓子');
    expect(nameMatches('懶貓子', profile.user.name, profile.user.description)).toBe(true); // 「Rumi / 懶貓子」
    expect(nameMatches('夜紫悠YeZi', '夜紫悠🌙', '')).toBe(true);
    expect(nameMatches('Ｒｕｍｉ', 'rumi', '')).toBe(true); // 全形
    expect(nameMatches('茸茸鼠', 'Liqueur Prime 利口酒', '公司官方帳號')).toBe(false); // 公司帳號
    expect(nameMatches('茸茸鼠', 'Liqueur Prime', '所屬：茸茸鼠、…')).toBe(true); // 簡介提到
    expect(nameMatches('喵', '喵喵屋', '')).toBe(false); // 1 字只接受完全相同
    expect(nameMatches('喵', '喵', '')).toBe(true);
  });

  it('X 帳號與 YouTube handle 相同也算本人', () => {
    // 例：日文「姫」與中文「姬」比不出來；太短的帳號不算
    expect(nameMatches('姫川璃音', '姬川璃音🐾個人勢VTuber🐾', '')).toBe(true); // 異體字對照（姫→姬）後也對得上
    expect(nameMatches('姫川璃音', '姬川璃音🐾個人勢VTuber🐾', '', { xHandle: 'himekawa_rino', ytHandle: 'himekawa_rino' })).toBe(true);
    expect(nameMatches('甲', '乙', '', { xHandle: 'Hime_Kawa', ytHandle: 'himekawa' })).toBe(true); // 只差底線與大小寫
    expect(nameMatches('甲', '乙', '', { xHandle: 'abc', ytHandle: 'abc' })).toBe(false); // 少於 4 字
    // 逐段比對
    expect(nameMatches('仙杜波拉 Cinderpola', '仙杜波拉 Pola ☀️Vtuber 躺柏油曬太陽', '')).toBe(true); // 漢字段
    expect(nameMatches('Springarc Ch.廢宅和春弧的工作室', 'Darren', '', { xHandle: 'Springarc' })).toBe(true); // 英數段＝帳號
    expect(nameMatches('Mio Vtuber', 'Kai Vtuber', '')).toBe(false); // 通用字不算
    expect(nameMatches('百瀬ヤスミ', '土芒果社㊣Yasumi 🛌', '')).toBe(false); // 片假名對羅馬字，留給人工
    expect(nameTokens('仙杜波拉 Cinderpola（Vtuber）')).toEqual(['仙杜波拉', 'cinderpola']);
    // 2026-10-08 正式站 dry-run 的待人工清單裡、其實是本人的寫法
    expect(nameMatches('鬣崎ミナミ', '鬣崎米娜米Hezaki🐾✨', '')).toBe(true); // 共有漢字片段
    expect(nameMatches('風子ひかり', 'Fuko 風子【HKVtuber】', '')).toBe(true);
    expect(nameMatches('猫宮あゆめ', '貓宮步夢🐈🎮 ✧*｡', '')).toBe(true); // 猫／貓
    expect(nameMatches('楓靈', '楓霊🍁バーチャル高校生', '')).toBe(true); // 霊／靈
    expect(sharesCjkRun('あいう', 'あいう')).toBe(false); // 只有假名不算（太容易撞）
    // 仍要人工的：工作室帳號、名稱完全不同
    expect(nameMatches('小羯貓貓', 'NJ Background Studio ✦目標', '')).toBe(false);
    expect(nameMatches('菓子波的多×焼余', '秋刀魚🍎', '')).toBe(false);
    expect(decideHandle('姫川璃音', ['himekawa_rino'], [{ handle: 'himekawa_rino', profile: { ok: true, user: { screen_name: 'himekawa_rino', name: '姬川璃音', description: '' } } }], 'himekawa_rino')).toMatchObject({ action: 'write' });
  });

  it('decideHandle 依比對結果決定不寫、寫入或送審', () => {
    // 沒有 X → none；第一個對不上但第二個對上 → 寫第二個；都對不上 → review 附 X 名稱；查無 → review
    const ok = (name: string) => ({ ok: true, user: { screen_name: 'x', name, description: '' } });
    expect(decideHandle('懶貓子', [], [])).toMatchObject({ action: 'none' });
    expect(decideHandle('懶貓子', ['a', 'b'], [{ handle: 'a', profile: ok('別人') }, { handle: 'b', profile: ok('懶貓子') }])).toMatchObject({ action: 'write', handle: 'b', reason: 'matched_of_many' });
    expect(decideHandle('懶貓子', ['a'], [{ handle: 'a', profile: ok('公司') }])).toMatchObject({ action: 'review', reason: 'name_mismatch', xName: '公司' });
    expect(decideHandle('懶貓子', ['a'], [{ handle: 'a', profile: { ok: false, reason: 'not_found' } }])).toMatchObject({ action: 'review', reason: 'profile_not_found' });
  });

  it('X 網址與 CSV 欄位的格式安全', () => {
    expect(xUrlOf('Rumi__0813')).toBe('https://x.com/Rumi__0813');
    // 待人工清單的 CSV：外部來的顯示名稱不能被 Excel 當公式
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe('"\'=HYPERLINK(""http://evil"",""x"")"');
    expect(csvCell('-1')).toBe('"\'-1"');
    expect(csvCell('姬川璃音')).toBe('"姬川璃音"');
    // 寫進資料庫的格式要通過 CHECK vtubers_x_url_format
    expect(/^https:\/\/(www\.|mobile\.)?(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?$/i.test(xUrlOf('Rumi__0813'))).toBe(true);
    expect(handleFromXUrl('https://x.com/Rumi__0813')).toBe('Rumi__0813');
    expect(handleFromXUrl('https://twitter.com/abc/')).toBe('abc');
    expect(handleFromXUrl('https://x.com/abc/status/1')).toBeNull();
  });
});

describe('fxtwitter 時間軸', () => {
  it('時間軸只收本人原創與自我串文', () => {
    // 排除轉推、回覆別人；時間是絕對時間；圖片取 large 尺寸（orig 常有數 MB）
    const posts = parseXTimeline(timeline, 'rumi__0813'); // 大小寫不敏感
    expect(posts.map((p) => p.id)).toEqual(['2106797345765736545', '2107652569233547507', '2104479960081825825']);
    const sched = posts[0];
    expect(sched.createdAt).toBe(Date.parse('Sun Oct 04 17:23:24 +0000 2026'));
    expect(sched.images[0]).toMatch(/^https:\/\/pbs\.twimg\.com\/media\/.+\?name=large$/);
    expect(posts[2].images).toEqual([]);
  });

  it('候選：有圖、10 天內、含週表關鍵字', () => {
    const [sched, selfReply, noPhoto] = parseXTimeline(timeline, 'Rumi__0813');
    expect(isXScheduleCandidate(sched, NOW, { maxAgeDays: 10 })).toBe(true); // 今週のschedule
    expect(isXScheduleCandidate(selfReply, NOW, { maxAgeDays: 10 })).toBe(false); // 沒有關鍵字
    expect(isXScheduleCandidate(noPhoto, NOW, { maxAgeDays: 10 })).toBe(false);
    expect(isXScheduleCandidate(sched, NOW + 11 * DAY, { maxAgeDays: 10 })).toBe(false); // 太舊
    expect(xPostKey('2106797345765736545')).toBe('x:2106797345765736545');
    expect(xPostUrl('Rumi__0813', '1')).toBe('https://x.com/Rumi__0813/status/1');
    expect(parseXTimeline({ results: [{ id: 'not-a-number' }] }, 'a')).toEqual([]);
  });
});

describe('依發文時間取代舊週表', () => {
  const yt = (n: number, start = '2026-10-09T12:00:00Z') => ({ external_id: postExternalId('UgkxOLD000000000000', n), scheduled_start: start });
  const x = (n: number, start = '2026-10-09T12:00:00Z') => ({ external_id: postExternalId('x:2106797345765736545', n), scheduled_start: start });
  const xOther = (n: number) => ({ external_id: postExternalId('x:2100000000000000000', n), scheduled_start: '2026-10-09T12:00:00Z' });

  it('貼文鍵：YouTube 與 X 都能從 external_id 取回', () => {
    expect(postKeyFromExternalId('post:x:2106797345765736545:3')).toBe('x:2106797345765736545');
    expect(postKeyFromExternalId('post:UgkxOLD000000000000:1')).toBe('UgkxOLD000000000000');
    expect(postKeyFromExternalId('dQw4w9WgXcQ')).toBeNull();
  });

  it('發文時間差超過 36 小時時以較新的為準', () => {
    // 舊的取消、新的讓這篇不寫；自己的列不取消；查不到發文時間視為較舊
    const t0 = Date.parse('2026-10-04T00:00:00Z');
    const pub = new Map([['UgkxOLD000000000000', t0]]);
    expect(supersede([yt(1), yt(2), x(1)], pub, 'x:2106797345765736545', t0 + 2 * DAY)).toMatchObject({ superseded: false, cancel: [yt(1).external_id, yt(2).external_id] });
    expect(supersede([yt(1)], pub, 'x:2106797345765736545', t0 - 2 * DAY)).toMatchObject({ superseded: true, cancel: [] });
    expect(supersede([yt(1)], new Map(), 'x:2106797345765736545', t0)).toMatchObject({ superseded: false, cancel: [yt(1).external_id] });
    expect(supersede([], pub, 'x:1', t0)).toEqual({ superseded: false, cancel: [], skipDates: new Set() });
  });

  it('36 小時內且有一邊是 YouTube 時不互相取代', () => {
    // YouTube 時間是推估，視為同一版本，只跳過對方已寫的日期（515 的案例）
    const ytAt = Date.parse('2026-10-05T20:38:00Z'); // YouTube「2 天前」推回的時間
    const xAt = Date.parse('2026-10-05T15:35:00Z'); // X 的精確時間，看起來比較舊
    const pub = new Map([['UgkxOLD000000000000', ytAt]]);
    const r = supersede([yt(1, '2026-10-09T12:00:00Z'), yt(2, '2026-10-10T12:00:00Z')], pub, 'x:2106797345765736545', xAt);
    expect(r.superseded).toBe(false);
    expect(r.cancel).toEqual([]);
    expect([...r.skipDates].sort()).toEqual(['2026-10-09', '2026-10-10']); // 10/08 沒被寫過 → X 那篇會補上
  });

  it('兩篇都是 X 時較新的照樣取代', () => {
    // X 時間精確，不套用 36 小時寬限
    const t0 = Date.parse('2026-10-05T00:00:00Z');
    const pub = new Map([['x:2100000000000000000', t0]]);
    expect(supersede([xOther(1)], pub, 'x:2106797345765736545', t0 + 3600e3)).toMatchObject({ superseded: false, cancel: [xOther(1).external_id] });
    expect(supersede([xOther(1)], pub, 'x:2106797345765736545', t0 - 3600e3)).toMatchObject({ superseded: true });
  });
});

describe('讀圖說明的來源欄', () => {
  it('X 候選寫出帳號與貼文網址、發文日期不標推算', () => {
    // YouTube 照舊
    const base = { name: '懶貓子', externalId: 'UCswRX8mNNdn1fjRctZqzjgA', postDate: Date.parse('2026-10-04T17:23:24Z'), imageUrl: 'u', localImage: 'l', text: '今週のschedule' };
    const xs = candidateSection({ ...base, site: 'x', handle: 'Rumi__0813', postId: 'x:2106797345765736545', postUrl: 'https://x.com/Rumi__0813/status/2106797345765736545' });
    expect(xs).toContain('來源：X @Rumi__0813（https://x.com/Rumi__0813/status/2106797345765736545）');
    expect(xs).toContain('發文日期（台北）：2026-10-05（星期一）');
    const ys = candidateSection({ ...base, site: 'youtube', postId: 'UgkxABC1234567' });
    expect(ys).toContain('來源：YouTube 社群貼文（https://www.youtube.com/post/UgkxABC1234567）');
    expect(ys).toContain('發文日期（推算，台北）');
  });
});
