-- hololive production（日本 COVER 株式会社）頂層團體（2026-09-30 使用者要求加入 hololive 全分部成員）。
-- 地區記 JP（公司所在地）；成員地區依分部另記（日本分部與 DEV_IS 為 JP，English／Indonesia 為 OTHER＝社群歸屬）。
-- 子團與成員由 20260930130100（scripts/build-agency-rosters.mjs）建立。
--
-- 回滾（須先回滾 20260930130100，確認沒有成員或子團掛著）：
--   delete from public.vtuber_groups g where g.name = 'hololive production' and g.parent_id is null
--     and not exists (select 1 from public.vtuber_groups c where c.parent_id = g.id)
--     and not exists (select 1 from public.vtubers v where v.group_id = g.id or v.former_group_id = g.id);

insert into public.vtuber_groups (name, nationality, kind, parent_id, verified_at, source_url, note)
values (
    'hololive production',
    'JP',
    'agency',
    null,
    '2026-09-30',
    'https://hololive.hololivepro.com/talents',
    '日本 COVER 株式会社旗下；含日本、DEV_IS、English、Indonesia 分部'
)
on conflict (name) do nothing;
