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
//   x-handles 從 YouTube「關於」頁取本人填的 X 帳號，fxtwitter 個人資料名稱對得上才寫進 vtubers.x_url（只補空的）；
//            對不上的列進 work/x-handles-review.csv 人工看（使用者 2026-10-08 裁定）
//   collect 另外每天一次掃 X（fxtwitter 時間軸，x_url 有值的 T1 VTuber），X 週表圖與 YouTube 的一起交給排程中的 Claude 看
//
// 用法：node scripts/schedule-posts/run.mjs collect   [--env prod|local] [--limit N] [--channel UC…] [--reset] [--x|--no-x]
//      node scripts/schedule-posts/run.mjs apply     [--env prod|local] [--dry-run]
//      node scripts/schedule-posts/run.mjs x-handles [--env prod|local] [--limit N] [--dry-run] [--recheck]
//   --env        prod 讀 scripts/schedule-posts/.env（預設）；local 連線由 supabase status 取得（不讀 .dev.vars，它指向正式站）
//   --limit N    collect：這一輪最多 N 個 YouTube 頻道（X 另計、整圈）；x-handles：最多查 N 位
//   --channel    只處理這個頻道（不看分級、不動游標；要連 X 一起掃加 --x）
//   --reset      游標歸零（YouTube 與 X 都歸零）
//   --x／--no-x  collect 強制掃／不掃 X（預設：距上次掃完 X 超過 20 小時才掃，等於每天一次）
//   --dry-run    apply／x-handles 只印決策不寫庫
//   --recheck    x-handles 忽略「30 天內查過」的紀錄
//
// 進度存 scripts/schedule-posts/state.json（已 gitignore）：collect 中斷後下次從游標續跑；繞完一圈歸零。
// 保護：同一輪連續 10 個頻道抓不到頁面（限流／斷線）就停；每頻道每輪最多 2 張圖；每日最多 300 張（算 schedule_community_posts，
//      YouTube 與 X 共用）；fxtwitter 每次請求間隔 1 秒、429 或連續 10 個失敗就停。

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv, SCRIPT_DIR } from './lib/env.mjs';
import { Rest, inList } from './lib/db.mjs';
import { BROWSER_UA, fetchPostsPage, imageFullUrl, isScheduleCandidate, parsePostsHtml, relativeToDate } from './lib/posts.mjs';
import { COMMUNITY_POST_MAX_AGE_DAYS, decide, postExternalId, postKeyFromExternalId, reviewEntries, supersede, taipeiDate, validateScheduleEntries, VISION_DAILY_CAP, VISION_PER_CHANNEL_CAP } from './lib/rules.mjs';
import { buildInstructions } from './lib/instructions.mjs';
import { agencyVtuberIds, resumeIndex, resumeXIndex, rosterKey, sortCandidates, sortRoster, sortXPeople, xKey } from './lib/priority.mjs';
import { csvCell, decideHandle, extractXHandles, fetchAboutPage, fetchXProfile, parseAboutLinks, xUrlOf } from './lib/xhandles.mjs';
import { fetchXTimeline, handleFromXUrl, isXScheduleCandidate, parseXTimeline, xPostKey, xPostUrl } from './lib/xposts.mjs';

