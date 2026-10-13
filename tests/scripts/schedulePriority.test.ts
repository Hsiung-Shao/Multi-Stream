// scripts/schedule-posts/lib/priority.mjs：企業勢優先的名冊排序、游標續掃、候選排序。
import { describe, expect, it } from 'vitest';

// 新模組（尚未實作）：用動態 import，模組不存在時每條測試以「不是函式」失敗，而不是整個檔案載入失敗
const PRIORITY_PATH = '../../scripts/schedule-posts/lib/priority.mjs';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const priority: any = await import(/* @vite-ignore */ PRIORITY_PATH).catch(() => ({}));

const { agencyVtuberIds, resumeIndex, rosterKey, sortCandidates, sortRoster } = priority;

const TODAY = '2026-10-14';

describe('rosterKey／sortRoster', () => {
  it('rosterKey：企業勢前綴 0、個人勢前綴 1', () => {
    expect(rosterKey({ isAgency: true, externalId: 'UCa' })).toBe('0:UCa');
    expect(rosterKey({ isAgency: false, externalId: 'UCa' })).toBe('1:UCa');
  });

  it('T1 企業勢頻道排在名冊前面，同組依 externalId；回傳新陣列不改原陣列', () => {
    const input = [
      { isAgency: false, externalId: 'UCd', name: '個人D' },
      { isAgency: true, externalId: 'UCc', name: '企業C' },
      { isAgency: false, externalId: 'UCb', name: '個人B' },
      { isAgency: true, externalId: 'UCa', name: '企業A' },
    ];
    const snapshot = input.map((c) => c.externalId);
    const out = sortRoster(input);
    expect(out.map((c) => c.externalId)).toEqual(['UCa', 'UCc', 'UCb', 'UCd']);
    expect(out[0]).toMatchObject({ name: '企業A' }); // 保留其他欄位
    expect(out).not.toBe(input);
    expect(input.map((c) => c.externalId)).toEqual(snapshot);
  });
});

describe('agencyVtuberIds', () => {
  it('T2 子團成員與有效合作藝人算企業勢；過期合作、尚未開始的合作、社團成員、沒有團體的人不算', () => {
    const groups = [
      { id: 'gA', kind: 'agency', parent_id: null },
      { id: 'gSub', kind: 'circle', parent_id: 'gA' }, // 企業勢子團（kind 不是 agency 也算）
      { id: 'gCircle', kind: 'circle', parent_id: null },
      { id: 'gCircleSub', kind: 'unverified', parent_id: 'gCircle' }, // 父團不是企業勢
      { id: 'gPersonal', kind: 'personal', parent_id: null },
    ];
    const vtubers = [
      { id: 'direct', group_id: 'gA' },
      { id: 'sub', group_id: 'gSub' },
      { id: 'circle', group_id: 'gCircle' },
      { id: 'circleSub', group_id: 'gCircleSub' },
      { id: 'personal', group_id: 'gPersonal' },
      { id: 'none', group_id: null },
      { id: 'collabOpen', group_id: null },
      { id: 'collabEndsToday', group_id: null },
      { id: 'collabEnded', group_id: null },
      { id: 'collabFuture', group_id: null },
      { id: 'collabSub', group_id: 'gCircle' },
      { id: 'collabCircle', group_id: null },
    ];
    const links = [
      { vtuber_id: 'collabOpen', group_id: 'gA', role: 'collaborator', since: null, until: null },
      { vtuber_id: 'collabEndsToday', group_id: 'gA', role: 'collaborator', since: '2026-01-01', until: TODAY },
      { vtuber_id: 'collabEnded', group_id: 'gA', role: 'collaborator', since: '2026-01-01', until: '2026-10-13' },
      { vtuber_id: 'collabFuture', group_id: 'gA', role: 'collaborator', since: '2026-10-15', until: null },
      { vtuber_id: 'collabSub', group_id: 'gSub', role: 'collaborator', since: TODAY, until: null },
      { vtuber_id: 'collabCircle', group_id: 'gCircle', role: 'collaborator', since: null, until: null },
    ];
    const ids = agencyVtuberIds({ groups, vtubers, links, today: TODAY });
    expect(ids).toBeInstanceOf(Set);
    expect([...ids].sort()).toEqual(['collabEndsToday', 'collabOpen', 'collabSub', 'direct', 'sub']);
  });
});

describe('resumeIndex', () => {
  const makeRoster = () => sortRoster([
    { isAgency: true, externalId: 'UCa' },
    { isAgency: true, externalId: 'UCc' },
    { isAgency: false, externalId: 'UCb' },
    { isAgency: false, externalId: 'UCd' },
  ]); // 0:UCa、0:UCc、1:UCb、1:UCd

  it('T3 游標在企業勢中段或個人勢中段 → 從下一個開始', () => {
    const roster = makeRoster();
    expect(resumeIndex(roster, '0:UCa')).toBe(1);
    expect(resumeIndex(roster, '1:UCb')).toBe(3);
  });

  it('T3 游標頻道已不在名冊 → 從下一個更大的鍵開始（不重複不漏）', () => {
    const roster = makeRoster();
    expect(resumeIndex(roster, '0:UCb')).toBe(1); // 下一個是 0:UCc
    expect(resumeIndex(roster, '0:UCz')).toBe(2); // 企業勢都掃完，接個人勢第一個
    expect(resumeIndex(roster, '1:UCc')).toBe(3);
  });

  it('T3 null、舊格式游標、超過最後一個 → 0（重新一圈）', () => {
    const roster = makeRoster();
    expect(resumeIndex(roster, null)).toBe(0);
    expect(resumeIndex(roster, 'UCb')).toBe(0); // 舊格式沒有 0:／1: 前綴
    expect(resumeIndex(roster, '1:UCd')).toBe(0);
    expect(resumeIndex(roster, '1:UCz')).toBe(0);
  });
});

describe('sortCandidates', () => {
  it('T4 候選企業勢在前，同組依發文時間由舊到新；回傳新陣列', () => {
    const input = [
      { id: 'indieNew', isAgency: false, postDate: 4000 },
      { id: 'agencyNew', isAgency: true, postDate: 3000 },
      { id: 'agencyOld', isAgency: true, postDate: 1000 },
      { id: 'indieOld', isAgency: false, postDate: 500 },
    ];
    const out = sortCandidates(input);
    expect(out.map((c) => c.id)).toEqual(['agencyOld', 'agencyNew', 'indieOld', 'indieNew']);
    expect(out).not.toBe(input);
    expect(input[0].id).toBe('indieNew');
  });
});
