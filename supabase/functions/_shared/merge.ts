// 雙平台合併（Docs 業務規則「雙平台合併」＋使用者 2026-09-29 裁定：加入畫布時優先 YouTube）。
//
// 同一位實況主、開始時間相差 ≤ 30 分鐘的兩場，視為同一場：
//   - 主場次先看狀態：直播中 > 剛結束 > 排定中（正在播的場次永遠不會被藏進還沒開的待機室）
//   - 同狀態再看平台：YouTube（待機室／直播）> Twitch 直播 > Twitch 週表 > 手動
//   - 可合併的組合：YouTube × Twitch（任一來源）、Twitch 週表 × Twitch 直播（預告已經開台）
//   - 同平台同來源不合併（例如同一人兩個 YouTube 待機室是兩場）
// 非主場次的 merged_with 指向主場次；snapshot 不單獨輸出它，改掛在主場次的 also。
// 剛結束（ended）的場次只當主場次、不會被寫入：直播結束後，對應的預告仍併在它底下，
// 不會在過期前以「已過預定時間」的卡片重新冒出來（呼叫端讀最近 EXPIRE_AFTER_HOURS 內結束的場次）。
// 時間未定（time_tbd，2026-10-14）的社群週表／投稿場次：scheduled_start 是台北當天 00:00，
// 改成併入同一人、同一台北日期的真實場次（不受 30 分鐘限制，選同日離 00:00 最近的一場）；不同台北日期不併。
// 時間未定列只由開始時間不早於它發文時間（announced_at；沒有才用寫入時間 created_at）的場次兌現；同一篇貼文／投稿同一台北日期已有具體時間的列
// （不論狀態）時，時間未定列不參與合併。
// 資料庫端 schedule_merge_fp 的判斷要與這裡一致（migration 20261014100000）。

export const MERGE_WINDOW_MS = 30 * 60_000;

export interface MergeInput {
  id: string;
  vtuber_id: string;
  platform: 'youtube' | 'twitch';
  source: string;
  status: string;
  scheduled_start: string | null;
  actual_start: string | null;
  is_schedule_frame: boolean;
  merged_with?: string | null;
  /** 時間未定場次（只有社群週表／投稿會是 true）：scheduled_start 存台北當天 00:00 */
  time_tbd?: boolean | null;
  /** 發文時間（社群週表＝貼文發文時間、投稿＝投稿時間）：時間未定列只由「開始時間不早於它」的主場次兌現（合併或過期） */
  announced_at?: string | null;
  /** 寫入時間：沒有可解析的 announced_at 時才當兌現基準；兩者都沒有維持舊行為 */
  created_at?: string | null;
  /** 社群週表 post:<貼文鍵>:<n>／投稿 sub:<投稿 id>:<n>：去掉最後的 :<n> 就是同一來源 */
  external_id?: string | null;
}

const STATUS_RANK: Record<string, number> = { live: 0, ended: 1, scheduled: 2 };

/** 沒有影片 ID 的來源：社群週表圖解析、使用者投稿。永遠是最低優先序，任何平台的真實場次出現就把它併掉 */
const NON_VIDEO = new Set(['community_post', 'user_submission']);

function platformRank(s: MergeInput): number {
  if (NON_VIDEO.has(s.source)) return 4;
  if (s.platform === 'youtube') return 0;
  if (s.source === 'twitch_live') return 1;
  if (s.source === 'twitch_schedule') return 2;
  return 3;
}

function rank(s: MergeInput): number {
  return (STATUS_RANK[s.status] ?? 9) * 10 + platformRank(s);
}

const TAIPEI_OFFSET_MS = 8 * 3_600_000;

/** 台北日期序號（台灣沒有日光節約，固定 +8） */
function taipeiDay(t: number): number {
  return Math.floor((t + TAIPEI_OFFSET_MS) / 86_400_000);
}

/** 時間未定的非影片場次 */
function isTbd(s: MergeInput): boolean {
  return !!s.time_tbd && NON_VIDEO.has(s.source);
}

/** 同一篇貼文／同一筆投稿的來源鍵（external_id 去掉最後的 :<n>）；不是 post:／sub: 開頭回 null */
function sourceKey(s: MergeInput): string | null {
  return /^((?:post|sub):.+):\d+$/.exec(s.external_id ?? '')?.[1] ?? null;
}

/** 時間未定列 s 能不能由主場次 p 兌現：p 的開始時間不早於 s 的發文時間（沒有才用寫入時間；都沒有 → 可以） */
function fulfills(p: MergeInput, s: MergeInput): boolean {
  const announced = Date.parse(s.announced_at ?? '');
  const since = Number.isFinite(announced) ? announced : Date.parse(s.created_at ?? '');
  return !Number.isFinite(since) || startOf(p) >= since;
}

/** 主場次 p 與場次 s 的時間是否落在可合併範圍；可合併時回傳距離（ms），否則 Infinity */
function mergeGap(p: MergeInput, s: MergeInput): number {
  const ps = startOf(p);
  const ss = startOf(s);
  const gap = Math.abs(ps - ss);
  if (isTbd(s)) return taipeiDay(ps) === taipeiDay(ss) ? gap : Infinity;
  return gap <= MERGE_WINDOW_MS ? gap : Infinity;
}

