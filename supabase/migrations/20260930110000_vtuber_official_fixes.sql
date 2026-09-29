-- 依官網標示調整資料庫（古德文創全部改合作、官網標示離開、官網新成員）。由 scripts/build-official-fixes.mjs 產生，不要手改。
-- 來源：scripts/data/tw-official-fixes-2026-09.json（每筆附官方出處）
-- 依賴：20260930100100（合作關係與子團名稱）
-- **須單一交易套用**（apply_migration 或 psql -1），而且**不可和其他 migration 放在同一個交易**：回滾靠 created_at＝交易開始時間辨識本檔新增的列。
-- 各段敘述都是「已是目標狀態就跳過」；整份重新套用前先依下方回滾、drop 第 0 段的 3 張 backup 表。
-- 正式站套用前先確認第 1、2 段的 v.id 都存在（id 取自本地匯出的正式站資料）。
-- 回滾（依第 0 段備份；只還原目前仍是本檔新值的欄位，之後被別人改過的不動）：
--   delete from public.vtuber_group_links l where l.created_at = (select applied_at from backup.official_meta_20260930);
--   delete from public.vtubers where contributed_by = 'official:2026-09-30';  -- 會連帶刪除這些人之後累積的頻道、場次、合作關係（on delete cascade）
--   delete from public.vtuber_channels c where c.created_at = (select applied_at from backup.official_meta_20260930) and not exists (select 1 from backup.vtuber_channels_ids_official_20260930 b where b.id = c.id);
--   update public.vtubers v set group_id = case when b.clears_group and v.group_id is null then b.group_id else v.group_id end, activity = case when b.new_activity is not null and v.activity = b.new_activity then b.activity else v.activity end, graduated_at = case when b.new_graduated_at is not null and v.graduated_at = b.new_graduated_at then b.graduated_at else v.graduated_at end from backup.vtubers_official_20260930 b where b.id = v.id;
--   update public.vtuber_groups g set member_count = coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0) where g.member_count is distinct from coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0);

-- ===== 0. 套用前備份（回滾用；上次的備份還在就停）=====
do $$ begin if to_regclass('backup.official_meta_20260930') is not null then raise exception '已有 backup.official_meta_20260930：確認後 drop 第 0 段的 backup 表再重新套用'; end if; end $$;
create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table backup.vtubers_official_20260930 as select v.id, v.group_id, v.activity, v.graduated_at, e.clears_group, e.new_activity, e.new_graduated_at from public.vtubers v join (values ('6161a7b7-849d-478a-b07c-e1972b27c976'::uuid, true, null::text, null::date), ('84dcab29-7779-473d-8179-6cfd3ce40d1d'::uuid, true, null::text, null::date), ('2841e83e-9b96-4e36-bb22-595af6ac77dc'::uuid, false, 'graduate', null::date)) as e(id, clears_group, new_activity, new_graduated_at) on e.id = v.id;
create table backup.vtuber_channels_ids_official_20260930 as select id from public.vtuber_channels;
create table backup.official_meta_20260930 as select now() as applied_at;

-- ===== 1. 正式所屬改成合作（主所屬只在目前就是這家時清空；合作掛頂層公司）=====
-- 葉月 Hazuki（古德文創）
do $$ begin if exists (select 1 from public.vtubers v where v.id = '6161a7b7-849d-478a-b07c-e1972b27c976' and v.group_id is not null and v.group_id not in (select id from public.vtuber_groups where id = (select id from public.vtuber_groups where name = '古德文創' and parent_id is null) or parent_id = (select id from public.vtuber_groups where name = '古德文創' and parent_id is null))) then raise warning '% 目前掛在別的團體，主所屬沒有清空', '葉月 Hazuki'; end if; end $$;
insert into public.vtuber_group_links (vtuber_id, group_id, role, source_url, verified_at) select v.id, (select id from public.vtuber_groups where name = '古德文創' and parent_id is null), 'collaborator', 'https://www.goodcc.com.tw/influencer-static/pagination/all.json', '2026-09-30'::date from public.vtubers v where v.id = '6161a7b7-849d-478a-b07c-e1972b27c976' and (select id from public.vtuber_groups where name = '古德文創' and parent_id is null) is not null on conflict (vtuber_id, group_id, role) do nothing;
update public.vtubers v set group_id = null where v.id = '6161a7b7-849d-478a-b07c-e1972b27c976' and v.group_id in (select id from public.vtuber_groups where id = (select id from public.vtuber_groups where name = '古德文創' and parent_id is null) or parent_id = (select id from public.vtuber_groups where name = '古德文創' and parent_id is null));
-- sazki（古德文創）
do $$ begin if exists (select 1 from public.vtubers v where v.id = '84dcab29-7779-473d-8179-6cfd3ce40d1d' and v.group_id is not null and v.group_id not in (select id from public.vtuber_groups where id = (select id from public.vtuber_groups where name = '古德文創' and parent_id is null) or parent_id = (select id from public.vtuber_groups where name = '古德文創' and parent_id is null))) then raise warning '% 目前掛在別的團體，主所屬沒有清空', 'sazki'; end if; end $$;
insert into public.vtuber_group_links (vtuber_id, group_id, role, source_url, verified_at) select v.id, (select id from public.vtuber_groups where name = '古德文創' and parent_id is null), 'collaborator', 'https://www.goodcc.com.tw/influencer-static/pagination/all.json', '2026-09-30'::date from public.vtubers v where v.id = '84dcab29-7779-473d-8179-6cfd3ce40d1d' and (select id from public.vtuber_groups where name = '古德文創' and parent_id is null) is not null on conflict (vtuber_id, group_id, role) do nothing;
update public.vtubers v set group_id = null where v.id = '84dcab29-7779-473d-8179-6cfd3ce40d1d' and v.group_id in (select id from public.vtuber_groups where id = (select id from public.vtuber_groups where name = '古德文創' and parent_id is null) or parent_id = (select id from public.vtuber_groups where name = '古德文創' and parent_id is null));

