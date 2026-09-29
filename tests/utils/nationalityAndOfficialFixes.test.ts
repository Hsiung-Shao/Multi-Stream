// 地區篩檢（訊號分層、國旗、誤判詞、弱訊號）、地區修正產生器（證據類型必填、舊值條件、回滾只還原新值、註解防注入）、
// 官網修正產生器（古德文創改合作、官網標示離開、新成員要有頻道與所屬公司、回滾只還原新值）
import { describe, it, expect } from 'vitest';
// @ts-expect-error scripts 目錄的 ESM JS 無型別宣告
import { textSignals, classify, countryToRegion, auditAll } from '../../scripts/audit-nationality.mjs';
// @ts-expect-error 同上
import { planNationality, buildNationalitySql, NATIONALITY_HEADER } from '../../scripts/build-nationality-fixes.mjs';
// @ts-expect-error 同上
import { buildOfficialSql, validate, OFFICIAL_HEADER, CONTRIBUTED_BY } from '../../scripts/build-official-fixes.mjs';
// @ts-expect-error 同上
import { commentSafe } from '../../scripts/build-agency-rosters.mjs';

const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const LS = String.fromCharCode(0x2028);
const regions = (t: string, kind = 'self') => textSignals(t).strong.filter((s: { kind: string }) => s.kind === kind).map((s: { region: string }) => s.region);

describe('地區篩檢：訊號', () => {
    it('地區自稱是強訊號；單獨的「台灣時間」不算', () => {
        expect(regions('我是台V，每天晚上開台')).toEqual(['TW']);
        expect(regions('香港Vtuber／港V 一枚')).toEqual(['HK']);
        expect(regions('Malaysian VTuber')).toEqual(['MY']);
        expect(regions('台灣時間 20:00 開台')).toEqual([]);
    });

    it('最常見的「台Vtuber／港Vtuber／马Vtuber」抓得到', () => {
        expect(regions('新人台Vtuber')).toEqual(['TW']);
        expect(regions('港VTuber')).toEqual(['HK']);
        expect(regions('马Vtuber')).toEqual(['MY']);
    });

    it('不誤判：舞台V、平台V 主、台VR、香港VR遊戲、台灣VALORANT、Taiwan vs Japan、my Vtuber', () => {
        for (const t of ['舞台V', '平台V 主', '電台V', '台VR 體驗', '香港VR遊戲', '台灣VALORANT', 'Taiwan vs Japan', 'Hong Kong vlog', 'Welcome to my Vtuber channel', '한국어 가능', '加拿大楓葉', '競馬 Vtuber', '海馬Vtuber']) {
            expect(regions(t)).toEqual([]);
        }
        expect(regions('MY Vtuber')).toEqual(['MY']);
        expect(regions('大馬Vtuber')).toEqual(['MY']);
        // 兩地並稱：港與台都算（判定時成為矛盾，交人工）
        expect(regions('港台Vtuber').sort()).toEqual(['HK', 'TW']);
    });

    it('國旗：多國並列不採計；單一國旗只算最低一層（常代表語言）', () => {
        expect(textSignals('語言 🇹🇼🇯🇵🇺🇸').strong).toEqual([]);
        expect(regions('日本語OK🇯🇵', 'flag')).toEqual(['JP']);
        expect(regions('日本語OK🇯🇵')).toEqual([]);
    });

    it('弱訊號：簡體、粵語（不收「係」）、假名', () => {
        const hints = (t: string) => textSignals(t).weak.map((w: { hint: string }) => w.hint);
        expect(hints('这个频道欢迎大家来看直播，谢谢你们的关注，我们下次见，还有请点赞')).toContain('simplified');
        expect(hints('今日唔得閒，佢哋嚟咗')).toContain('cantonese');
        expect(hints('關係關係關係關係關係')).not.toContain('cantonese');
    });

    it('YouTube 自填國家：六種之外一律 OTHER', () => {
        expect([countryToRegion('tw'), countryToRegion('AU'), countryToRegion(null)]).toEqual(['TW', 'OTHER', null]);
    });
});

