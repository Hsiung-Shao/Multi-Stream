// 週表選了某家企業勢時的成員名冊：公司本身＋子團的所有成員（含已畢業）。
// anon 查 PostgREST（restClient.ts），vtuber_groups 與 vtubers 都是公開可讀。
// graduated_at／former_group_id 由 20260929120000 migration 新增；還沒上線的環境 PostgREST 回 400，退回不帶這兩欄。
// 離開公司但繼續活動的人（former_group_id）也列入，在名冊裡算「已畢業」。

import { SnapshotError } from './snapshotSource';
import { resolveRestConfig, restGet, type RestOptions } from './restClient';

export interface RosterMember {
    id: string;
    name: string;
    avatar?: string;
    slug?: string;
    /** active／preparing／graduate */
    activity: string;
    debut?: string;
    graduated?: string;
    /** 所屬團體（子團或公司本身）的名稱 */
    group: string;
}

export interface RosterSection {
    /** 團體名；公司本身的成員也是一個區塊 */
    name: string;
    members: RosterMember[];
}

export interface AgencyRoster {
    agency: string;
    sections: RosterSection[];
    activeCount: number;
    graduatedCount: number;
}

interface GroupRow {
    id: string;
    name: string;
    parent_id: string | null;
}

interface MemberRow {
    id: string;
    name: string;
    img_url: string | null;
    slug: string | null;
    activity: string;
    debut_date: string | null;
    graduated_at?: string | null;
    group_id: string | null;
    former_group_id?: string | null;
    is_official?: boolean;
}

const MEMBER_COLS = 'id,name,img_url,slug,activity,debut_date,group_id';
/** graduated_at／former_group_id／is_official 由 20260929120000 migration 新增 */
const MEMBER_COLS_NEW = `${MEMBER_COLS},graduated_at,former_group_id,is_official`;
const MEMBER_LIMIT = 500;

const toMember = (r: MemberRow, group: string, left: boolean): RosterMember => {
    // 離開公司但繼續活動（轉個人勢）：在這家的名冊裡算「已畢業」
    const m: RosterMember = { id: r.id, name: r.name, activity: left ? 'graduate' : r.activity, group };
    if (r.img_url) m.avatar = r.img_url;
    if (r.slug) m.slug = r.slug;
    if (r.debut_date) m.debut = r.debut_date;
    if (r.graduated_at) m.graduated = r.graduated_at;
    return m;
};

/**
 * 官方頻道不是藝人。首選資料庫的 is_official（企業勢名冊產生器標記）；
 * 欄位還沒上線或沒標到時退回名字判斷：名字等於公司或團名，或帶「官方頻道／Official Channel」。
 * 它們仍掛在團體上（週表篩選看得到官方直播），只是名冊不列。
 */
export function isOfficialChannel(name: string, groupNames: readonly string[], flag?: boolean): boolean {
    if (flag) return true;
    const n = name.normalize('NFKC').trim().toLowerCase();
    if (groupNames.some((g) => g.normalize('NFKC').trim().toLowerCase() === n)) return true;
    return /官方頻道|official\s*channel/i.test(n) || /[(（]官方[)）]/.test(n);
}

const byDebut = (a: RosterMember, b: RosterMember) => (a.debut ?? '9999').localeCompare(b.debut ?? '9999') || a.name.localeCompare(b.name);

/**
 * 查詢結果 → 依團體分區塊：子團依成員多到少、公司本身的成員最後；空的區塊不輸出。
 * 每區內依出道日排序（現役／已畢業的切分交給畫面）。
 */
export function buildRoster(agency: string, groups: readonly GroupRow[], rows: readonly MemberRow[]): AgencyRoster {
    const nameOf = new Map(groups.map((g) => [g.id, g.name]));
    const top = groups.find((g) => g.name === agency);
    const bucket = new Map<string, RosterMember[]>();
    const groupNames = [agency, ...groups.map((g) => g.name)];
    for (const r of rows) {
        if (isOfficialChannel(r.name, groupNames, r.is_official)) continue;
        const left = !(r.group_id && nameOf.has(r.group_id)) && !!r.former_group_id && nameOf.has(r.former_group_id);
        const gid = (left ? r.former_group_id : r.group_id) ?? '';
        if (!nameOf.has(gid)) continue;
        const list = bucket.get(gid) ?? [];
        list.push(toMember(r, nameOf.get(gid) ?? agency, left));
        bucket.set(gid, list);
    }
    const sections: RosterSection[] = [...bucket.entries()]
        .map(([id, members]) => ({ id, name: nameOf.get(id) ?? agency, members: members.sort(byDebut) }))
        .sort((a, b) => Number(a.id === top?.id) - Number(b.id === top?.id) || b.members.length - a.members.length || a.name.localeCompare(b.name))
        .map(({ name, members }) => ({ name, members }));
    const all = sections.flatMap((s) => s.members);
    return {
        agency,
        sections,
        activeCount: all.filter((m) => m.activity !== 'graduate').length,
        graduatedCount: all.filter((m) => m.activity === 'graduate').length,
    };
}

/** 依公司名稱查名冊；查無此公司回 null */
export async function fetchAgencyRoster(agency: string, opts: RestOptions = {}): Promise<AgencyRoster | null> {
    const cfg = await resolveRestConfig(opts);
    // 公司＋子團一次查完（子團以 parent_id 反向嵌入）
    const tops = await restGet<(GroupRow & { children?: GroupRow[] })[]>(
        cfg,
        `vtuber_groups?select=id,name,parent_id,children:vtuber_groups!parent_id(id,name,parent_id)&name=eq.${encodeURIComponent(agency)}&parent_id=is.null&limit=1`,
        opts,
    );
    const top = tops[0];
    if (!top) return null;
    const { children = [], ...topRow } = top;
    const groups: GroupRow[] = [topRow, ...children];
    const ids = groups.map((g) => g.id).join(',');
    const tail = `&order=debut_date.asc.nullslast&limit=${MEMBER_LIMIT}`;
    let rows: MemberRow[];
    try {
        // 現役與引退（group_id）＋離開後繼續活動（former_group_id）
        rows = await restGet<MemberRow[]>(cfg, `vtubers?select=${MEMBER_COLS_NEW}&or=(group_id.in.(${ids}),former_group_id.in.(${ids}))${tail}`, opts);
    } catch (e) {
        if (!(e instanceof SnapshotError && e.message.includes('HTTP 400'))) throw e;
        rows = await restGet<MemberRow[]>(cfg, `vtubers?select=${MEMBER_COLS}&group_id=in.(${ids})${tail}`, opts);
    }
    return buildRoster(agency, groups, rows);
}
