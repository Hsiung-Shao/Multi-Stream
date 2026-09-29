// 地區（vtubers.nationality）嚴格檢查：第二步，合併逐筆查證結果並產生 migration。
// → scripts/data/tw-nationality-audit-2026-09.json（附證據）＋ supabase/migrations/20260930120000_vtuber_nationality_fixes.sql
//
// 用法：node scripts/build-nationality-fixes.mjs --audit <audit.json> --results <result1.json,result2.json,…> --review <review.json> --data-out <json> --out <sql>
//   audit：scripts/audit-nationality.mjs 的篩檢結果；results：研究代理逐筆查證（keep／change／unknown）
//   review：人工複核 { "<id>": { "action": "reject", "reason": "…" } 或 { "action": "accept", "evidence_type": "self|agency", "evidence"?: "…", "evidence_url"?: "…" } }
//           reject＝否決證據只屬間接或自稱矛盾的改動；accept＝替沒標證據類型的查證結果補上類型（可順帶改寫證據文字）
//
// 規則：只改 verdict=change、證據類型為本人自稱（self）或所屬公司（agency）（沒標一律不改）、confidence 為 high／medium、
//       附證據網址、且新值合法的；以 id 定位並附「目前仍是舊值」條件（之後有人改過就不動），重跑零變動。
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { q, commentSafe } from './build-agency-rosters.mjs';
import { REGIONS } from './audit-nationality.mjs';

/** 查證結果 → 要改的清單與報告（純函式） */
export function planNationality(audit, results, review = {}) {
    const byId = new Map(audit.map((a) => [a.id, a]));
    const changes = [];
    const report = { checked: 0, keep: 0, change: 0, unknown: 0, rejected: [], missing: [], duplicate: [] };
    const seen = new Set();
    for (const raw of results) {
        const a = byId.get(raw.id);
        if (!a) {
            report.missing.push(`${raw.name ?? raw.id}（篩檢結果沒有這個 id）`);
            continue;
        }
        if (seen.has(raw.id)) {
            report.duplicate.push(a.name);
            continue;
        }
        seen.add(raw.id);
        report.checked += 1;
        if (raw.verdict === 'keep') {
            report.keep += 1;
            continue;
        }
        if (raw.verdict !== 'change') {
            report.unknown += 1;
            continue;
        }
        const rv = review[raw.id];
        const r = rv?.action === 'accept' ? { ...raw, ...rv, verdict: raw.verdict, nationality: raw.nationality } : raw;
        const why =
            rv?.action === 'reject'
                ? `人工複核否決（${rv.reason}）`
                : !['self', 'agency'].includes(r.evidence_type)
                  ? r.evidence_type
                      ? '證據只屬間接'
                      : '沒有標證據類型'
                  : !REGIONS.includes(r.nationality)
                    ? '新值不合法'
                    : r.nationality === a.db
                      ? '新值與資料庫相同'
                      : !['high', 'medium'].includes(r.confidence)
                        ? '信心不足'
                        : !r.evidence_url
                          ? '沒有證據網址'
                          : null;
        if (why) {
            report.rejected.push(`${a.name}：${why}`);
            continue;
        }
        report.change += 1;
        changes.push({ id: a.id, name: a.name, from: a.db, to: r.nationality, evidence_type: r.evidence_type, evidence: r.evidence, evidence_url: r.evidence_url, confidence: r.confidence });
    }
    return { changes, report };
}

export function buildNationalitySql(changes, header) {
    const out = [header.trimEnd(), ''];
    out.push('-- ===== 0. 套用前備份（回滾用；上次的備份還在就停）=====');
    out.push("do $$ begin if to_regclass('backup.nationality_20260930') is not null then raise exception '已有 backup.nationality_20260930：確認後 drop 再重新套用'; end if; end $$;");
    out.push('create schema if not exists backup;');
    out.push('revoke all on schema backup from public, anon, authenticated;');
    // 備份舊值與本檔要寫入的新值：回滾只還原「目前仍是新值」的列
    const rows = changes.map((c) => `(${q(c.id)}::uuid, ${q(c.from)}, ${q(c.to)})`);
    out.push('create table backup.nationality_20260930 (id uuid primary key, nationality text not null, new_value text not null);');
    if (rows.length) out.push(`insert into backup.nationality_20260930 (id, nationality, new_value) values ${rows.join(', ')};`);
    out.push('');
    out.push('-- ===== 1. 地區修正（每筆附證據；只在目前仍是舊值時改）=====');
    for (const c of changes) {
        out.push(`-- ${commentSafe(c.name)}：${c.from} → ${c.to}（${c.evidence_type}）｜${commentSafe(c.evidence).slice(0, 120)}｜${commentSafe(c.evidence_url)}`);
        out.push(`update public.vtubers set nationality = ${q(c.to)} where id = ${q(c.id)} and nationality = ${q(c.from)};`);
    }
    out.push('');
    return out.join('\n');
}

