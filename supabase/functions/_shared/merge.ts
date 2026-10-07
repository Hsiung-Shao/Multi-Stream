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
      // 找時間最近、可合併、優先序更高的主場次
      let best: MergeInput | null = null;
      let bestGap = Infinity;
      for (const p of primaries) {
        if (rank(p) >= rank(s) || !canMerge(p, s)) continue;
        const gap = Math.abs(startOf(p) - startOf(s));
        if (gap <= MERGE_WINDOW_MS && gap < bestGap) {
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

/** 只回傳 merged_with 和資料庫現況不同的列（減少寫入） */
export function mergeChanges(streams: readonly MergeInput[]): { id: string; merged_with: string | null }[] {
  const next = computeMerges(streams);
  const changes: { id: string; merged_with: string | null }[] = [];
  for (const s of streams) {
    if (!next.has(s.id)) continue;
    const want = next.get(s.id) ?? null;
    if ((s.merged_with ?? null) !== want) changes.push({ id: s.id, merged_with: want });
  }
  return changes;
}
