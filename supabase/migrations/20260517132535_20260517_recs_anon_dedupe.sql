
alter table public.vtuber_recommendations
    add column if not exists anonymous_id text;

comment on column public.vtuber_recommendations.anonymous_id is
    '匿名推薦識別:browser 端生成 UUID 存 localStorage,提交時帶上,server 直接寫入(不做轉型/hash)。登入 user 該欄為 NULL,改用 user_id 去重。';

create unique index if not exists vtuber_recommendations_vtuber_anon_uniq
    on public.vtuber_recommendations (vtuber_id, anonymous_id)
    where anonymous_id is not null and user_id is null;
