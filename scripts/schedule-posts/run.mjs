#!/usr/bin/env node
// 社群週表圖解析（本機執行、讀圖由 Claude Desktop 排程任務本身完成；使用者 2026-10-05 裁定不接 Anthropic API）。
//
// 兩段式：
//   collect  名冊（T1 的 YouTube 頻道）→ 抓貼文頁 → 有圖且文字含週表關鍵字的新貼文 → 下載圖到 work/images/、
//            寫 work/candidates.json 與 work/INSTRUCTIONS.md（給排程中的 Claude 看圖用）
//   （排程中的 Claude 讀 INSTRUCTIONS.md、看圖、寫 work/results.json）
//   apply    讀 work/results.json → 規則檢查 → 高信心直接寫 streams（source=community_post），
//            低信心寫 vtuber_contributions（action=schedule）待審；每篇記 schedule_community_posts（去重＋稽核）
//   Light 排程（每 10 分鐘）負責把這些場次與待機室合併並發布 snapshot，這支腳本不碰 snapshot。
//
// 用法：node scripts/schedule-posts/run.mjs collect [--env prod|local] [--limit N] [--channel UC…] [--reset]
//      node scripts/schedule-posts/run.mjs apply   [--env prod|local] [--dry-run]
//   --env        prod 讀 scripts/schedule-posts/.env（預設）；local 連線由 supabase status 取得（不讀 .dev.vars，它指向正式站）
//   --limit N    collect 這一輪最多處理 N 個頻道（預設跑完整圈剩下的）
//   --channel    只處理這個頻道（不看分級、不動游標）
//   --reset      游標歸零
//   --dry-run    apply 只印決策不寫庫
//
// 進度存 scripts/schedule-posts/state.json（已 gitignore）：collect 中斷後下次從游標續跑；繞完一圈歸零。
// 保護：同一輪連續 10 個頻道抓不到頁面（限流／斷線）就停；每頻道每輪最多 2 張圖；每日最多 300 張（算 schedule_community_posts）。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv, SCRIPT_DIR } from './lib/env.mjs';
import { Rest, inList } from './lib/db.mjs';
import { BROWSER_UA, fetchPostsPage, imageFullUrl, isScheduleCandidate, parsePostsHtml, relativeToDate } from './lib/posts.mjs';
import { COMMUNITY_POST_MAX_AGE_DAYS, decide, postExternalId, reviewEntries, taipeiDate, validateScheduleEntries, VISION_DAILY_CAP, VISION_PER_CHANNEL_CAP } from './lib/rules.mjs';
import { buildInstructions } from './lib/instructions.mjs';

const STATE_FILE = join(SCRIPT_DIR, 'state.json');
export const WORK_DIR = join(SCRIPT_DIR, 'work');
const CANDIDATES_FILE = join(WORK_DIR, 'candidates.json');
const RESULTS_FILE = join(WORK_DIR, 'results.json');
const INSTRUCTIONS_FILE = join(WORK_DIR, 'INSTRUCTIONS.md');
const IMAGES_DIR = join(WORK_DIR, 'images');
const FETCH_CONCURRENCY = 4;
const CONSECUTIVE_FETCH_FAIL_STOP = 10;
const MODEL_LABEL = 'claude-desktop';

function parseArgs(argv) {
  const a = { cmd: null, env: 'prod', limit: Infinity, channel: null, dryRun: false, reset: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === 'collect' || k === 'apply') a.cmd = k;
    else if (k === '--env') a.env = argv[++i];
    else if (k === '--limit') a.limit = Number(argv[++i]) || Infinity;
    else if (k === '--channel') a.channel = argv[++i];
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--reset') a.reset = true;
    else throw new Error(`不認識的參數 ${k}`);
  }
  if (!a.cmd) throw new Error('請指定 collect 或 apply');
  if (!['prod', 'local'].includes(a.env)) throw new Error('--env 只能是 prod 或 local');
  return a;
}