function startOf(s: MergeInput): number {
  const t = Date.parse(s.actual_start ?? s.scheduled_start ?? '');
  return Number.isFinite(t) ? t : NaN;
}

/** 兩場能不能合併（不看時間） */
export function canMerge(primary: MergeInput, secondary: MergeInput): boolean {
  if (primary.vtuber_id !== secondary.vtuber_id) return false;
  // 社群週表／投稿併入任何真實場次（同平台也可）；兩個沒有影片 ID 的場次彼此不合併（取代由寫入端處理）
  if (NON_VIDEO.has(secondary.source)) return !NON_VIDEO.has(primary.source);
  if (NON_VIDEO.has(primary.source)) return false;
  if (primary.platform !== secondary.platform) return true; // YouTube × Twitch
  // 同為 Twitch：只有「週表預告」併入「直播（進行中或剛結束）」
  return primary.source === 'twitch_live' && secondary.source === 'twitch_schedule';
}

/**
 * 算出每一場的 merged_with（主場次或沒合併的是 null）。
 * 只處理 scheduled／live、非常駐框、有開始時間的場次；ended 只當主場次候選、不在回傳裡；其餘不在回傳裡（呼叫端不要動它們）。
 */
export function computeMerges(streams: readonly MergeInput[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  // 同一來源同一台北日期已有具體時間的列（不論狀態，所以在狀態過濾前從完整輸入建）：
  // 那一天的開台由具體時間列代表，時間未定列不參與合併（也就不會被 mergePlan 過期）
  const timedDays = new Set<string>();
  for (const s of streams) {
    const key = sourceKey(s);
    if (key && !s.time_tbd && Number.isFinite(startOf(s))) timedDays.add(`${key}@${taipeiDay(startOf(s))}`);
  }
  const blocked = (s: MergeInput): boolean => {
    const key = isTbd(s) ? sourceKey(s) : null;
    return key !== null && timedDays.has(`${key}@${taipeiDay(startOf(s))}`);
  };
  const byVtuber = new Map<string, MergeInput[]>();
  for (const s of streams) {
    if (!(s.status in STATUS_RANK) || s.is_schedule_frame) continue;
    if (!Number.isFinite(startOf(s))) continue;
    const list = byVtuber.get(s.vtuber_id) ?? [];
    list.push(s);
    byVtuber.set(s.vtuber_id, list);
  }

  for (const list of byVtuber.values()) {
    // 優先序高的先當主場次；同優先序依時間
    const sorted = [...list].sort((a, b) => rank(a) - rank(b) || startOf(a) - startOf(b));
    const primaries: MergeInput[] = [];
    for (const s of sorted) {
      if (s.status === 'ended') {
        primaries.push(s);
        continue;
      }
      if (blocked(s)) {
        out.set(s.id, null);
        continue;
      }
      // 找時間最近、可合併、優先序更高的主場次（時間未定列只找寫入之後才開始的）
      let best: MergeInput | null = null;
      let bestGap = Infinity;
      for (const p of primaries) {
        if (rank(p) >= rank(s) || !canMerge(p, s)) continue;
        if (isTbd(s) && !fulfills(p, s)) continue;
        const gap = mergeGap(p, s);
        if (gap < bestGap) {
          best = p;
          bestGap = gap;
        }
      }
      if (best) {
        out.set(s.id, best.id);
      } else {
        out.set(s.id, null);
        primaries.push(s);
      }
    }
  }
  return out;
}

/**
 * 合併計畫：
 *   - changes：merged_with 和資料庫現況不同的列（減少寫入）
 *   - expire：時間未定的非影片場次、選到的主場次已經結束 → 直接過期。
 *     時間未定場次要到台北當天結束才過期，但 ended 主場次只在結束後 EXPIRE_AFTER_HOURS 內被讀進來；
 *     只設 merged_with 的話，主場次一移出視窗，tbd 就被解除合併、以「時間未定・接下來」重新冒出來。
 *     主場次還在 scheduled／live 時照舊只設 merged_with；它變 ended 後的下一輪（一定在視窗內）就會把 tbd 過期。
 */
export function mergePlan(streams: readonly MergeInput[]): { changes: { id: string; merged_with: string | null }[]; expire: string[] } {
  const next = computeMerges(streams);
  const byId = new Map(streams.map((s) => [s.id, s]));
  const changes: { id: string; merged_with: string | null }[] = [];
  const expire: string[] = [];
  for (const s of streams) {
    if (!next.has(s.id)) continue;
    const want = next.get(s.id) ?? null;
    if ((s.merged_with ?? null) !== want) changes.push({ id: s.id, merged_with: want });
    if (want && isTbd(s) && s.status === 'scheduled' && byId.get(want)?.status === 'ended') expire.push(s.id);
  }
  return { changes, expire };
}

/** 只回傳 merged_with 和資料庫現況不同的列（減少寫入） */
export function mergeChanges(streams: readonly MergeInput[]): { id: string; merged_with: string | null }[] {
  return mergePlan(streams).changes;
}