const STATE_FILE = join(SCRIPT_DIR, 'state.json');
// 工作目錄依環境分開：正式站 work/、本地 work-local/（本地測試的候選不能被帶進正式站；setStateEnv 設定）
let WORK_DIR, CANDIDATES_FILE, RESULTS_FILE, INSTRUCTIONS_FILE, IMAGES_DIR, X_REVIEW_FILE;
function setWorkDir(dir) {
  WORK_DIR = join(SCRIPT_DIR, dir);
  CANDIDATES_FILE = join(WORK_DIR, 'candidates.json');
  RESULTS_FILE = join(WORK_DIR, 'results.json');
  INSTRUCTIONS_FILE = join(WORK_DIR, 'INSTRUCTIONS.md');
  IMAGES_DIR = join(WORK_DIR, 'images');
  X_REVIEW_FILE = join(WORK_DIR, 'x-handles-review.csv');
}
setWorkDir('work');
const FETCH_CONCURRENCY = 4;
const CONSECUTIVE_FETCH_FAIL_STOP = 10;
const MODEL_LABEL = 'claude-desktop';
/** fxtwitter 請求間隔（第三方免費服務，放慢一點） */
const X_REQUEST_GAP_MS = 1000;
/** X 每天掃一次：距上次掃完超過這麼久才掃 */
const X_LAP_INTERVAL_MS = 20 * 3600e3;
/** x-handles：查過的 VTuber 這麼多天內不重查 */
const X_HANDLE_RECHECK_DAYS = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const a = { cmd: null, env: 'prod', limit: Infinity, channel: null, dryRun: false, reset: false, x: null, recheck: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === 'collect' || k === 'apply' || k === 'x-handles') a.cmd = k;
    else if (k === '--env') a.env = argv[++i];
    else if (k === '--limit') a.limit = Number(argv[++i]) || Infinity;
    else if (k === '--channel') a.channel = argv[++i];
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--reset') a.reset = true;
    else if (k === '--x') a.x = true;
    else if (k === '--no-x') a.x = false;
    else if (k === '--recheck') a.recheck = true;
    else if (k === '--x-limit') a.xLimit = Number(argv[++i]) || Infinity;
    else throw new Error(`不認識的參數 ${k}`);
  }
  if (!a.cmd) throw new Error('請指定 collect、apply 或 x-handles');
  if (!['prod', 'local'].includes(a.env)) throw new Error('--env 只能是 prod 或 local');
  return a;
}

const EMPTY_STATE = { cursor: null, lapStartedAt: null, lastRunAt: null, laps: 0 };
/**
 * 進度檔依環境分開：正式站 state.json、本地 state.local.json。
 * 2026-10-08 教訓：共用一個檔時，本地跑過的游標與「X 帳號查過」紀錄會讓正式站跳過那些頻道。
 */
let stateFile = STATE_FILE;
function setStateEnv(env) {
  stateFile = env === 'local' ? join(SCRIPT_DIR, 'state.local.json') : STATE_FILE;
  setWorkDir(env === 'local' ? 'work-local' : 'work');
}
function loadState() {
  if (!existsSync(stateFile)) return { ...EMPTY_STATE };
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return { ...EMPTY_STATE };
  }
}
const saveState = (s) => writeFileSync(stateFile, JSON.stringify(s, null, 2));
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

/** 名冊：T1 的 YouTube 頻道（active、非 graduate、有 UC…），依頻道 ID 排序 */
async function loadRoster(db, onlyChannel) {
  const cols = 'id,vtuber_id,external_id,vtubers!inner(name,slug,activity,group_id)';
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
  const agency = await loadAgencyVtuberIds(db, taipeiDate(Date.now()), rows);
  return sortRoster(
    rows
      .filter((r) => r.external_id && /^UC[a-zA-Z0-9_-]{22}$/.test(r.external_id))
      .map((r) => ({ channelId: r.id, vtuberId: r.vtuber_id, externalId: r.external_id, name: r.vtubers?.name ?? r.external_id, slug: r.vtubers?.slug ?? null, isAgency: agency.has(r.vtuber_id) })),
  );
}

