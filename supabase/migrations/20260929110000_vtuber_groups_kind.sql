-- 團體分類與兩層結構（2026-09-29 使用者裁定）
--
-- - kind：agency（企業勢，公司或商業團隊經營、簽約藝人）／circle（同好社團、共同企劃）／
--         personal（個人工作室或家族）／unverified（未查證）
-- - parent_id：子團指向所屬公司（例：瑟拉斯蒂歐 → 春魚創意）；公司本身也是一筆 kind='agency' 的團體
-- - verified_at／source_url／note：查證日期、出處、補充（例如解散日期、合作藝人）
-- - member_count 改由 trigger 維護：04-28 以前是手動寫值，曾出現「寫 14、實際 2」的漂移
--
-- 回滾：
--   drop trigger if exists vtubers_group_member_count on public.vtubers;
--   drop function if exists public.vtubers_group_member_count();
--   alter table public.vtuber_groups
--     drop constraint if exists vtuber_groups_kind_check,
--     drop constraint if exists vtuber_groups_parent_not_self,
--     drop column if exists kind, drop column if exists parent_id,
--     drop column if exists verified_at, drop column if exists source_url, drop column if exists note;

-- 可重跑：欄位／索引用 if not exists，constraint／trigger 先 drop 再建（半套用失敗後可直接補跑）
alter table public.vtuber_groups
    add column if not exists kind text not null default 'unverified',
    add column if not exists parent_id uuid references public.vtuber_groups(id) on delete set null,
    add column if not exists verified_at date,
    add column if not exists source_url text,
    add column if not exists note text;

alter table public.vtuber_groups
    drop constraint if exists vtuber_groups_kind_check,
    drop constraint if exists vtuber_groups_parent_not_self;
alter table public.vtuber_groups
    add constraint vtuber_groups_kind_check check (kind in ('agency', 'circle', 'personal', 'unverified')),
    add constraint vtuber_groups_parent_not_self check (parent_id is null or parent_id <> id);

create index if not exists vtuber_groups_parent_id_idx on public.vtuber_groups (parent_id) where parent_id is not null;

comment on column public.vtuber_groups.kind is
    'agency＝企業勢／circle＝社團／personal＝個人工作室或家族／unverified＝未查證';
comment on column public.vtuber_groups.parent_id is
    '子團的所屬公司（同表的一筆 kind=agency 團體）；公司本身與一般團體為 null。只支援一層：parent 必須是 parent_id 為 null 的頂層公司（前端與 snapshot 只往上看一層）';

-- ===== member_count 由 trigger 維護 =====
-- SECURITY INVOKER：目前只有 admin（RLS 可改 vtuber_groups）與 service_role 會改 vtubers.group_id。
-- 若之後開放其他角色寫 vtubers，trigger 裡的 update 會被 RLS 擋成 0 列（不報錯）而再度漂移，屆時要改寫或定期校正。
create or replace function public.vtubers_group_member_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if tg_op in ('UPDATE', 'DELETE') and old.group_id is not null
       and (tg_op = 'DELETE' or old.group_id is distinct from new.group_id) then
        update public.vtuber_groups set member_count = greatest(member_count - 1, 0) where id = old.group_id;
    end if;
    if tg_op in ('INSERT', 'UPDATE') and new.group_id is not null
       and (tg_op = 'INSERT' or old.group_id is distinct from new.group_id) then
        update public.vtuber_groups set member_count = member_count + 1 where id = new.group_id;
    end if;
    return null;
end;
$$;

drop trigger if exists vtubers_group_member_count on public.vtubers;
create trigger vtubers_group_member_count
    after insert or update of group_id or delete on public.vtubers
    for each row execute function public.vtubers_group_member_count();

-- 以實際成員數校正一次
update public.vtuber_groups g
set member_count = coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0)
where g.member_count is distinct from coalesce((select count(*) from public.vtubers v where v.group_id = g.id), 0);
