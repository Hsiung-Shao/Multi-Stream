// 名錄資料（schedule_directory RPC 的 groups／people）整理成版面的純函式；edge（vtuber-directory.js）與
// 前端 VtuberDirectoryPage（src/features/schedule/directorySource.ts）共用，分組規則只寫一次。
// 零依賴、純 JS＋JSDoc（functions/ 下不能放 .d.ts）。

/**
 * @typedef {{ id: string, name: string, parent_id: string | null, kind: string | null }} DirectoryGroup
 * @typedef {{ slug: string, name: string, img_url: string | null, group_id: string | null, last_live_at: string | null }} DirectoryPerson
 * @typedef {{ group: DirectoryGroup, members: Array<{ person: DirectoryPerson, subgroup: string | null }> }} DirectorySection
 */

/**
 * 頂層團體（含子團成員，子團名放在 subgroup）＋ 個人勢（沒所屬或所屬是 personal）。
 * 只收有成員的團體，成員多的在前；成員順序沿用 RPC（最近開台在前）。
 * @param {{ groups: DirectoryGroup[], people: DirectoryPerson[] }} data
 * @returns {{ groups: DirectorySection[], independent: DirectoryPerson[] }}
 */
export function groupDirectory(data) {
    const byId = new Map(data.groups.map((g) => [g.id, g]));
    const topOf = (g) => (g.parent_id && byId.has(g.parent_id) ? byId.get(g.parent_id) : g);
    /** @type {Map<string, DirectorySection>} */
    const sections = new Map();
    /** @type {DirectoryPerson[]} */
    const independent = [];
    for (const p of data.people) {
        const g = p.group_id ? byId.get(p.group_id) : null;
        if (!g || g.kind === 'personal') {
            independent.push(p);
            continue;
        }
        const top = topOf(g);
        if (!sections.has(top.id)) sections.set(top.id, { group: top, members: [] });
        sections.get(top.id).members.push({ person: p, subgroup: top.id === g.id ? null : g.name });
    }
    const groups = Array.from(sections.values()).sort(
        (a, b) => b.members.length - a.members.length || a.group.name.localeCompare(b.group.name, 'zh-Hant'),
    );
    return { groups, independent };
}

/**
 * 一個團體區塊的成員依子團排列：頂層直屬成員在前，再依子團名分段（同段內維持 RPC 順序）。
 * @param {DirectorySection['members']} members
 * @returns {Array<{ subgroup: string | null, people: DirectoryPerson[] }>}
 */
export function splitBySubgroup(members) {
    /** @type {Map<string | null, DirectoryPerson[]>} */
    const buckets = new Map();
    for (const { person, subgroup } of members) {
        if (!buckets.has(subgroup)) buckets.set(subgroup, []);
        buckets.get(subgroup).push(person);
    }
    const out = [];
    if (buckets.has(null)) out.push({ subgroup: null, people: buckets.get(null) });
    for (const [subgroup, people] of buckets) if (subgroup !== null) out.push({ subgroup, people });
    return out;
}