/** 企業勢 vtuber id 集合：團體階層＋名冊成員的 group_id＋合作藝人關係（有效期間含今天） */
async function loadAgencyVtuberIds(db, today, rosterRows) {
  const groups = await db.getAll('vtuber_groups?select=id,kind,parent_id', 'id');
  const links = await db.getAll('vtuber_group_links?select=vtuber_id,group_id,role,since,until', 'vtuber_id,group_id');
  const vtubers = rosterRows.map((r) => ({ id: r.vtuber_id, group_id: r.vtubers?.group_id ?? null }));
  return agencyVtuberIds({ groups, vtubers, links, today });
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
  const state = loadState();
  // --reset 只歸零游標（YouTube 與 X），不清 x-handles 的查過紀錄
  if (args.reset) Object.assign(state, { cursor: null, lapStartedAt: null, xCursor: null });
  let start = 0;
  if (!args.channel && state.cursor) {
    start = resumeIndex(roster, state.cursor); // 舊格式游標（沒有 0:／1: 前綴）會從頭開始
  }
  const slice = roster.slice(start, start + Math.min(args.limit, roster.length - start));
  log(`名冊 ${roster.length} 個頻道（企業勢 ${roster.filter((c) => c.isAgency).length}），從第 ${start + 1} 個開始，這輪 ${slice.length} 個`);

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
        site: 'youtube',
        postId: p.postId,
        postUrl: `https://www.youtube.com/post/${p.postId}`,
        channelId: ch.channelId,
        vtuberId: ch.vtuberId,
        externalId: ch.externalId,
        name: ch.name,
        slug: ch.slug,
        isAgency: ch.isAgency === true,
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
      state.cursor = endIdx > 0 ? rosterKey(roster[endIdx - 1]) : state.cursor;
    }
    state.lastRunAt = new Date().toISOString();
    saveState(state);
  }

  // ===== X：每天一次（--x 強制、--no-x 跳過） =====
  const xDue = args.x ?? (!args.channel && (!state.xLapAt || now - Date.parse(state.xLapAt) > X_LAP_INTERVAL_MS));
  if (xDue) {
    const xs = await collectX({ args, db, now, state, roster, seen, out, getBudget: () => budget, useBudget: () => budget-- });
    stats.x = xs;
    if (!args.channel) saveState(state);
  } else {
    log(`X：這輪不掃（上次掃完 ${state.xLapAt ?? '從未'}；--x 可強制）`);
  }

  // 舊候選（pendingPrev）可能沒有 isAgency 欄位：以 vtuberId 是否在名冊的企業勢內補上
  const agencyIds = new Set(roster.filter((c) => c.isAgency).map((c) => c.vtuberId));
  for (const c of out) if (typeof c.isAgency !== 'boolean') c.isAgency = agencyIds.has(c.vtuberId);
  const sorted = sortCandidates(out);
  writeFileSync(CANDIDATES_FILE, JSON.stringify(sorted, null, 2));
  writeFileSync(INSTRUCTIONS_FILE, buildInstructions(sorted, { now, resultsPath: RESULTS_FILE }));
  log('統計', JSON.stringify(stats));
  log(`候選 ${out.length} 篇 → ${CANDIDATES_FILE}；讀圖說明 → ${INSTRUCTIONS_FILE}`);
  console.log(`CANDIDATES=${out.length}`);
}

// ===== collect：X =====
/**
 * 掃 x_url 有值的 T1 VTuber 的 X 時間軸（fxtwitter，依序、間隔 1 秒），週表圖加進 out。
 * 一圈掃完記 state.xLapAt（每天一次的依據）；中途停（429、連續失敗、--x-limit）記 state.xCursor 下次續掃。
 */
