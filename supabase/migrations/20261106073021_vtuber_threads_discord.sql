-- VTuber 個人頁社群連結：新增 Threads 與 Discord（2026-11-06 使用者裁定：個人頁有的就收、沒有就跳過）
--
-- 與既有 x_url／instagram_url 同模式：網址正規化後存，CHECK 限定網域與格式（最後一道防線）。
-- 資料來源：VTuber 本人在 YouTube「關於」頁填的外部連結（只補空欄位、人工審過才寫）。
--
-- 回滾：
--   alter table public.vtubers drop constraint if exists vtubers_threads_url_format,
--       drop constraint if exists vtubers_discord_url_format,
--       drop column if exists threads_url, drop column if exists discord_url;
--   delete from supabase_migrations.schema_migrations where version = '20261106200000';

alter table public.vtubers
    add column if not exists threads_url text,
    add column if not exists discord_url text;

alter table public.vtubers
    add constraint vtubers_threads_url_format check (
        threads_url is null or (char_length(threads_url) <= 2048 and threads_url ~* '^https://(www\.)?threads\.(net|com)/@[A-Za-z0-9_.]{1,30}/?$')
    ),
    add constraint vtubers_discord_url_format check (
        discord_url is null or (char_length(discord_url) <= 2048 and discord_url ~* '^https://(discord\.gg|(www\.)?discord\.com/invite)/[A-Za-z0-9-]{2,32}/?$')
    );

comment on column public.vtubers.threads_url is 'Threads 個人頁網址（threads.net／threads.com 的 @帳號）';
comment on column public.vtubers.discord_url is 'Discord 邀請連結（discord.gg／discord.com/invite）';
