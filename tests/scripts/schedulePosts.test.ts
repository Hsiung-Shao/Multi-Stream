// scripts/schedule-posts：貼文頁解析、相對時間、候選判定、規則檢查、模型輸出 → 決策、給排程 Claude 的讀圖說明、環境設定。
// fixture 由 2026-10-05 真實頁面（懶貓子 /posts）精簡而成：週表貼文（12 小時前、1 圖）、會員桌布（9 天前、1 圖）、沒圖的貼文。
// T 編號對應計畫〈社群週表讀圖排程調整〉的測試規格表
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractInitialData, imageBaseUrl, imageFullUrl, isScheduleCandidate, parsePostsHtml, POST_ID_RE, relativeToDate, SCHEDULE_KEYWORD_RE } from '../../scripts/schedule-posts/lib/posts.mjs';
import { buildStreamRows, decide, postExternalId, reviewEntries, taipeiDate, taipeiToIso, validateScheduleEntries } from '../../scripts/schedule-posts/lib/rules.mjs';
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

  it('剔除不合規的列、其餘依時間排序', () => {
    // 剔除休息日、超出視窗、今天以前、重複；沒時間的列標成時間未定
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
    // 2026-10-14 改版：10/04 早於今天 → past_day；10/08 沒時間 → 時間未定（台北當天 00:00，排在 10/07 20:00 之後）
    expect(v.accepted.map((e) => `${e.date} ${e.time} ${e.platform}`)).toEqual(['2026-10-05 20:00 youtube', '2026-10-06 20:00 youtube', '2026-10-07 20:00 twitch', '2026-10-08 null youtube']);
    expect(v.rejected.map((r) => r.reason).sort()).toEqual(['date_out_of_window', 'duplicate', 'past_day', 'rest']);
    // 時間未定那列信心 0.3 低於單列門檻 → 整批送審
    expect(decide(parsed, v)).toBe('review');
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
    // 圖上只有日期與標題、沒有時間：2026-10-14 起改成時間未定場次通過；整體信心不足仍送審
    const noTime = { is_schedule: true, confidence: 0.5, entries: [{ ...ok, time: null }, { ...ok, date: '2026-10-07', time: null }, { ...ok, is_rest: true }] };
    const vNoTime = validateScheduleEntries(noTime, { postDate, now: NOW });
    expect(vNoTime.rejected.map((r) => r.reason)).toEqual(['rest']);
    expect(vNoTime.accepted.map((e) => `${e.date} ${e.time} ${e.timeTbd}`)).toEqual(['2026-10-06 null true', '2026-10-07 null true']);
    expect(decide(noTime, vNoTime)).toBe('review');
    // 時間未定列＋一列超出範圍：通過的唯一一列是時間未定（過半，T20）→ 送審，送審內容就是通過的列
    const noTimeAndFar = { is_schedule: true, confidence: 0.9, entries: [{ ...ok, time: null }, far] };
    const vFar = validateScheduleEntries(noTimeAndFar, { postDate, now: NOW });
    expect(decide(noTimeAndFar, vFar)).toBe('review');
    expect(reviewEntries(vFar).map((e) => `${e.date} ${e.time}`)).toEqual(['2026-10-06 null']);
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
    // 全部是今天以前的日期：不送審（審核者也無法讓過去的場次變成可寫）
    const allPast = { is_schedule: true, confidence: 0.9, entries: [{ ...ok, date: '2026-10-04' }] };
    expect(validateScheduleEntries(allPast, { postDate, now: NOW }).rejected.map((r) => r.reason)).toEqual(['past_day']);
    const vPast = validateScheduleEntries(allPast, { postDate, now: NOW });
    expect(decide(allPast, vPast)).toBe('none');
    expect(reviewEntries(vPast)).toEqual([]);
    // 今天、但已過 3 小時寬限：仍是 past（NOW＝台北 14:00，10:00 那場）
    const todayPast = { is_schedule: true, confidence: 0.9, entries: [{ ...ok, date: '2026-10-05', time: '10:00' }] };
    const vTodayPast = validateScheduleEntries(todayPast, { postDate, now: NOW });
    expect(vTodayPast.rejected.map((r) => r.reason)).toEqual(['past']);
    expect(decide(todayPast, vTodayPast)).toBe('none');
    // 有時間與沒時間的列混合：沒時間的列以時間未定通過；3 列中 2 列時間未定（過半，T20）→ 送審
    const mixed = { is_schedule: true, confidence: 0.9, entries: [ok, { ...ok, date: '2026-10-07', time: null }, { ...ok, date: '2026-10-08', time: null }] };
    const vMixed = validateScheduleEntries(mixed, { postDate, now: NOW });
    expect(vMixed.accepted).toHaveLength(3);
    expect(vMixed.rejected).toEqual([]);
    expect(decide(mixed, vMixed)).toBe('review');
    expect(reviewEntries(vMixed)).toEqual(vMixed.accepted);
  });

  it('external_id 形狀', () => {
    expect(postExternalId('UgkxArOhmT2c-kJTMe353hLottirT7KGGe4N', 3)).toBe('post:UgkxArOhmT2c-kJTMe353hLottirT7KGGe4N:3');
  });
});