const EMPTY_STATE = { cursor: null, lapStartedAt: null, lastRunAt: null, laps: 0 };
function loadState() {
  if (!existsSync(STATE_FILE)) return { ...EMPTY_STATE };
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { ...EMPTY_STATE };
  }
}
const saveState = (s) => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

/** 名冊：T1 的 YouTube 頻道（active、非 graduate、有 UC…），依頻道 ID 排序 */
async function loadRoster(db, onlyChannel) {
  const cols = 'id,vtuber_id,external_id,vtubers!inner(name,slug,activity)';
  let rows;
  if (onlyChannel) {
    rows = await db.get(`vtuber_channels?select=${cols}&platform=eq.youtube&external_id=eq.${onlyChannel}&limit=1`);
  } else {
    const states = await db.getAll(
      `schedule_channel_state?select=channel_id,vtuber_channels!inner(${cols},platform,status)&tier=eq.1&vtuber_channels.platform=eq.youtube&vtuber_channels.status=eq.active&vtuber_channels.vtubers.activity=neq.graduate`,
      'channel_id',
    );
    rows = states.map((s) => s.vtuber_channels).filter(Boolean);
  }
  return rows
    .filter((r) => r.external_id && /^UC[a-zA-Z0-9_-]{22}$/.test(r.external_id))
    .map((r) => ({ channelId: r.id, vtuberId: r.vtuber_id, externalId: r.external_id, name: r.vtubers?.name ?? r.external_id, slug: r.vtubers?.slug ?? null }))
    .sort((a, b) => (a.externalId < b.externalId ? -1 : 1));
}

/** 每位 VTuber 的 Twitch 頻道（寫 twitch 平台的列要掛對 channel_id） */
async function loadTwitchChannels(db, vtuberIds) {
  const map = new Map();
  for (let i = 0; i < vtuberIds.length; i += 100) {
    const rows = await db.get(`vtuber_channels?select=id,vtuber_id&platform=eq.twitch&status=eq.active&vtuber_id=${inList(vtuberIds.slice(i, i + 100))}`);
    for (const r of rows) if (!map.has(r.vtuber_id)) map.set(r.vtuber_id, r.id);
  }
  return map;
}

