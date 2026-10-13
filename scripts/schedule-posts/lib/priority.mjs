// 企業勢優先：名冊排序、游標續掃、候選排序。純函式，vitest 直接測。

/**
 * 企業勢的 vtuber id 集合：本人所屬團體（含往上任一層父團）為 agency，或有效中的合作藝人關係（since/until 含當天）指向 agency 團體。
 * @param {{ groups: Array<{id,kind,parent_id}>, vtubers: Array<{id,group_id}>, links: Array<{vtuber_id,group_id,since?,until?}>, today: string }} p
 */
export function agencyVtuberIds({ groups, vtubers, links, today }) {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const cache = new Map();
  const isAgencyGroup = (id) => {
    if (id == null) return false;
    if (cache.has(id)) return cache.get(id);
    cache.set(id, false); // 防循環
    let cur = byId.get(id);
    let result = false;
    for (let i = 0; cur && i < 10; i++) {
      if (cur.kind === 'agency') {
        result = true;
        break;
      }
      cur = cur.parent_id ? byId.get(cur.parent_id) : null;
    }
    cache.set(id, result);
    return result;
  };
  const out = new Set();
  for (const v of vtubers) if (isAgencyGroup(v.group_id)) out.add(v.id);
  for (const l of links) {
    if (l.since && l.since > today) continue;
    if (l.until && l.until < today) continue;
    if (isAgencyGroup(l.group_id)) out.add(l.vtuber_id);
  }
  return out;
}

/** 游標鍵：企業勢 0:、個人勢 1: */
export const rosterKey = (c) => `${c.isAgency ? 0 : 1}:${c.externalId}`;

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** 企業勢在前，同組依 externalId；回傳新陣列 */
export function sortRoster(roster) {
  return [...roster].sort((a, b) => cmp(rosterKey(a), rosterKey(b)));
}

/** 從游標之後的第一個名冊位置；null、舊格式、已過最後一個 → 0 */
export function resumeIndex(roster, cursor) {
  if (typeof cursor !== 'string' || !/^[01]:/.test(cursor)) return 0;
  const i = roster.findIndex((c) => cmp(rosterKey(c), cursor) > 0);
  return i === -1 ? 0 : i;
}

/** 候選：企業勢在前，同組依發文時間由舊到新；回傳新陣列 */
export function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => Number(!!b.isAgency) - Number(!!a.isAgency) || a.postDate - b.postDate);
}
