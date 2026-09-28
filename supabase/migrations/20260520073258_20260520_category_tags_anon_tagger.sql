
alter table public.vtuber_category_tags
    alter column tagged_by drop not null;

comment on column public.vtuber_category_tags.tagged_by is
    '標記者 user_id;匿名推薦時為 NULL。FK ON DELETE SET NULL 仍維持。';