describe('rules：今天以前剔除與時間未定場次（2026-10-14）', () => {
  /** 台北 2026-10-14 10:00 */
  const NOW14 = Date.parse('2026-10-14T10:00:00+08:00');
  const POST12 = Date.parse('2026-10-12T12:00:00+08:00');
  const e = (date: string, time: string | null, over: Record<string, unknown> = {}) => ({ date, time, title: `${date} ${time}`, platform: 'youtube', is_rest: false, confidence: 0.9, ...over });
  const week = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];

  it('T5 早於今天（台北）的日期剔除為 past_day', () => {
    // 今天起通過
    const parsed = { is_schedule: true, confidence: 0.9, entries: week.map((d) => e(d, '20:00')) };
    const v = validateScheduleEntries(parsed, { postDate: POST12, now: NOW14 });
    expect(v.rejected.map((r) => [r.entry.date, r.reason])).toEqual([['2026-10-12', 'past_day'], ['2026-10-13', 'past_day']]);
    expect(v.accepted.map((x) => x.date)).toEqual(week.slice(2));
  });

  it('T5 昨天的列不論時間是否有效都是 past_day', () => {
    // past_day 在日期格式檢查之後、時間檢查之前
    const parsed = { is_schedule: true, confidence: 0.9, entries: [e('2026-10-13', null), e('2026-10-13', '25:00'), e('10/13', '20:00')] };
    const v = validateScheduleEntries(parsed, { postDate: POST12, now: NOW14 });
    expect(v.rejected.map((r) => r.reason)).toEqual(['past_day', 'past_day', 'no_date']);
    expect(v.accepted).toEqual([]);
  });

  it('T6 少量過去日期不讓週表變可疑、直接寫入', () => {
    // 2 列 past_day＋5 列高信心 → write
    const parsed = { is_schedule: true, confidence: 0.9, entries: week.map((d) => e(d, '20:00')) };
    const v = validateScheduleEntries(parsed, { postDate: POST12, now: NOW14 });
    expect(v.accepted).toHaveLength(5);
    expect(decide(parsed, v)).toBe('write');
  });

  it('T6 past_day 比通過的列多仍直接寫入', () => {
    // 週末才讀到上週發的週表
    const now = Date.parse('2026-10-17T10:00:00+08:00');
    // 10/12～10/16 早於今天（其中三列沒時間）、10/17、10/18 通過
    const entries = week.map((d, i) => e(d, i < 5 && i % 2 === 0 ? null : '20:00'));
    const parsed = { is_schedule: true, confidence: 0.9, entries };
    const v = validateScheduleEntries(parsed, { postDate: POST12, now });
    expect(v.rejected.map((r) => r.reason)).toEqual(['past_day', 'past_day', 'past_day', 'past_day', 'past_day']);
    expect(v.accepted.map((x) => x.date)).toEqual(['2026-10-17', '2026-10-18']);
    expect(decide(parsed, v)).toBe('write');
  });

  it('T7 沒時間的列以時間未定通過', () => {
    // time=null、timeTbd=true、scheduledStart＝台北當天 00:00
    const parsed = { is_schedule: true, confidence: 0.9, entries: [e('2026-10-15', null, { title: '雜談', confidence: 0.8 })] };
    const v = validateScheduleEntries(parsed, { postDate: POST12, now: NOW14 });
    expect(v.rejected).toEqual([]);
    expect(v.accepted).toEqual([
      { date: '2026-10-15', time: null, timeTbd: true, scheduledStart: '2026-10-14T16:00:00.000Z', title: '雜談', platform: 'youtube', confidence: 0.8 },
    ]);
  });

  it('T7 time 空字串或缺欄位也算時間未定', () => {
    // 有時間的列 timeTbd=false
    const { time: _drop, ...noKey } = e('2026-10-17', null);
    const parsed = { is_schedule: true, confidence: 0.9, entries: [e('2026-10-15', '20:00'), e('2026-10-16', ''), noKey] };
    const v = validateScheduleEntries(parsed, { postDate: POST12, now: NOW14 });
    expect(v.rejected).toEqual([]);
    expect(v.accepted.map((x) => [x.date, x.time, x.timeTbd, x.scheduledStart])).toEqual([
      ['2026-10-15', '20:00', false, '2026-10-15T12:00:00.000Z'],
      ['2026-10-16', null, true, '2026-10-15T16:00:00.000Z'],
      ['2026-10-17', null, true, '2026-10-16T16:00:00.000Z'],
    ]);
  });

  it('T7 今天的時間未定列在 23:00 仍通過', () => {
    // 不被 3 小時寬限剔除
    const now = Date.parse('2026-10-14T23:00:00+08:00');
    const parsed = { is_schedule: true, confidence: 0.9, entries: [e('2026-10-14', null)] };
    const v = validateScheduleEntries(parsed, { postDate: POST12, now });
    expect(v.rejected).toEqual([]);
    expect(v.accepted.map((x) => [x.date, x.timeTbd, x.scheduledStart])).toEqual([['2026-10-14', true, '2026-10-13T16:00:00.000Z']]);
  });

  it('T7 沒時間的休息日仍是 rest', () => {
    const parsed = { is_schedule: true, confidence: 0.9, entries: [e('2026-10-15', null, { is_rest: true })] };
    const v = validateScheduleEntries(parsed, { postDate: POST12, now: NOW14 });
    expect(v.rejected.map((r) => r.reason)).toEqual(['rest']);
    expect(v.accepted).toEqual([]);
  });

  it('T8 同一天有時間的列時丟掉時間未定列', () => {
    // 時間未定列排在前面也一樣丟掉
    const parsed = { is_schedule: true, confidence: 0.9, entries: [e('2026-10-15', null, { title: '未定' }), e('2026-10-15', '20:00', { title: '晚上' })] };
    const v = validateScheduleEntries(parsed, { postDate: POST12, now: NOW14 });
    expect(v.accepted.map((x) => `${x.date} ${x.time}`)).toEqual(['2026-10-15 20:00']);
    expect(v.rejected).toHaveLength(1);
    expect(v.rejected[0]).toMatchObject({ reason: 'duplicate', entry: { title: '未定' } });
  });

  it('T8 同一天兩個時間未定列時第二個是 duplicate', () => {
    const twoTbd = { is_schedule: true, confidence: 0.9, entries: [e('2026-10-16', null, { title: '第一' }), e('2026-10-16', null, { title: '第二' })] };
    const v2 = validateScheduleEntries(twoTbd, { postDate: POST12, now: NOW14 });
    expect(v2.accepted.map((x) => x.title)).toEqual(['第一']);
    expect(v2.rejected).toHaveLength(1);
    expect(v2.rejected[0]).toMatchObject({ reason: 'duplicate', entry: { title: '第二' } });
  });
});