/** 依序派工、最多 limit 個同時；回傳每個 index 的結果 */
async function mapLimit(items, limit, fn) {
  let i = 0;
  const results = new Array(items.length);
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function downloadImage(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`image HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/** 今天（台北）已處理的張數（含 error；與 apply 寫入的狀態一致） */
async function usedToday(db, now) {
  const todayStart = new Date(`${taipeiDate(now)}T00:00:00+08:00`).toISOString();
  return (await db.get(`schedule_community_posts?select=post_id&created_at=gte.${todayStart}&status=in.(parsed,not_schedule,pending_review,error)&limit=${VISION_DAILY_CAP + 1}`)).length;
}

// ===== collect =====
async function collect(args, db, now) {
  const roster = await loadRoster(db, args.channel);
  if (!roster.length) throw new Error('名冊是空的（--channel 不在名冊？或 schedule_channel_state 還沒有分級）');
  const state = args.reset ? { ...EMPTY_STATE } : loadState();
  let start = 0;
  if (!args.channel && state.cursor) {
    const idx = roster.findIndex((c) => c.externalId > state.cursor);
    start = idx < 0 ? 0 : idx;
  }
  const slice = roster.slice(start, start + Math.min(args.limit, roster.length - start));
  log(`名冊 ${roster.length} 個頻道，從第 ${start + 1} 個開始，這輪 ${slice.length} 個`);

  const seen = new Set((await db.getAll(`schedule_community_posts?select=post_id&created_at=gte.${new Date(now - 30 * 86400e3).toISOString()}`, 'post_id')).map((r) => r.post_id));
  // 上一輪 collect 還沒 apply 的候選也算看過（避免同一篇出現兩次）
  const pendingPrev = existsSync(CANDIDATES_FILE) && !existsSync(RESULTS_FILE) ? JSON.parse(readFileSync(CANDIDATES_FILE, 'utf8')) : [];
  for (const c of pendingPrev) seen.add(c.postId);
  let budget = VISION_DAILY_CAP - (await usedToday(db, now)) - pendingPrev.length;
  log(`已看過 ${seen.size} 篇；今天剩餘額度 ${Math.max(0, budget)}／${VISION_DAILY_CAP}`);

  mkdirSync(IMAGES_DIR, { recursive: true });
  const stats = { channels: 0, fetchFail: 0, fetchFailReasons: {}, posts: 0, candidates: 0, imageFail: 0, capped: 0 };
  const out = [...pendingPrev];
  let consecutiveFail = 0;
  let stopped = false;

  async function processChannel(ch) {
    if (stopped) return 'stopped';
    const page = await fetchPostsPage(ch.externalId);
    if (!page.ok) {
      stats.fetchFail++;
      stats.fetchFailReasons[page.reason] = (stats.fetchFailReasons[page.reason] ?? 0) + 1;
      consecutiveFail++;
      if (consecutiveFail >= CONSECUTIVE_FETCH_FAIL_STOP) {
        stopped = true;
        log(`連續 ${CONSECUTIVE_FETCH_FAIL_STOP} 個頻道抓不到貼文頁（${page.reason}），疑似限流，停止這一輪；游標停在連續成功的最後一個頻道`);
      }
      return 'fail';
    }
    consecutiveFail = 0;
    stats.channels++;
    const posts = parsePostsHtml(page.html);
    stats.posts += posts.length;
    const candidates = posts.filter((p) => isScheduleCandidate(p, now, { maxAgeDays: COMMUNITY_POST_MAX_AGE_DAYS }) && !seen.has(p.postId)).slice(0, VISION_PER_CHANNEL_CAP);
    for (const p of candidates) {
      if (budget <= 0) {
        stats.capped++;
        continue; // 不加進 seen：明天額度回來再抓
      }
      seen.add(p.postId);
      const imageUrl = imageFullUrl(p.images[0]);
      const localImage = join(IMAGES_DIR, `${p.postId}.jpg`);
      try {
        await downloadImage(imageUrl, localImage);
      } catch (e) {
        stats.imageFail++;
        log(`  ✗ ${ch.name} ${p.postId} 圖片下載失敗：${e?.message ?? e}`);
        continue;
      }
      budget--;
      stats.candidates++;
      out.push({
        postId: p.postId,
        channelId: ch.channelId,
        vtuberId: ch.vtuberId,
        externalId: ch.externalId,
        name: ch.name,
        slug: ch.slug,
        text: p.text,
        publishedText: p.publishedText,
        postDate: relativeToDate(p.publishedText, now) ?? now,
        imageUrl,
        localImage,
      });
      log(`  候選 ${ch.name} ${p.postId} [${p.publishedText}] ${p.text.slice(0, 50).replace(/\n/g, ' ')}`);
    }
    return 'ok';
  }

  if (!args.channel && !state.lapStartedAt) state.lapStartedAt = new Date(now).toISOString();
  const results = await mapLimit(slice, FETCH_CONCURRENCY, processChannel);

  if (!args.channel) {
    let doneCount = 0;
    while (doneCount < results.length && (results[doneCount] === 'ok' || (!stopped && results[doneCount] === 'fail'))) doneCount++;
    const endIdx = start + doneCount;
    if (endIdx >= roster.length) {
      state.cursor = null;
      state.laps = (state.laps ?? 0) + 1;
      state.lapFinishedAt = new Date().toISOString();
      state.lapStartedAt = null;
      log(`繞完一圈（第 ${state.laps} 圈）`);
    } else {
      state.cursor = roster[endIdx - 1]?.externalId ?? state.cursor;
    }
    state.lastRunAt = new Date().toISOString();
    saveState(state);
  }

  writeFileSync(CANDIDATES_FILE, JSON.stringify(out, null, 2));
  writeFileSync(INSTRUCTIONS_FILE, buildInstructions(out, { now, resultsPath: RESULTS_FILE }));
  log('統計', JSON.stringify(stats));
  log(`候選 ${out.length} 篇 → ${CANDIDATES_FILE}；讀圖說明 → ${INSTRUCTIONS_FILE}`);
  console.log(`CANDIDATES=${out.length}`);
}

// ===== apply =====
async function apply(args, db, now) {
  if (!existsSync(CANDIDATES_FILE)) throw new Error(`找不到 ${CANDIDATES_FILE}，先跑 collect`);
  if (!existsSync(RESULTS_FILE)) throw new Error(`找不到 ${RESULTS_FILE}（排程中的 Claude 還沒看圖？）`);
  const candidates = JSON.parse(readFileSync(CANDIDATES_FILE, 'utf8'));
  const results = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'));
  if (!results || typeof results !== 'object' || Array.isArray(results)) throw new Error('results.json 要是 { "<postId>": {...} } 物件');
  const twitchOf = await loadTwitchChannels(db, [...new Set(candidates.map((c) => c.vtuberId))]);
  const stats = { candidates: candidates.length, missing: 0, parsed: 0, notSchedule: 0, written: 0, canceled: 0, review: 0, reviewSkipped: 0, errors: 0 };
  const leftover = [];

  const record = async (row) => {
    if (args.dryRun) return;
    await db.upsert('schedule_community_posts', [row], 'post_id');
  };

  for (const c of candidates) {
    const parsed = results[c.postId];
    const base = {
      post_id: c.postId,
      channel_id: c.channelId,
      published_at: new Date(c.postDate).toISOString(),
      text_excerpt: (c.text ?? '').slice(0, 300),
      image_url: c.imageUrl,
      status: 'error',
      confidence: null,
      parsed: null,
      entries_written: 0,
      input_tokens: 0,
      output_tokens: 0,
      model: MODEL_LABEL,
      error: null,
    };
    if (!parsed || typeof parsed !== 'object') {
      stats.missing++;
      leftover.push(c); // 沒有結果：留到下一輪再請 Claude 看
      continue;
    }
    try {
      base.parsed = parsed;
      base.confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : null;
      const v = validateScheduleEntries(parsed, { postDate: c.postDate, now });
      const action = decide(parsed, v);
      if (args.dryRun) log(`  [dry-run] ${c.name} ${c.postId} → ${action}`, JSON.stringify({ accepted: v.accepted, rejected: v.rejected }));
      if (action === 'none') {
        // 是週表但沒有可寫的列（例如上週的週表、全休）記 parsed／0 列；真的不是週表才記 not_schedule
        stats.notSchedule++;
        base.status = parsed.is_schedule === true ? 'parsed' : 'not_schedule';
        await record(base);
        continue;
      }
      if (action === 'write') {
        stats.parsed++;
        base.status = 'parsed';
        base.entries_written = v.accepted.length;
        log(`  ✓ ${c.name} ${c.postId} 信心 ${base.confidence} 寫入 ${v.accepted.length} 場：${v.accepted.map((e) => `${e.date.slice(5)} ${e.time} ${e.title}`).join('；')}`);
        if (!args.dryRun) {
          const dMin = v.accepted[0].date;
          const dMax = v.accepted[v.accepted.length - 1].date;
          const lo = new Date(`${dMin}T00:00:00+08:00`).toISOString();
          const hi = new Date(Date.parse(`${dMax}T00:00:00+08:00`) + 86400e3).toISOString();
          // 新週表取代舊週表：同一人、同來源、日期重疊、還沒開台的舊列改 canceled（這篇自己的列由 upsert 覆蓋）
          stats.canceled += await db.patch(
            'streams',
            `vtuber_id=eq.${c.vtuberId}&source=eq.community_post&status=eq.scheduled&scheduled_start=gte.${lo}&scheduled_start=lt.${hi}&external_id=not.like.post:${c.postId}:*`,
            { status: 'canceled', fetched_at: new Date().toISOString() },
          );
          const fetchedAt = new Date().toISOString();
          const rows = v.accepted.map((e, i) => {
            const twitch = e.platform === 'twitch' ? twitchOf.get(c.vtuberId) : null;
            return {
              vtuber_id: c.vtuberId,
              channel_id: twitch ?? c.channelId,
              platform: twitch ? 'twitch' : 'youtube',
              external_id: postExternalId(c.postId, i + 1),
              source: 'community_post',
              status: 'scheduled',
              scheduled_start: e.scheduledStart,
              scheduled_end: null,
              actual_start: null,
              actual_end: null,
              title: e.title || null,
              category: null,
              thumbnail_url: null,
              viewer_count: null,
              is_schedule_frame: false,
              merged_with: null,
              fetched_at: fetchedAt,
            };
          });
          await db.upsert('streams', rows, 'platform,external_id');
          stats.written += rows.length;
        }
        await record(base);
        continue;
      }
      // review
      stats.review++;
      base.status = 'pending_review';
      log(`  ? ${c.name} ${c.postId} 信心 ${base.confidence} 進待審（通過 ${v.accepted.length}、剔除 ${v.rejected.length}）`);
      if (!args.dryRun) {
        const pending = await db.get(`vtuber_contributions?select=id&target_vtuber_id=eq.${c.vtuberId}&action=eq.schedule&status=eq.pending&limit=1`);
        if (pending.length) {
          // 同一人已有待審：這篇不記進 schedule_community_posts（不算看過），審核完的下一輪會再抓到
          stats.reviewSkipped++;
          log(`    （${c.name} 已有待審的週表投稿，這篇下一輪再送）`);
          continue;
        }
        const entries = reviewEntries(v); // 與 decide 同一個條件：送審時一定至少一列可核准
        try {
          await db.insert('vtuber_contributions', {
            action: 'schedule',
            status: 'pending',
            target_vtuber_id: c.vtuberId,
            payload: {
              vtuber_id: c.vtuberId,
              vtuber_name: c.name,
              vtuber_slug: c.slug,
              channel_id: c.channelId,
              platform: 'youtube',
              entries: entries.map((e) => ({ date: e.date, time: e.time, title: e.title ?? '', platform: e.platform === 'twitch' ? 'twitch' : 'youtube' })),
              source: 'vision',
              post_id: c.postId,
              post_url: `https://www.youtube.com/post/${c.postId}`,
              image_url: c.imageUrl,
              confidence: base.confidence,
              model: MODEL_LABEL,
              rejected: v.rejected.map((x) => ({ reason: x.reason, entry: x.entry })),
            },
            submitted_by: 'system:vision',
            source_urls: [`https://www.youtube.com/post/${c.postId}`],
            source_note: `讀圖信心 ${base.confidence ?? '?'}；通過 ${v.accepted.length} 列、剔除 ${v.rejected.length} 列`,
          });
        } catch (e) {
          if (!e?.isUniqueViolation) throw e;
          stats.reviewSkipped++;
          continue;
        }
      }
      await record(base);
    } catch (e) {
      stats.errors++;
      log(`  ✗ ${c.name} ${c.postId} 寫入失敗：${String(e?.message ?? e).slice(0, 300)}`);
    }
  }

  if (!args.dryRun) {
    // 沒有結果的候選留著（下一輪 collect 會併入），其餘清掉
    writeFileSync(CANDIDATES_FILE, JSON.stringify(leftover, null, 2));
    writeFileSync(RESULTS_FILE.replace(/\.json$/, `.applied-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(results, null, 2));
    try {
      (await import('node:fs')).unlinkSync(RESULTS_FILE);
    } catch {}
  }
  log('統計', JSON.stringify(stats));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv(args.env);
  const db = new Rest({ url: env.supabaseUrl, key: env.serviceRoleKey });
  const now = Date.now();
  log(`${args.cmd} env=${args.env} (${env.file}) url=${env.supabaseUrl} dryRun=${args.dryRun}`);
  mkdirSync(WORK_DIR, { recursive: true });
  if (args.cmd === 'collect') await collect(args, db, now);
  else await apply(args, db, now);
}

main().catch((e) => {
  console.error('失敗：', e?.message ?? e);
  process.exit(1);
});
