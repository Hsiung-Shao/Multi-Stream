// 合併 6 批研究代理的名冊 JSON，套上人工修正，輸出 scripts/data/tw-agency-rosters-2026-09.json。
//
// 用法：node scripts/merge-agency-rosters.mjs <batch1.json> … <batch6.json>
// 人工修正（依各批回報的文字說明，研究代理的 JSON 沒有這些欄位）都寫在 OVERRIDES，輸出檔也會附上 _overrides 讓人查。
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 子團名與資料庫既有團體對齊（同一團不同寫法），避免建出重複團體 */
const SUBGROUP_ALIASES = {
    '瑟拉斯蒂歐Celestial': '瑟拉斯蒂歐',
    '諦覓司Timaeus': '諦覓司',
};

/** 名字就是期別（例：1期生）會在不同公司之間撞名：加上公司名 */
const GENERIC_SUBGROUP = /^([0-9０-９一二三四五六七八九十]+期生|[0-9０-９]+期)$/;

/** 個人藝人被列成「子團」的：直接掛公司 */
const NOT_SUBGROUP = new Set(['懶貓子']);

export const OVERRIDES = {
    // 離開公司但繼續活動（轉個人勢）：清所屬、記前所屬、維持現役
    left_continues: {
        雲際線工作室: ['周默', '小金碧碧', '薇恩‧黛娜', '月下香幽芳'],
        比鄰星域: ['星見遙'],
        '箱箱The Box': ['柴崎楓音'],
        蜂沛創意行銷有限公司: ['璐洛洛'],
    },
    // 狀態沒有可靠出處：只掛團，不改既有狀態
    status_unverified: {
        'TSA Studio': ['天泣8號'], // 資料庫記畢業，官網仍列所屬，查不到公告
        夢想之都工作室: ['煦'], // 官網沒列，推定離開但無公告
        YahooTV: ['虎妮'], // 長休，官方說不是畢業
    },
    // 查證後不是企業勢
    reclassify: {
        恋Vaichu: { kind: 'circle', note: '官方頻道自稱「台V 社團勢」（2026-09-29 查證）' },
    },
    // 前所屬公司：現在沒有所屬成員
    notes: {
        蜂沛創意行銷有限公司: '璐洛洛過去的所屬公司（統編 90837965）；她目前自稱個人勢',
    },
};

/** 「一期生 SUPER」「二期生 七宗罪」這種「期別＋團名」：只留團名 */
const GEN_PREFIX = /^([0-9０-９一二三四五六七八九十]+期生?)\s+(.+)$/;

/**
 * 子團名正規化（公司層 subgroups 與成員的 subgroup 寫法常不一致，不統一會建出重複團體）：
 *   去掉括號註記（「NKshoujo（前身）」→「NKshoujo」）→ 別名對齊 → 「期別＋團名」只留團名
 *   → 只有期別（「1期生」）時加公司名前綴（團名全域唯一，各家都有 1 期生）
 */
export function normalizeSubgroup(agency, name) {
    if (!name || NOT_SUBGROUP.has(name) || name === agency) return null;
    let n = name.replace(/\s*[（(][^）)]*[）)]\s*$/u, '').trim();
    n = SUBGROUP_ALIASES[n] ?? n;
    const gen = GEN_PREFIX.exec(n);
    if (gen) n = gen[2].trim();
    if (!n || n === agency) return null;
    return GENERIC_SUBGROUP.test(n) ? `${agency} ${n}` : n;
}

export function applyOverrides(agencies) {
    for (const a of agencies) {
        a.subgroups = [...new Set((a.subgroups ?? []).map((n) => normalizeSubgroup(a.agency, n)).filter(Boolean))];
        const left = new Set(OVERRIDES.left_continues[a.agency] ?? []);
        const unverified = new Set(OVERRIDES.status_unverified[a.agency] ?? []);
        if (OVERRIDES.reclassify[a.agency]) a.reclassify = OVERRIDES.reclassify[a.agency];
        if (OVERRIDES.notes[a.agency]) a.notes = [a.notes, OVERRIDES.notes[a.agency]].filter(Boolean).join('；');
        for (const m of a.members ?? []) {
            m.subgroup = normalizeSubgroup(a.agency, m.subgroup);
            if (left.has(m.name)) m.left_continues = true;
            if (unverified.has(m.name) && !(m.sources ?? []).includes('status-unverified')) m.sources = [...(m.sources ?? []), 'status-unverified'];
        }
    }
    return agencies;
}

function main() {
    const files = process.argv.slice(2);
    if (!files.length) throw new Error('請給 batch JSON 路徑');
    const agencies = files.flatMap((f) => JSON.parse(readFileSync(resolve(f), 'utf8')));
    applyOverrides(agencies);
    const out = { _說明: '台灣 VTuber 企業勢逐家名冊（含畢業）。2026-09-29 由研究代理逐家查證（官網、官方公告、wiki、新聞），每位成員附出處；人工修正見 _overrides。產生 migration：scripts/resolve-roster-channels.mjs → scripts/build-agency-rosters.mjs。', verified_at: '2026-09-29', _overrides: OVERRIDES, agencies };
    const path = resolve(ROOT, 'scripts/data/tw-agency-rosters-2026-09.json');
    writeFileSync(path, JSON.stringify(out, null, 2) + '\n', 'utf8');
    const n = agencies.reduce((s, a) => s + a.members.length, 0);
    console.log(`agencies ${agencies.length}, members ${n} → ${path}`);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('merge-agency-rosters.mjs')) main();
