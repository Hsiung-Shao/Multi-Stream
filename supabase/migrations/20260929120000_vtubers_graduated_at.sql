-- 畢業日期與前所屬（2026-09-29 使用者裁定：畢業藝人記「狀態＋畢業日期」；出道日已有 debut_date）
-- 由企業勢逐家名冊（scripts/build-agency-rosters.mjs）填入；週表的團體名冊依它排出「已畢業」區塊。
--
-- 兩種離開要分開記：
--   - 引退（不再活動）：activity='graduate'、group_id 保留原公司、graduated_at＝畢業日
--   - 離開公司但繼續活動（轉個人勢、轉籍）：activity 維持 active、group_id 清空（卡片不再顯示公司）、
--     former_group_id＝原公司（頂層公司，不是子團）、graduated_at＝離開日；週表照常追蹤他的直播，公司名冊仍列在「已畢業」
-- is_official：公司／團體的官方頻道（不是藝人）；照常掛團（篩選看得到官方直播），名冊不列
--
-- 回滾：alter table public.vtubers drop column if exists is_official, drop column if exists former_group_id, drop column if exists graduated_at;

alter table public.vtubers
    add column if not exists graduated_at date,
    add column if not exists former_group_id uuid references public.vtuber_groups(id) on delete set null,
    add column if not exists is_official boolean not null default false;

create index if not exists vtubers_former_group_id_idx on public.vtubers (former_group_id) where former_group_id is not null;

comment on column public.vtubers.graduated_at is
    '畢業／解約／離開公司的日期（未來日期代表已公告的預定畢業日）';
comment on column public.vtubers.former_group_id is
    '離開公司但繼續活動（轉個人勢等）時的原公司（頂層公司）；目前所屬在 group_id（通常為 null）';
comment on column public.vtubers.is_official is
    '公司或團體的官方頻道（不是藝人）；由企業勢名冊產生器標記，團體名冊不列';