async function collectX({ args, db, now, state, roster, seen, out, getBudget, useBudget }) {
  // 每位 VTuber 一筆（掛在第一個 YouTube 頻道上），依 handle 排序
  const byVtuber = new Map();
  for (const ch of roster) if (!byVtuber.has(ch.vtuberId)) byVtuber.set(ch.vtuberId, ch);
  const ids = [...byVtuber.keys()];
  const found = [];
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await db.get(`vtubers?select=id,x_url&x_url=not.is.null&id=${inList(ids.slice(i, i + 100))}`);
    for (const r of rows) {
      const handle = handleFromXUrl(r.x_url);
      if (handle) found.push({ ...byVtuber.get(r.id), handle });
    }
  }
  // 游標鍵 xKey：企業勢 0:、個人勢 1: 加小寫 handle；排序與續掃同一套 code unit 比較（舊格式游標沒有前綴 → 從頭開始）
  const people = sortXPeople(found);
  const start = args.channel ? 0 : resumeXIndex(people, state.xCursor);
  const slice = people.slice(start, start + Math.min(args.xLimit ?? Infinity, people.length - start));
  log(`X：${people.length} 個帳號，從第 ${start + 1} 個開始，這輪 ${slice.length} 個`);

  const xs = { accounts: 0, fail: 0, failReasons: {}, posts: 0, candidates: 0, imageFail: 0, capped: 0, stoppedBy: null };
  let consecutiveFail = 0;
  let done = 0;
  /** 最後一個成功的位置（被停下時游標退回這裡，連續失敗的那幾個下次重掃） */
  let lastOk = 0;
  for (const p of slice) {
    if (done > 0) await sleep(X_REQUEST_GAP_MS);
    const r = await fetchXTimeline(p.handle);
    if (!r.ok) {
      xs.fail++;
      xs.failReasons[r.reason] = (xs.failReasons[r.reason] ?? 0) + 1;
      consecutiveFail++;
      if (r.reason === 'rate_limited' || consecutiveFail >= CONSECUTIVE_FETCH_FAIL_STOP) {
        xs.stoppedBy = r.reason === 'rate_limited' ? 'rate_limited' : 'consecutive_fail';
        log(`X：${xs.stoppedBy === 'rate_limited' ? 'fxtwitter 回 429' : `連續 ${CONSECUTIVE_FETCH_FAIL_STOP} 個失敗（${r.reason}）`}，停止這一輪`);
        break;
      }
      done++;
      continue;
    }
    consecutiveFail = 0;
    xs.accounts++;
    lastOk = done + 1;
    const posts = parseXTimeline(r.json, p.handle);
    xs.posts += posts.length;
    const candidates = posts
      .filter((t) => isXScheduleCandidate(t, now, { maxAgeDays: COMMUNITY_POST_MAX_AGE_DAYS }) && !seen.has(xPostKey(t.id)))
      .slice(0, VISION_PER_CHANNEL_CAP);
    for (const t of candidates) {
      if (getBudget() <= 0) {
        xs.capped++;
        continue; // 不加進 seen：明天額度回來再抓
      }
      const key = xPostKey(t.id);
      seen.add(key);
      const localImage = join(IMAGES_DIR, `x_${t.id}.jpg`);
      try {
        await downloadImage(t.images[0], localImage);
      } catch (e) {
        xs.imageFail++;
        log(`  ✗ ${p.name} ${key} 圖片下載失敗：${e?.message ?? e}`);
        continue;
      }
      useBudget();
      xs.candidates++;
      out.push({
        site: 'x',
        handle: p.handle,
        postId: key,
        postUrl: xPostUrl(p.handle, t.id),
        channelId: p.channelId,
        vtuberId: p.vtuberId,
        externalId: p.externalId,
        name: p.name,
        slug: p.slug,
        isAgency: p.isAgency === true,
        text: t.text,
        publishedText: new Date(t.createdAt).toISOString(),
        postDate: t.createdAt,
        imageUrl: t.images[0],
        localImage,
      });
      log(`  候選 X ${p.name} @${p.handle} ${key} [${new Date(t.createdAt).toISOString().slice(0, 16)}] ${t.text.slice(0, 50).replace(/\n/g, ' ')}`);
    }
    done++;
  }

  if (!args.channel) {
    const finished = !xs.stoppedBy && start + done >= people.length;
    if (finished) {
      state.xCursor = null;
      state.xLapAt = new Date().toISOString();
      log('X：掃完一圈');
    } else {
      // 被停下：退回最後一個成功的位置；--x-limit 正常用完則停在最後處理的位置
      const upto = xs.stoppedBy ? lastOk : done;
      if (upto > 0) state.xCursor = xKey(slice[upto - 1]);
    }
  }
  return xs;
}

