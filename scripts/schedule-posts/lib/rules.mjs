// 模型輸出 → 可寫入的場次：純函式，vitest 直接測。
// 時間一律以台北時間解讀（台灣沒有日光節約，固定 +8）。

export const TAIPEI_OFFSET_MS = 8 * 3600e3;
/** 整體信心達此值才自動上線，否則進後台待審 */
export const VISION_AUTO_MIN_CONFIDENCE = 0.75;
/** 單列信心低於此值的列不自動上線（整批改待審） */
export const ENTRY_MIN_CONFIDENCE = 0.6;
/** 每日最多送模型的圖片數（Haiku 4.5 約 US$0.004／張） */
export const VISION_DAILY_CAP = 300;
/** 每個頻道每輪最多送幾張 */
export const VISION_PER_CHANNEL_CAP = 2;
/** 發文超過這麼多天的貼文不看 */
export const COMMUNITY_POST_MAX_AGE_DAYS = 10;
/** 排定時間過了這麼久還沒開台就不寫（與 Edge Function expireOverdue 的寬限一致） */
export const EXPIRE_GRACE_MS = 3 * 3600e3;
/** 列的日期要落在發文日 −1 ～ +10 天 */
export const ENTRY_WINDOW_DAYS = { before: 1, after: 10 };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ms → 台北日期 YYYY-MM-DD */
export function taipeiDate(ms) {
  return new Date(ms + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

/** 台北日期＋時間 → UTC ISO；格式不對回 null */
export function taipeiToIso(date, time) {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  const ms = Date.parse(`${date}T${time}:00+08:00`);
  if (!Number.isFinite(ms)) return null;
  // Date.parse 會接受 2026-02-30 之類的日期並進位，反查一次擋掉
  if (taipeiDate(ms) !== date) return null;
  return new Date(ms).toISOString();
}

/** 日期差（天，台北曆日） */
function dayDiff(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400e3);
}

/**
 * 檢查模型回的每一列。
 * @param {{ entries?: Array<{date?:string,time?:string|null,title?:string,platform?:string,is_rest?:boolean,confidence?:number}> }} parsed
 * @param {{ postDate: number, now: number }} ctx postDate＝推算的發文時間（ms）
 * @returns {{ accepted: Array<{date,time,title,platform,confidence,scheduledStart}>, rejected: Array<{entry, reason}> }}
 */
export function validateScheduleEntries(parsed, { postDate, now }) {
  const accepted = [];
  const rejected = [];
  const postDay = taipeiDate(postDate);
  const seen = new Set();
  for (const raw of parsed?.entries ?? []) {
    const e = raw ?? {};
    const reject = (reason) => rejected.push({ entry: e, reason });
    if (e.is_rest) {
      reject('rest');
      continue;
    }
    const date = typeof e.date === 'string' ? e.date.trim() : '';
    const time = typeof e.time === 'string' ? e.time.trim() : '';
    if (!DATE_RE.test(date)) {
      reject('no_date');
      continue;
    }
    if (!TIME_RE.test(time)) {
      reject('no_time');
      continue;
    }
    const d = dayDiff(date, postDay);
    if (d < -ENTRY_WINDOW_DAYS.before || d > ENTRY_WINDOW_DAYS.after) {
      reject('date_out_of_window');
      continue;
    }
    const iso = taipeiToIso(date, time);
    if (!iso) {
      reject('bad_datetime');
      continue;
    }
    if (Date.parse(iso) < now - EXPIRE_GRACE_MS) {
      reject('past');
      continue;
    }
    const key = `${date} ${time}`;
    if (seen.has(key)) {
      reject('duplicate');
      continue;
    }
    seen.add(key);
    const title = typeof e.title === 'string' ? e.title.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    accepted.push({
      date,
      time,
      title,
      platform: e.platform === 'twitch' ? 'twitch' : 'youtube',
      confidence: typeof e.confidence === 'number' ? Math.max(0, Math.min(1, e.confidence)) : 0,
      scheduledStart: iso,
    });
  }
  accepted.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  return { accepted, rejected };
}

/**
 * 決定怎麼處理：'write'（直接寫 streams）、'review'（進後台待審）、'none'（不是週表或沒有可用的列）。
 * 「被規則剔除的列比通過的多」也視為可疑（模型可能看錯週）。休息日與已過時間的列不算可疑。
 */
export function decide(parsed, { accepted, rejected }) {
  if (!parsed || parsed.is_schedule !== true) return 'none';
  // 有通過的列時，沒寫時間的列仍算可疑：大量沒時間可能代表讀錯圖，送審讓人確認（審核者可以只核准通過的那幾列）
  const suspicious = rejected.filter((r) => !['rest', 'past'].includes(r.reason)).length;
  // 一列都沒通過時，只有「還有日期＋時間完整、可以核准的列」才送審：沒時間／沒日期的列審核者補不出來，
  // 0 列的待審核准時會失敗（RPC no_entries），還會佔住這個人的待審名額、擋掉之後的貼文 → 當成沒有可寫的列（記 parsed／0 列）
  if (accepted.length === 0) return reviewEntries({ accepted, rejected }).length > 0 ? 'review' : 'none';
  const overall = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
  const minEntry = Math.min(...accepted.map((e) => e.confidence));
  if (overall >= VISION_AUTO_MIN_CONFIDENCE && minEntry >= ENTRY_MIN_CONFIDENCE && suspicious <= accepted.length) return 'write';
  return 'review';
}

/** 審核者無法讓它變成可核准的剔除原因（休息、已過、缺日期／時間、不存在的日期） */
const UNREVIEWABLE_REASONS = ['rest', 'past', 'no_date', 'no_time', 'bad_datetime'];

/**
 * 送審時放進 payload 的列：有通過的列就只送通過的；一列都沒通過時，送「被剔除但日期與時間完整（日曆上存在）、
 * 不是休息日」的列（實際上就是超出日期範圍的），讓審核者判斷。decide 用同一個條件決定要不要送審。
 * 日期超出範圍的檢查排在日曆檢查之前，所以這裡要再用 taipeiToIso 擋掉 2026-02-30 這類（核准 RPC 轉 ::date 會直接報錯）。
 */
export function reviewEntries({ accepted, rejected }) {
  if (accepted.length) return accepted;
  return rejected
    .filter((r) => !UNREVIEWABLE_REASONS.includes(r.reason))
    .map((r) => ({ ...r.entry, date: String(r.entry?.date ?? '').trim(), time: String(r.entry?.time ?? '').trim() }))
    .filter((e) => !e.is_rest && taipeiToIso(e.date, e.time) !== null);
}

/** 寫入 streams 的 external_id */
export const postExternalId = (postId, n) => `post:${postId}:${n}`;