/** migration 檔頭：套用前提與回滾（測試會檢查回滾 SQL） */
export const NATIONALITY_HEADER = `-- 地區（nationality）嚴格檢查後的修正。由 scripts/build-nationality-fixes.mjs 產生，不要手改。
-- 地區＝社群歸屬（本人或所屬公司自稱）；篩檢 scripts/audit-nationality.mjs → 逐筆查證 → 證據存 scripts/data/tw-nationality-audit-2026-09.json
-- 只收證據類型為本人自稱（self）或所屬公司（agency）的改動。
-- **須單一交易套用**（apply_migration 或 psql -1）；各段敘述「已是目標值就跳過」，整份重新套用前先依下方回滾並 drop 備份表。
-- 回滾（依第 0 段備份；只還原目前仍是本檔新值的列，之後被別人改過的不動）：
--   update public.vtubers v set nationality = b.nationality from backup.nationality_20260930 b where b.id = v.id and v.nationality = b.new_value;
--   drop table backup.nationality_20260930;`;

function main() {
    const arg = (n) => {
        const i = process.argv.indexOf(n);
        return i > 0 ? process.argv[i + 1] : null;
    };
    for (const n of ['--audit', '--results', '--data-out', '--out']) if (!arg(n)) throw new Error(`需要 ${n}`);
    const audit = JSON.parse(readFileSync(resolve(arg('--audit')), 'utf8'));
    const results = arg('--results')
        .split(',')
        .flatMap((f) => JSON.parse(readFileSync(resolve(f.trim()), 'utf8')));
    const review = arg('--review') ? JSON.parse(readFileSync(resolve(arg('--review')), 'utf8')) : {};
    const { changes, report } = planNationality(audit, results, review);
    const auditById = new Map(audit.map((a) => [a.id, a]));
    const tally = {};
    for (const a of audit) tally[`${a.db}/${a.verdict}`] = (tally[`${a.db}/${a.verdict}`] ?? 0) + 1;
    const data = {
        _說明: '地區（vtubers.nationality）嚴格檢查（2026-09-30）。地區＝社群歸屬（本人或所屬公司自稱）。篩檢：scripts/audit-nationality.mjs（本人自稱 > 所屬企業勢 > 單一國旗與 YouTube 自填國家；多國國旗並列視為語言）；可疑者（矛盾、OTHER 無訊號、無訊號但近三個月有直播）逐筆查證，只改證據類型為本人自稱或所屬公司、且信心 high／medium 的。',
        verified_at: '2026-09-30',
        screening: { total: audit.length, tally },
        report,
        review,
        changes,
        checked: results.map((r) => {
            const rv = review[r.id]?.action === 'accept' ? review[r.id] : {};
            return {
                id: r.id,
                name: auditById.get(r.id)?.name ?? r.name,
                db: auditById.get(r.id)?.db ?? r.db,
                verdict: r.verdict,
                nationality: r.nationality ?? null,
                evidence_type: rv.evidence_type ?? r.evidence_type ?? null,
                evidence: rv.evidence ?? r.evidence ?? null,
                evidence_url: rv.evidence_url ?? r.evidence_url ?? null,
                confidence: r.confidence ?? null,
            };
        }),
    };
    writeFileSync(resolve(arg('--data-out')), JSON.stringify(data, null, 1) + '\n', 'utf8');
    writeFileSync(resolve(arg('--out')), buildNationalitySql(changes, NATIONALITY_HEADER), 'utf8');
    console.log(JSON.stringify({ ...report, rejected: report.rejected.length, missing: report.missing.length }));
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('build-nationality-fixes.mjs')) main();