describe('地區篩檢：判定分層（本人自稱 > 所屬企業勢 > 單一國旗與自填國家）', () => {
    const s = (region: string, kind: string) => ({ region, kind });

    it('自稱與資料庫一致時，自填國家不同也算一致（很多台V把國家設日本）', () => {
        expect(classify('TW', [s('TW', 'self'), s('JP', 'country')], [])).toMatchObject({ verdict: 'agree', basis: 'self' });
    });

    it('只有國旗或自填國家且不同 → 矛盾（交人工查證，不自動改）；兩者不同 → mixed', () => {
        expect(classify('TW', [s('JP', 'country')], [])).toMatchObject({ verdict: 'conflict', suggestion: 'JP', basis: 'flag+country' });
        expect(classify('TW', [s('JP', 'flag'), s('US', 'country')], [])).toMatchObject({ verdict: 'conflict', basis: 'mixed:flag+country' });
    });

    it('同一層互相矛盾 → mixed；沒有強訊號看弱訊號', () => {
        expect(classify('TW', [s('TW', 'self'), s('HK', 'self')], [])).toMatchObject({ verdict: 'conflict', basis: 'mixed:self' });
        expect(classify('TW', [], [{ hint: 'simplified' }])).toMatchObject({ verdict: 'conflict', basis: 'weak:simplified' });
        expect(classify('MY', [], [{ hint: 'simplified' }])).toMatchObject({ verdict: 'no_signal' });
    });

    it('auditAll：企業勢子團往上取公司的地區；社團不算', () => {
        const groups = [
            { id: 'a', name: '公司', nationality: 'TW', kind: 'agency', parent_id: null },
            { id: 'a1', name: '子團', nationality: 'TW', kind: 'agency', parent_id: 'a' },
            { id: 'c', name: '社團', nationality: 'TW', kind: 'circle', parent_id: null },
        ];
        const rows = auditAll(
            [
                { id: '1', name: 'x', nationality: 'HK', group_id: 'a1' },
                { id: '2', name: 'y', nationality: 'HK', group_id: 'c' },
            ],
            groups,
            [],
        );
        expect(rows[0]).toMatchObject({ verdict: 'conflict', suggestion: 'TW', basis: 'agency' });
        expect(rows[1]).toMatchObject({ verdict: 'no_signal' });
    });
});

describe('地區修正產生器', () => {
    const audit = [
        { id: 'a', name: '甲', db: 'TW' },
        { id: 'b', name: '乙', db: 'HK' },
        { id: 'c', name: '丙', db: 'TW' },
        { id: 'd', name: '丁', db: 'OTHER' },
        { id: 'e', name: '戊', db: 'OTHER' },
    ];
    const results = [
        { id: 'a', verdict: 'change', nationality: 'HK', evidence_type: 'self', confidence: 'high', evidence: '簡介寫港V', evidence_url: 'https://x/a' },
        { id: 'b', verdict: 'keep' },
        { id: 'c', verdict: 'change', nationality: 'JP', evidence_type: 'self', confidence: 'low', evidence: '只有自填國家', evidence_url: 'https://x/c' },
        { id: 'd', verdict: 'change', nationality: 'MY', evidence_type: 'self', confidence: 'medium', evidence: '無網址' },
        { id: 'e', verdict: 'change', nationality: 'TW', confidence: 'high', evidence: '沒標類型', evidence_url: 'https://x/e' },
        { id: 'zz', name: '不存在', verdict: 'keep' },
        { id: 'a', verdict: 'keep' },
    ];

    it('只改 change＋證據類型 self／agency＋high／medium＋有證據網址；其餘列報告（否決與證據不足分開計）', () => {
        const { changes, report } = planNationality(audit, results);
        expect(changes.map((c: { name: string; from: string; to: string }) => `${c.name}:${c.from}→${c.to}`)).toEqual(['甲:TW→HK']);
        expect(report).toMatchObject({ checked: 5, keep: 1, change: 1, unknown: 0 });
        expect(report.rejected).toEqual(['丙：信心不足', '丁：沒有證據網址', '戊：沒有標證據類型']);
        expect(report.missing).toEqual(['不存在（篩檢結果沒有這個 id）']);
        expect(report.duplicate).toEqual(['甲']);
    });

    it('間接證據、人工複核否決 → 不改；人工複核 accept 可補證據類型與改寫證據', () => {
        const r2 = [
            { id: 'a', verdict: 'change', nationality: 'HK', confidence: 'high', evidence_type: 'indirect', evidence: '斗內管道', evidence_url: 'https://x/a' },
            { id: 'd', verdict: 'change', nationality: 'TW', confidence: 'high', evidence_type: 'self', evidence: '#台V', evidence_url: 'https://x/d' },
            { id: 'e', verdict: 'change', nationality: 'TW', confidence: 'high', evidence: '原文', evidence_url: 'https://x/e' },
        ];
        const p = planNationality(audit, r2, { d: { action: 'reject', reason: '只有升學用語' }, e: { action: 'accept', evidence_type: 'agency', evidence: '改寫後' } });
        expect(p.report.rejected).toEqual(['甲：證據只屬間接', '丁：人工複核否決（只有升學用語）']);
        expect(p.changes).toEqual([expect.objectContaining({ name: '戊', to: 'TW', evidence_type: 'agency', evidence: '改寫後' })]);
    });

    it('SQL：只在目前仍是舊值時改；備份存新值；回滾只還原目前仍是新值的列', () => {
        const sql: string = buildNationalitySql(planNationality(audit, results).changes, NATIONALITY_HEADER);
        expect(sql).toContain("update public.vtubers set nationality = 'HK' where id = 'a' and nationality = 'TW';");
        expect(sql).toContain("insert into backup.nationality_20260930 (id, nationality, new_value) values ('a'::uuid, 'TW', 'HK');");
        expect(sql.indexOf("to_regclass('backup.nationality_20260930') is not null")).toBeLessThan(sql.indexOf('create table backup.nationality_20260930'));
        expect(NATIONALITY_HEADER).toContain('where b.id = v.id and v.nationality = b.new_value');
    });

    it('寫進 SQL 註解的外部文字去除所有換行（單獨的 CR、U+2028 也會結束註解）', () => {
        expect(commentSafe(`a${CR}drop table x;${LS}b${NL}c`)).toBe('a drop table x; b c');
        const sql: string = buildNationalitySql(
            [{ id: 'a', name: `甲${CR}`, from: 'TW', to: 'HK', evidence_type: 'self', evidence: `港V${CR}drop table public.vtubers;`, evidence_url: 'https://x' }],
            NATIONALITY_HEADER,
        );
        expect(sql.split(NL).some((l) => l.startsWith('drop table'))).toBe(false);
        expect(sql.includes(CR)).toBe(false);
    });
});

