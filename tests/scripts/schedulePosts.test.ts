// scripts/schedule-posts：貼文頁解析、相對時間、候選判定、規則檢查、模型輸出 → 決策、給排程 Claude 的讀圖說明、環境設定。
// fixture 由 2026-10-05 真實頁面（懶貓子 /posts）精簡而成：週表貼文（12 小時前、1 圖）、會員桌布（9 天前、1 圖）、沒圖的貼文。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractInitialData, imageBaseUrl, imageFullUrl, isScheduleCandidate, parsePostsHtml, POST_ID_RE, relativeToDate, SCHEDULE_KEYWORD_RE } from '../../scripts/schedule-posts/lib/posts.mjs';
import { decide, postExternalId, reviewEntries, taipeiDate, taipeiToIso, validateScheduleEntries } from '../../scripts/schedule-posts/lib/rules.mjs';
import { buildInstructions, candidateSection, RESULT_SCHEMA } from '../../scripts/schedule-posts/lib/instructions.mjs';
import { isLocalUrl, loadEnv, parseEnvText } from '../../scripts/schedule-posts/lib/env.mjs';

// jsdom 環境下 import.meta.url 不是 file:，用相對於 repo 根目錄的路徑
const html = readFileSync('tests/scripts/fixtures/youtube-posts-page.html', 'utf8');
/** fixture 抓取當下（台北 10/05 14:00） */
const NOW = Date.parse('2026-10-05T06:00:00Z');
const DAY = 86400e3;

describe('parsePostsHtml', () => {
  it('取出貼文 ID、文字、相對時間與圖片（去掉尺寸後綴）', () => {
    const posts = parsePostsHtml(html);
    expect(posts).toHaveLength(3);
    expect(posts[0]).toMatchObject({ postId: 'UgkxArOhmT2c-kJTMe353hLottirT7KGGe4N', publishedText: '12 小時前' });
    expect(posts[0].text).toContain('今週のschedule');
    expect(posts[0].images).toHaveLength(1);
    expect(posts[0].images[0]).toMatch(/^https:\/\/yt3\.ggpht\.com\/[^=]+$/);
    expect(posts[2]).toMatchObject({ postId: 'UgkxNoImagePost00000000000000000000', images: [] });
  });

  it('沒有 ytInitialData 或 JSON 壞掉 → 空陣列；postId 格式不對的貼文略過', () => {
    expect(parsePostsHtml('<html></html>')).toEqual([]);
    expect(parsePostsHtml('<script>var ytInitialData = {oops;</script>')).toEqual([]);
    expect(extractInitialData('x')).toBeNull();
    const bad = '<script>var ytInitialData = {"a":{"backstagePostRenderer":{"postId":"bad,id&x"}}};</script>';
    expect(parsePostsHtml(bad)).toEqual([]);
    expect(POST_ID_RE.test('UgkxArOhmT2c-kJTMe353hLottirT7KGGe4N')).toBe(true);
  });

  it('圖片網址：去尺寸、加 =s1600', () => {
    expect(imageBaseUrl('https://yt3.ggpht.com/abc=s640-c-fcrop64=1,00000000ffffffff-nd-v1')).toBe('https://yt3.ggpht.com/abc');
    expect(imageFullUrl('https://yt3.ggpht.com/abc=s288')).toBe('https://yt3.ggpht.com/abc=s1600');
  });
});

describe('relativeToDate', () => {
  it('中文與英文相對時間', () => {
    expect(relativeToDate('12 小時前', NOW)).toBe(NOW - 12 * 3600e3);
    expect(relativeToDate('6 天前', NOW)).toBe(NOW - 6 * DAY);
    expect(relativeToDate('2 週前', NOW)).toBe(NOW - 14 * DAY);
    expect(relativeToDate('1 個月前（已編輯）', NOW)).toBe(NOW - 30 * DAY);
    expect(relativeToDate('3 days ago (edited)', NOW)).toBe(NOW - 3 * DAY);
    expect(relativeToDate('剛剛', NOW)).toBe(NOW);
    expect(relativeToDate('不明', NOW)).toBeNull();
    expect(relativeToDate(null, NOW)).toBeNull();
  });
});