// ===== x-handles =====
/** Excel 開 UTF-8 CSV 需要 BOM 才不會亂碼 */
const CSV_BOM = '﻿';
const REVIEW_HEADER = '日期,VTuber,slug,YouTube,X 帳號,X 顯示名稱,原因';
const reviewCsvRow = (r, day) => [day, r.name, r.slug, `https://www.youtube.com/channel/${r.youtube}`, r.handle, r.xName, r.reason].map(csvCell).join(',');
/**
 * 從 YouTube「關於」頁取本人填的 X 帳號，fxtwitter 名稱對得上才寫 vtubers.x_url（只補空的）。
 * 對不上的列進 work/x-handles-review.csv；查過的記在 state.json（30 天內不重查，暫時性錯誤不記）。
 */
async function xHandles(args, db, now) {
  const state = loadState();
  state.xHandles ??= { checked: {} };
  const checked = state.xHandles.checked;
  const fresh = (id) => !args.recheck && checked[id] && now - Date.parse(checked[id]) < X_HANDLE_RECHECK_DAYS * 86400e3;
  const all = await db.getAll('vtubers?select=id,name,slug,youtube_channel_id&x_url=is.null&youtube_channel_id=not.is.null&activity=neq.graduate', 'id');
  const todo = all.filter((v) => /^UC[a-zA-Z0-9_-]{22}$/.test(v.youtube_channel_id) && !fresh(v.id)).slice(0, args.limit);
  log(`x-handles：x_url 空白 ${all.length} 位，這輪查 ${todo.length} 位${args.dryRun ? '（dry-run）' : ''}`);

  // 1. 關於頁（YouTube，並行 4）
  const abouts = await mapLimit(todo, FETCH_CONCURRENCY, async (v) => {
    const page = await fetchAboutPage(v.youtube_channel_id);
    if (!page.ok) return { v, error: page.reason };
    const links = parseAboutLinks(page.html);
    if (!links) return { v, error: 'no_initial_data' };
    return { v, handles: extractXHandles(links) };
  });

  // 2. fxtwitter 個人資料（依序、間隔 1 秒）；對上一個就停
  const stats = { checked: 0, aboutFail: 0, none: 0, write: 0, written: 0, review: 0, transient: 0, stoppedBy: null };
  const review = [];
  let consecutiveFail = 0;
  let requests = 0;
  const mark = (id) => (checked[id] = new Date().toISOString());
  for (const a of abouts) {
    if (stats.stoppedBy) break;
    if (a.error) {
      stats.aboutFail++;
      continue; // 不記查過：下次再試
    }
    const { v, handles } = a;
    const tries = [];
    let transient = false;
    for (const h of handles) {
      if (requests++ > 0) await sleep(X_REQUEST_GAP_MS);
      const profile = await fetchXProfile(h);
      if (!profile.ok && profile.reason !== 'not_found') {
        consecutiveFail++;
        if (profile.reason === 'http_429' || consecutiveFail >= CONSECUTIVE_FETCH_FAIL_STOP) {
          stats.stoppedBy = profile.reason === 'http_429' ? 'rate_limited' : 'consecutive_fail';
          log(`x-handles：fxtwitter ${stats.stoppedBy === 'rate_limited' ? '回 429' : `連續失敗（${profile.reason}）`}，停止`);
        }
        transient = true;
        break;
      }
      consecutiveFail = 0;
      tries.push({ handle: h, profile });
      const d0 = decideHandle(v.name, [h], [{ handle: h, profile }], v.slug);
      if (d0.action === 'write') break;
    }
    if (transient) {
      stats.transient++;
      continue; // 暫時性錯誤：不記查過
    }
    stats.checked++;
    const d = decideHandle(v.name, handles, tries, v.slug);
    if (d.action === 'none') {
      stats.none++;
    } else if (d.action === 'write') {
      stats.write++;
      log(`  ✓ ${v.name} → @${d.handle}${d.reason === 'matched_of_many' ? `（${handles.length} 個帳號中對上的）` : ''}`);
      if (!args.dryRun) stats.written += await db.patch('vtubers', `id=eq.${v.id}&x_url=is.null`, { x_url: xUrlOf(d.handle) });
    } else {
      stats.review++;
      review.push({ name: v.name, slug: v.slug, youtube: v.youtube_channel_id, handle: handles.join(' '), xName: d.xName ?? '', reason: d.reason });
      log(`  ? ${v.name} → @${handles.join(' @')}（${d.reason}${d.xName ? `：X 名稱「${d.xName}」` : ''}）`);
    }
    if (!args.dryRun) mark(v.id);
    if (!args.dryRun && stats.checked % 50 === 0) saveState(state);
  }

  mkdirSync(WORK_DIR, { recursive: true });
  // x-handles-review.csv＝這一輪的清單；另外累積到 x-handles-review-all.csv（查過的人 30 天內不重查，
  // 不累積的話每天的小輪次會把首次全量的清單蓋掉）
  const rows = review.map((r) => reviewCsvRow(r, new Date(now).toISOString().slice(0, 10)));
  writeFileSync(X_REVIEW_FILE, CSV_BOM + [REVIEW_HEADER, ...rows].join('\r\n') + '\r\n');
  if (rows.length && !args.dryRun) {
    const all = X_REVIEW_FILE.replace(/\.csv$/, '-all.csv');
    if (!existsSync(all)) writeFileSync(all, CSV_BOM + REVIEW_HEADER + '\r\n');
    appendFileSync(all, rows.join('\r\n') + '\r\n');
  }
  if (!args.dryRun) saveState(state);
  log('統計', JSON.stringify(stats));
  log(`待人工確認 ${review.length} 位 → ${X_REVIEW_FILE}`);
  console.log(`X_REVIEW=${review.length}`);
}

