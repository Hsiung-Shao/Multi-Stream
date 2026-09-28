
alter table public.vtubers
    add column if not exists languages text[] not null default '{}';

alter table public.vtubers
    add constraint vtubers_languages_check
    check (
        languages <@ array['zh-TW','zh-CN','en','ja','ko']::text[]
        and array_length(languages, 1) <= 5
    );

create index if not exists vtubers_languages_gin
    on public.vtubers using gin (languages);

comment on column public.vtubers.languages is
    '實況主主要使用語言(對齊 i18n locale:zh-TW/zh-CN/en/ja/ko)。由推薦流程 union 累積;空陣列表示尚未標記。';