describe('isScheduleCandidate', () => {
  const posts = parsePostsHtml(html);
  it('有圖＋10 天內＋文字含關鍵字才送', () => {
    expect(isScheduleCandidate(posts[0], NOW, { maxAgeDays: 10 })).toBe(true); // 今週のschedule
    expect(isScheduleCandidate(posts[1], NOW, { maxAgeDays: 10 })).toBe(false); // 會員桌布：沒關鍵字
    expect(isScheduleCandidate(posts[2], NOW, { maxAgeDays: 10 })).toBe(false); // 沒圖
    expect(isScheduleCandidate({ ...posts[0], publishedText: '2 週前' }, NOW, { maxAgeDays: 10 })).toBe(false); // 太舊（相對時間是相對於 now）
    expect(isScheduleCandidate({ ...posts[0], publishedText: '看不懂' }, NOW, { maxAgeDays: 10 })).toBe(false); // 推不出發文時間就不送
  });
  it('關鍵字涵蓋中日英常見寫法', () => {
    for (const s of ['本週行程', '💌本週行程表💌', '今週のスケジュール', 'Weekly Schedule', '下周預定', '配信予定']) expect(SCHEDULE_KEYWORD_RE.test(s)).toBe(true);
    for (const s of ['今天8點半在這邊！', '新周邊上架', 'FF47 攤位']) expect(SCHEDULE_KEYWORD_RE.test(s)).toBe(false);
  });
});