// ===== apply =====
async function apply(args, db, now) {
  if (!existsSync(CANDIDATES_FILE)) throw new Error(`找不到 ${CANDIDATES_FILE}，先跑 collect`);
  if (!existsSync(RESULTS_FILE)) throw new Error(`找不到 ${RESULTS_FILE}（排程中的 Claude 還沒看圖？）`);
  const candidates = JSON.parse(readFileSync(CANDIDATES_FILE, 'utf8'));
  const results = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'));
  if (!results || typeof results !== 'object' || Array.isArray(results)) throw new Error('results.json 要是 { "<postId>": {...} } 物件');
  const twitchOf = await loadTwitchChannels(db, [...new Set(candidates.map((c) => c.vtuberId))]);
  const stats = { candidates: candidates.length, missing: 0, parsed: 0, notSchedule: 0, written: 0, canceled: 0, superseded: 0, review: 0, reviewSkipped: 0, errors: 0 };
  const leftover = [];

  const record = async (row) => {
    if (args.dryRun) return;
    await db.upsert('schedule_community_posts', [row], 'post_id');
  };

  // 依發文時間由舊到新處理：同一份週表 YouTube 與 X 都貼時，較新的那篇最後寫入
  const ordered = [...candidates].sort((a, b) => a.postDate - b.postDate);
  for (const c of ordered) {
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
        base.status = 'parsed';
        // 新週表取代舊週表，依發文時間判斷（同一人、同來源、日期重疊、還沒開台的列）
        const dMin = v.accepted[0].date;
        const dMax = v.accepted[v.accepted.length - 1].date;
        const lo = new Date(`${dMin}T00:00:00+08:00`).toISOString();
        const hi = new Date(Date.parse(`${dMax}T00:00:00+08:00`) + 86400e3).toISOString();
        const overlap = await db.get(
          `streams?select=external_id,scheduled_start&vtuber_id=eq.${c.vtuberId}&source=eq.community_post&status=eq.scheduled&scheduled_start=gte.${lo}&scheduled_start=lt.${hi}`,
        );
        const keys = [...new Set(overlap.map((r) => postKeyFromExternalId(r.external_id)).filter((k) => k && k !== c.postId))];
        const publishedAt = new Map();
        if (keys.length) {
          for (const r of await db.get(`schedule_community_posts?select=post_id,published_at&post_id=${inList(keys)}`)) {
            if (r.published_at) publishedAt.set(r.post_id, Date.parse(r.published_at));
          }
        }
        const sup = supersede(overlap, publishedAt, c.postId, c.postDate);
        if (sup.superseded) {
          stats.superseded++;
          base.error = 'superseded';
          log(`  = ${c.name} ${c.postId} 已有較新的週表涵蓋同一段日期，不寫入`);
          await record(base);
          continue;
        }
        // 同一版本（發文時間相近、有一邊是 YouTube）已經寫過的日期不重寫，只補缺的日期；保留原本的序號讓 external_id 穩定
        const toWrite = v.accepted.map((e, i) => ({ e, n: i + 1 })).filter(({ e }) => !sup.skipDates.has(e.date));
        if (!toWrite.length) {
          stats.superseded++;
          base.error = 'covered';
          log(`  = ${c.name} ${c.postId} 同一份週表已由另一篇寫入，日期都已涵蓋`);
          await record(base);
          continue;
        }
        stats.parsed++;
        base.entries_written = toWrite.length;
        const skipped = v.accepted.length - toWrite.length;
        log(`  ✓ ${c.name} ${c.postId} 信心 ${base.confidence} 寫入 ${toWrite.length} 場${skipped ? `（${skipped} 場已由同一份週表的另一篇寫入）` : ''}${sup.cancel.length ? `、取代 ${sup.cancel.length} 場舊的` : ''}：${toWrite.map(({ e }) => `${e.date.slice(5)} ${e.timeTbd ? '時間未定' : e.time} ${e.title}`).join('；')}`);
        if (!args.dryRun) {
          if (sup.cancel.length) {
            stats.canceled += await db.patch(
              'streams',
              `vtuber_id=eq.${c.vtuberId}&source=eq.community_post&status=eq.scheduled&external_id=${inList(sup.cancel)}`,
              { status: 'canceled', fetched_at: new Date().toISOString() },
            );
          }
          const fetchedAt = new Date().toISOString();
          const rows = toWrite.map(({ e, n }) => {
            const twitch = e.platform === 'twitch' ? twitchOf.get(c.vtuberId) : null;
            return {
              vtuber_id: c.vtuberId,
              channel_id: twitch ?? c.channelId,
              platform: twitch ? 'twitch' : 'youtube',
              external_id: postExternalId(c.postId, n),
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
              time_tbd: e.timeTbd === true,
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
              entries: entries.map((e) => ({ date: e.date, time: e.time ?? null, title: e.title ?? '', platform: e.platform === 'twitch' ? 'twitch' : 'youtube' })),
              source: 'vision',
              post_id: c.postId,
              post_url: c.postUrl ?? `https://www.youtube.com/post/${c.postId}`,
              image_url: c.imageUrl,
              confidence: base.confidence,
              model: MODEL_LABEL,
              rejected: v.rejected.map((x) => ({ reason: x.reason, entry: x.entry })),
            },
            submitted_by: 'system:vision',
            source_urls: [c.postUrl ?? `https://www.youtube.com/post/${c.postId}`],
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
  setStateEnv(args.env);
  const db = new Rest({ url: env.supabaseUrl, key: env.serviceRoleKey });
  const now = Date.now();
  log(`${args.cmd} env=${args.env} (${env.file}) url=${env.supabaseUrl} dryRun=${args.dryRun}`);
  mkdirSync(WORK_DIR, { recursive: true });
  if (args.cmd === 'collect') await collect(args, db, now);
  else if (args.cmd === 'x-handles') await xHandles(args, db, now);
  else await apply(args, db, now);
}

main().catch((e) => {
  console.error('失敗：', e?.message ?? e);
  process.exit(1);
});