-- ===== 2. 官網標示離開 → 已畢業（只有官方精確日期才寫 graduated_at）=====
-- 納希斯Narciss（花遊工作室：已完結）
update public.vtubers v set activity = 'graduate' where v.id = '2841e83e-9b96-4e36-bb22-595af6ac77dc' and v.activity <> 'graduate';

-- ===== 3. 官網有、資料庫沒有的成員（contributed_by='official:2026-09-30'；頻道或名字已存在就跳過）=====
-- 茱莉葉塔（花遊工作室／希望旅團）
insert into public.vtubers (name, nationality, activity, youtube_channel_id, twitch_channel_id, img_url, group_id, contributed_by) select '茱莉葉塔', (select nationality from public.vtuber_groups where id = (select id from public.vtuber_groups where name = '花遊工作室' and parent_id is null)), 'active', 'UCqgXGPKOaLGGtHPPuAB7qwQ', null, 'https://yt3.ggpht.com/7Vsl-kDIfeRriO5fF7AwElTdAaritSiC7LPbs66bApWnBzFt2pKeazPQLxa3sQDVKinO2RmV5g=s88-c-k-c0x00ffffff-no-rj', (select id from public.vtuber_groups where name = '希望旅團' and parent_id = (select id from public.vtuber_groups where name = '花遊工作室' and parent_id is null)), 'official:2026-09-30' where (select id from public.vtuber_groups where name = '希望旅團' and parent_id = (select id from public.vtuber_groups where name = '花遊工作室' and parent_id is null)) is not null and not exists (select 1 from public.vtubers x where x.youtube_channel_id = 'UCqgXGPKOaLGGtHPPuAB7qwQ' or x.name = '茱莉葉塔');
insert into public.vtuber_channels (vtuber_id, platform, external_id, handle) select v.id, 'youtube', 'UCqgXGPKOaLGGtHPPuAB7qwQ', 'UCqgXGPKOaLGGtHPPuAB7qwQ' from public.vtubers v where v.youtube_channel_id = 'UCqgXGPKOaLGGtHPPuAB7qwQ' and not exists (select 1 from public.vtuber_channels c where c.platform = 'youtube' and c.external_id = 'UCqgXGPKOaLGGtHPPuAB7qwQ' and c.status = 'active') limit 1;
do $$ begin if not exists (select 1 from public.vtubers v where v.youtube_channel_id = 'UCqgXGPKOaLGGtHPPuAB7qwQ') then raise warning '新成員 % 沒有加入（同名已存在或所屬團體不存在）', '茱莉葉塔'; end if; end $$;
-- 比托利亞（花遊工作室／希望旅團）
insert into public.vtubers (name, nationality, activity, youtube_channel_id, twitch_channel_id, img_url, group_id, contributed_by) select '比托利亞', (select nationality from public.vtuber_groups where id = (select id from public.vtuber_groups where name = '花遊工作室' and parent_id is null)), 'active', 'UCF2iSeWZlM17X3relZMs_fQ', null, 'https://yt3.ggpht.com/XI1ZOsZxyf2PwUW9OiIikCTyB7BWWg3AJR5wgSWyAvseD9my7sJSPCa6IhzWgAtDUQCI11WdeM4=s88-c-k-c0x00ffffff-no-rj', (select id from public.vtuber_groups where name = '希望旅團' and parent_id = (select id from public.vtuber_groups where name = '花遊工作室' and parent_id is null)), 'official:2026-09-30' where (select id from public.vtuber_groups where name = '希望旅團' and parent_id = (select id from public.vtuber_groups where name = '花遊工作室' and parent_id is null)) is not null and not exists (select 1 from public.vtubers x where x.youtube_channel_id = 'UCF2iSeWZlM17X3relZMs_fQ' or x.name = '比托利亞');
insert into public.vtuber_channels (vtuber_id, platform, external_id, handle) select v.id, 'youtube', 'UCF2iSeWZlM17X3relZMs_fQ', 'UCF2iSeWZlM17X3relZMs_fQ' from public.vtubers v where v.youtube_channel_id = 'UCF2iSeWZlM17X3relZMs_fQ' and not exists (select 1 from public.vtuber_channels c where c.platform = 'youtube' and c.external_id = 'UCF2iSeWZlM17X3relZMs_fQ' and c.status = 'active') limit 1;
do $$ begin if not exists (select 1 from public.vtubers v where v.youtube_channel_id = 'UCF2iSeWZlM17X3relZMs_fQ') then raise warning '新成員 % 沒有加入（同名已存在或所屬團體不存在）', '比托利亞'; end if; end $$;

-- ===== 4. 成員數校正（之後由 trigger 維護）=====
update public.vtuber_groups g set member_count = coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0)
where g.member_count is distinct from coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0);