describe('rules：台北時間與列檢查', () => {
  it('taipeiDate／taipeiToIso', () => {
    expect(taipeiDate(Date.parse('2026-10-05T16:30:00Z'))).toBe('2026-10-06');
    expect(taipeiToIso('2026-10-06', '20:00')).toBe('2026-10-06T12:00:00.000Z');
    expect(taipeiToIso('2026-02-30', '20:00')).toBeNull();
    expect(taipeiToIso('2026-10-06', '24:00')).toBeNull();
  });

  it('剔除休息日、沒時間、超出視窗、已過 3 小時、重複；通過的依時間排序', () => {
    const postDate = NOW - 12 * 3600e3; // 10/05
    const parsed = {
      is_schedule: true,
      confidence: 0.9,
      entries: [
        { date: '2026-10-07', time: '20:00', title: 'Shadowverse', platform: 'twitch', is_rest: false, confidence: 0.9 },
        { date: '2026-10-05', time: null, title: '', platform: 'unknown', is_rest: true, confidence: 1 },
        { date: '2026-10-06', time: '20:00', title: '教妹妹開車', platform: 'youtube', is_rest: false, confidence: 0.85 },
        { date: '2026-10-06', time: '20:00', title: '重複', platform: 'youtube', is_rest: false, confidence: 0.85 },
        { date: '2026-10-20', time: '20:00', title: '太遠', platform: 'youtube', is_rest: false, confidence: 0.8 },
        { date: '2026-10-04', time: '20:00', title: '昨天已過', platform: 'youtube', is_rest: false, confidence: 0.8 },
        { date: '2026-10-08', time: null, title: '未定', platform: 'youtube', is_rest: false, confidence: 0.3 },
        { date: '2026-10-05', time: '20:00', title: '今天晚上', platform: 'youtube', is_rest: false, confidence: 0.9 },
      ],
    };
    const v = validateScheduleEntries(parsed, { postDate, now: NOW });
    expect(v.accepted.map((e) => `${e.date} ${e.time} ${e.platform}`)).toEqual(['2026-10-05 20:00 youtube', '2026-10-06 20:00 youtube', '2026-10-07 20:00 twitch']);
    expect(v.rejected.map((r) => r.reason).sort()).toEqual(['date_out_of_window', 'duplicate', 'no_time', 'past', 'rest']);
    expect(decide(parsed, v)).toBe('write');
  });

  it('決策：不是週表→none；信心不足→review；剔除太多→review；沒有可用列但有可疑列→review', () => {
    const postDate = NOW;
    const ok = { date: '2026-10-06', time: '20:00', title: 'x', platform: 'youtube', is_rest: false, confidence: 0.9 };
    expect(decide({ is_schedule: false, confidence: 0.9, entries: [] }, validateScheduleEntries({ entries: [] }, { postDate, now: NOW }))).toBe('none');
    const low = { is_schedule: true, confidence: 0.5, entries: [ok] };
    expect(decide(low, validateScheduleEntries(low, { postDate, now: NOW }))).toBe('review');
    const lowEntry = { is_schedule: true, confidence: 0.9, entries: [{ ...ok, confidence: 0.4 }] };
    expect(decide(lowEntry, validateScheduleEntries(lowEntry, { postDate, now: NOW }))).toBe('review');
    const far = { date: '2026-11-06', time: '20:00', title: 'y', platform: 'youtube', is_rest: false, confidence: 0.9 };
    const tooMany = { is_schedule: true, confidence: 0.9, entries: [ok, far, { ...far, date: '2026-11-07' }] };
    expect(decide(tooMany, validateScheduleEntries(tooMany, { postDate, now: NOW }))).toBe('review');
    const onlyBad = { is_schedule: true, confidence: 0.9, entries: [far] };
    expect(decide(onlyBad, validateScheduleEntries(onlyBad, { postDate, now: NOW }))).toBe('review');
    const onlyRest = { is_schedule: true, confidence: 0.9, entries: [{ ...ok, is_rest: true }] };
    expect(decide(onlyRest, validateScheduleEntries(onlyRest, { postDate, now: NOW }))).toBe('none');
    // 圖上只有日期與標題、沒有時間：送審也補不出時間，不進待審（2026-10-08 兩筆 0 列待審擋住後續貼文）
    const noTime = { is_schedule: true, confidence: 0.5, entries: [{ ...ok, time: null }, { ...ok, date: '2026-10-07', time: null }, { ...ok, is_rest: true }] };
    const vNoTime = validateScheduleEntries(noTime, { postDate, now: NOW });
    expect(vNoTime.rejected.map((r) => r.reason).sort()).toEqual(['no_time', 'no_time', 'rest']);
    expect(decide(noTime, vNoTime)).toBe('none');
    // 沒時間的列混著真正可疑的列（日期超出範圍）仍送審，而且送審的只有那一列可核准的
    const noTimeAndFar = { is_schedule: true, confidence: 0.9, entries: [{ ...ok, time: null }, far] };
    const vFar = validateScheduleEntries(noTimeAndFar, { postDate, now: NOW });
    expect(decide(noTimeAndFar, vFar)).toBe('review');
    expect(reviewEntries(vFar).map((e) => `${e.date} ${e.time}`)).toEqual(['2026-11-06 20:00']);
    // 沒日期（模型給 null 或非 ISO 字串）＋沒時間：也不送審（review 修正：原本會建出 0 列待審）
    const noDate = { is_schedule: true, confidence: 0.5, entries: [{ ...ok, date: null, time: null }, { ...ok, date: '10/7' }] };
    const vNoDate = validateScheduleEntries(noDate, { postDate, now: NOW });
    expect(vNoDate.rejected.map((r) => r.reason).sort()).toEqual(['no_date', 'no_date']);
    expect(decide(noDate, vNoDate)).toBe('none');
    expect(reviewEntries(vNoDate)).toEqual([]);
    // 日曆上不存在、又超出範圍的日期（先被判 date_out_of_window）：不送審（核准 RPC 的 ::date 會報錯）
    const badCal = { is_schedule: true, confidence: 0.9, entries: [{ ...ok, date: '2027-02-30' }] };
    const vBadCal = validateScheduleEntries(badCal, { postDate, now: NOW });
    expect(vBadCal.rejected.map((r) => r.reason)).toEqual(['date_out_of_window']);
    expect(reviewEntries(vBadCal)).toEqual([]);
    expect(decide(badCal, vBadCal)).toBe('none');
    // 全部已過時間：不送審（審核者也無法讓過去的場次變成可寫）
    const allPast = { is_schedule: true, confidence: 0.9, entries: [{ ...ok, date: '2026-10-04' }] };
    expect(validateScheduleEntries(allPast, { postDate, now: NOW }).rejected.map((r) => r.reason)).toEqual(['past']);
    const vPast = validateScheduleEntries(allPast, { postDate, now: NOW });
    expect(decide(allPast, vPast)).toBe('none');
    // 有通過的列時，沒時間的列仍算可疑（大量沒時間可能是讀錯圖）→ 送審，且只送通過的列
    const mixed = { is_schedule: true, confidence: 0.9, entries: [ok, { ...ok, date: '2026-10-07', time: null }, { ...ok, date: '2026-10-08', time: null }] };
    const vMixed = validateScheduleEntries(mixed, { postDate, now: NOW });
    expect(decide(mixed, vMixed)).toBe('review');
    expect(reviewEntries(vMixed)).toEqual(vMixed.accepted);
  });

  it('external_id 形狀', () => {
    expect(postExternalId('UgkxArOhmT2c-kJTMe353hLottirT7KGGe4N', 3)).toBe('post:UgkxArOhmT2c-kJTMe353hLottirT7KGGe4N:3');
  });
});