describe('官網修正產生器', () => {
    const id = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
    const data = {
        collab_convert: [{ agency: '古德文創', id: id(1), name: '葉月', source: 'https://goodcc' }],
        departures: [
            { agency: '花遊工作室', id: id(2), name: '納希斯', left_date: null, official_label: '已完結' },
            { agency: '鹿鳴娛樂', id: id(3), name: '有日期', left_date: '2025-01-31', official_label: '畢業' },
        ],
        new_members: [{ agency: '花遊工作室', subgroup: '希望旅團', name: '茱莉葉塔', status: 'active', youtube_channel_id: 'UCgiu', avatar: 'https://a' }],
    };
    const sql: string = buildOfficialSql(data, OFFICIAL_HEADER);
    const line = (needle: string, prefix = '') => sql.split(NL).find((l) => !l.startsWith('--') && l.startsWith(prefix) && l.includes(needle))!;

    it('古德文創改合作：加關係（頂層公司）、只在目前是這家時清主所屬；已掛別家會警告', () => {
        expect(line("'collaborator'")).toContain(`where v.id = '${id(1)}'`);
        expect(line('set group_id = null')).toContain('and v.group_id in (select id from public.vtuber_groups where id =');
        expect(line('目前掛在別的團體', 'do $$')).toContain(`v.id = '${id(1)}' and v.group_id is not null and v.group_id not in`);
    });

    it('離開：沒有官方日期就不寫 graduated_at；有日期只補空的', () => {
        expect(line(`v.id = '${id(2)}'`, 'update')).toBe(`update public.vtubers v set activity = 'graduate' where v.id = '${id(2)}' and v.activity <> 'graduate';`);
        expect(line(`v.id = '${id(3)}'`, 'update')).toContain("graduated_at = coalesce(v.graduated_at, '2025-01-31'::date)");
    });

    it('新成員：掛官方子團、地區取所屬公司、帶 contributed_by、頻道或名字已存在就跳過、沒加入會警告', () => {
        const ins = line("select '茱莉葉塔', (select nationality from public.vtuber_groups where id =");
        expect(ins).toContain("(select id from public.vtuber_groups where name = '希望旅團' and parent_id =");
        expect(ins).toContain(`'${CONTRIBUTED_BY}'`);
        expect(ins).toContain("x.youtube_channel_id = 'UCgiu' or x.name = '茱莉葉塔'");
        expect(sql).toContain("raise warning '新成員 % 沒有加入");
    });

    it('資料檢查：沒有頻道、沒有所屬公司、錯的 id 直接丟錯', () => {
        expect(() => validate({ new_members: [{ agency: 'x', name: '無頻道' }] })).toThrow('沒有頻道不能新增');
        expect(() => validate({ new_members: [{ subgroup: '希望旅團', name: '無公司', youtube_channel_id: 'UC' }] })).toThrow('缺所屬公司');
        expect(() => validate({ departures: [{ id: 'bad', name: 'y' }] })).toThrow('id 格式錯誤');
    });

    it('備份記下本檔預期的新值；回滾只還原目前仍是新值的欄位並校正 member_count', () => {
        expect(sql).toContain(`('${id(1)}'::uuid, true, null::text, null::date)`);
        expect(sql).toContain(`('${id(3)}'::uuid, false, 'graduate', '2025-01-31'::date)`);
        expect(OFFICIAL_HEADER).toContain('group_id = case when b.clears_group and v.group_id is null then b.group_id else v.group_id end');
        expect(OFFICIAL_HEADER).toContain('activity = case when b.new_activity is not null and v.activity = b.new_activity then b.activity else v.activity end');
        expect(OFFICIAL_HEADER).toContain(`delete from public.vtubers where contributed_by = '${CONTRIBUTED_BY}';`);
        expect(OFFICIAL_HEADER).toContain('delete from public.vtuber_group_links l where l.created_at = (select applied_at from backup.official_meta_20260930);');
        expect(OFFICIAL_HEADER).toContain('update public.vtuber_groups g set member_count');
        expect(OFFICIAL_HEADER).toContain('不可和其他 migration 放在同一個交易');
    });
});