describe('rules：時間未定過半就送審（2026-10-14）', () => {
  const NOW14 = Date.parse('2026-10-14T10:00:00+08:00');
  const e = (date: string, time: string | null) => ({ date, time, title: `${date} ${time}`, platform: 'youtube', is_rest: false, confidence: 0.9 });
  const run = (entries: ReturnType<typeof e>[]) => {
    const parsed = { is_schedule: true, confidence: 0.9, entries };
    const v = validateScheduleEntries(parsed, { postDate: NOW14, now: NOW14 });
    expect(v.rejected).toEqual([]);
    return decide(parsed, v);
  };

  it('T20 通過的 3 列中 2 列時間未定時即使信心高也送審', () => {
    expect(run([e('2026-10-15', '20:00'), e('2026-10-16', null), e('2026-10-17', null)])).toBe('review');
  });

  it('T20 通過的列全是時間未定時送審', () => {
    expect(run([e('2026-10-15', null), e('2026-10-16', null)])).toBe('review');
  });

  it('T20 3 列中 1 列時間未定時照舊寫入', () => {
    expect(run([e('2026-10-15', '20:00'), e('2026-10-16', '20:00'), e('2026-10-17', null)])).toBe('write');
  });

  it('T20 時間未定剛好一半時照舊寫入', () => {
    expect(run([e('2026-10-15', '20:00'), e('2026-10-16', '20:00'), e('2026-10-17', null), e('2026-10-18', null)])).toBe('write');
  });
});