describe('instructions（給排程 Claude 的讀圖說明）', () => {
  const c = {
    postId: 'UgkxArOhmT2c-kJTMe353hLottirT7KGGe4N',
    name: '懶貓子',
    externalId: 'UCswRX8mNNdn1fjRctZqzjgA',
    postDate: NOW - 12 * 3600e3,
    imageUrl: 'https://yt3.ggpht.com/x=s1600',
    localImage: 'D:\\x\\work\\images\\UgkxArOhmT2c-kJTMe353hLottirT7KGGe4N.jpg',
    text: '🎈今週のschedule🎈\n工作滿滿的一週！！',
  };
  it('候選段落帶發文日期（台北、星期）、圖片路徑與貼文文字', () => {
    const s = candidateSection(c);
    expect(s).toContain('### UgkxArOhmT2c-kJTMe353hLottirT7KGGe4N');
    expect(s).toContain('發文日期（推算，台北）：2026-10-05（星期一）');
    expect(s).toContain(c.localImage);
    expect(s).toContain('🎈今週のschedule🎈 工作滿滿的一週');
  });
  it('整份說明含今天、規則、輸出路徑、schema 與每篇候選', () => {
    const md = buildInstructions([c], { now: NOW, resultsPath: 'D:\\x\\work\\results.json' });
    expect(md).toContain('今天（台北）：2026-10-05');
    expect(md).toContain('JST／JP 的時間要減 1 小時');
    expect(md).toContain('D:\\x\\work\\results.json');
    expect(md).toContain('候選貼文（1 篇）');
    expect(RESULT_SCHEMA.required).toEqual(['is_schedule', 'week_start', 'confidence', 'entries']);
    expect(md).toContain('"is_rest"');
  });
});

describe('env', () => {
  it('KEY=VALUE 解析，略過註解、去引號', () => {
    expect(parseEnvText('# c\nSUPABASE_URL="https://x"\nSUPABASE_SERVICE_ROLE_KEY=k1\n\nBAD LINE\n')).toEqual({ SUPABASE_URL: 'https://x', SUPABASE_SERVICE_ROLE_KEY: 'k1' });
  });

  it('--env local 走 supabase status，且只接受本地網址（.dev.vars 指向正式站，不能拿來當本地）', () => {
    expect(isLocalUrl('http://127.0.0.1:57321')).toBe(true);
    expect(isLocalUrl('https://wrpuhocqfpxqvypvqzjf.supabase.co')).toBe(false);
    const env = loadEnv('local', { status: () => ({ API_URL: 'http://127.0.0.1:57321', SERVICE_ROLE_KEY: 'local-key' }) });
    expect(env).toMatchObject({ supabaseUrl: 'http://127.0.0.1:57321', serviceRoleKey: 'local-key' });
    expect(() => loadEnv('local', { status: () => ({ API_URL: 'https://wrpuhocqfpxqvypvqzjf.supabase.co', SERVICE_ROLE_KEY: 'k' }) })).toThrow(/本地/);
  });
});