describe('rules：讀圖結果組成 streams 列（2026-10-14）', () => {
  const c = { vtuberId: 'v1', channelId: 'ytCh', postId: 'UgkxPost', postDate: Date.parse('2026-10-14T00:00:00.000Z') };
  const FETCHED = '2026-10-14T14:00:00.000Z';
  const entry = (date: string, time: string | null, platform = 'youtube') => ({
    date, time, timeTbd: time === null, title: `${date} ${time}`, platform, confidence: 0.9,
    scheduledStart: time === null ? `${date}T00:00:00+08:00` : `${date}T${time}:00+08:00`,
  });
  const items = [
    { e: entry('2026-10-15', '20:00'), n: 1 },
    { e: entry('2026-10-16', null), n: 3 },
    { e: entry('2026-10-17', '21:00', 'twitch'), n: 4 },
  ];

  it('每列的 announced_at 都是發文時間', () => {
    const rows = buildStreamRows(c, items, { twitchChannelId: 'twCh', fetchedAt: FETCHED });
    expect(rows.map((r) => r.announced_at)).toEqual(Array(3).fill('2026-10-14T00:00:00.000Z'));
  });

  it('time_tbd 依 timeTbd、external_id 保留原序號', () => {
    const rows = buildStreamRows(c, items, { twitchChannelId: 'twCh', fetchedAt: FETCHED });
    expect(rows.map((r) => r.time_tbd)).toEqual([false, true, false]);
    expect(rows.map((r) => r.external_id)).toEqual([postExternalId('UgkxPost', 1), postExternalId('UgkxPost', 3), postExternalId('UgkxPost', 4)]);
  });

  it('Twitch 列有 Twitch 頻道時寫 Twitch、沒有時退回 YouTube 頻道', () => {
    const withTw = buildStreamRows(c, items, { twitchChannelId: 'twCh', fetchedAt: FETCHED });
    expect(withTw.map((r) => [r.platform, r.channel_id])).toEqual([['youtube', 'ytCh'], ['youtube', 'ytCh'], ['twitch', 'twCh']]);
    const noTw = buildStreamRows(c, items, { twitchChannelId: null, fetchedAt: FETCHED });
    expect(noTw.map((r) => [r.platform, r.channel_id])).toEqual([['youtube', 'ytCh'], ['youtube', 'ytCh'], ['youtube', 'ytCh']]);
  });

  it('每列欄位集一致（PostgREST bulk upsert 欄位不一致會抹成 null）', () => {
    const rows = buildStreamRows(c, items, { twitchChannelId: 'twCh', fetchedAt: FETCHED });
    const keys = Object.keys(rows[0]).sort();
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(keys);
    expect(rows[0]).toMatchObject({ vtuber_id: 'v1', source: 'community_post', status: 'scheduled', scheduled_start: items[0].e.scheduledStart, fetched_at: FETCHED, merged_with: null, is_schedule_frame: false });
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
