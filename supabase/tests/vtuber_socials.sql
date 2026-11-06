-- vtubers 新增 threads_url／discord_url 欄位的 CHECK 約束測試（S1～S4）。
-- 執行：docker exec -i supabase_db_multi-stream psql -U postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/vtuber_socials.sql
-- 整檔在一個交易內，結尾 ROLLBACK，不留下任何資料。斷言失敗一律 RAISE EXCEPTION（ON_ERROR_STOP 讓 psql 以非 0 結束）。
-- 契約：
--   threads_url CHECK：^https://(www\.)?threads\.(net|com)/@[A-Za-z0-9_.]{1,30}/?$（不分大小寫），長度 <= 2048
--   discord_url CHECK：^https://(discord\.gg|(www\.)?discord\.com/invite)/[A-Za-z0-9-]{2,32}/?$（不分大小寫）
--   違反約束 → SQLSTATE 23514（欄位不存在會是 42703，所以欄位還沒加時紅在這裡）。

BEGIN;

-- ───────────── 測試輔助（pg_temp，ROLLBACK 後消失） ─────────────
-- 一律用 plpgsql + EXECUTE 動態 SQL：新欄位尚未存在時整檔仍能載入，失敗點落在各自的斷言。

-- 預期把 p_col 設成 p_val 成功（含 NULL 以外的任意字串）
CREATE FUNCTION pg_temp.expect_ok(p_tag text, p_col text, p_val text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE format('UPDATE public.vtubers SET %I = %L WHERE id = %L', p_col, p_val, '00000000-0000-4000-8000-0000000000f1');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '% 失敗：% 寫入「%」預期成功，卻丟 %（%）', p_tag, p_col, p_val, SQLSTATE, SQLERRM;
  END;
END $$;

-- 預期寫入被 CHECK 擋下（SQLSTATE 必須是 23514；沒擋、或擋的原因是別的錯都算失敗）
CREATE FUNCTION pg_temp.expect_check_violation(p_tag text, p_col text, p_val text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_state text; v_msg text; v_failed boolean := false;
BEGIN
  BEGIN
    EXECUTE format('UPDATE public.vtubers SET %I = %L WHERE id = %L', p_col, p_val, '00000000-0000-4000-8000-0000000000f1');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_state := SQLSTATE;
    v_msg := SQLERRM;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION '% 失敗：% 寫入「%」預期被擋（23514），但成功了', p_tag, p_col, p_val;
  END IF;
  IF v_state IS DISTINCT FROM '23514' THEN
    RAISE EXCEPTION '% 失敗：% 寫入「%」預期 SQLSTATE 23514，實得 %（%）', p_tag, p_col, p_val, v_state, v_msg;
  END IF;
END $$;

-- ───────────── 測資（直接寫表，不依賴本地既有資料） ─────────────
INSERT INTO public.vtubers (id, name, nationality, slug) VALUES
  ('00000000-0000-4000-8000-0000000000f1', 'zz社群欄位測試主', 'TW', 'zz-socials-test');

-- ───────────── S1 Threads 合法網址可寫入 ─────────────
SELECT pg_temp.expect_ok('S1-a threads.net',        'threads_url', 'https://threads.net/@abc');
SELECT pg_temp.expect_ok('S1-b threads.com',        'threads_url', 'https://threads.com/@abc');
SELECT pg_temp.expect_ok('S1-c www.threads.net',    'threads_url', 'https://www.threads.net/@abc');
SELECT pg_temp.expect_ok('S1-d www.threads.com',    'threads_url', 'https://www.threads.com/@abc');
SELECT pg_temp.expect_ok('S1-e 尾斜線',              'threads_url', 'https://www.threads.net/@abc/');
SELECT pg_temp.expect_ok('S1-f 底線與點',            'threads_url', 'https://www.threads.net/@a_b.c');
SELECT pg_temp.expect_ok('S1-g 30 字上限',           'threads_url', 'https://www.threads.net/@' || repeat('a', 30));
SELECT pg_temp.expect_ok('S1-h 不分大小寫',          'threads_url', 'HTTPS://WWW.THREADS.NET/@AbC');

-- ───────────── S2 Threads 非法網址被擋 ─────────────
SELECT pg_temp.expect_check_violation('S2-a 其他網域',        'threads_url', 'https://www.instagram.com/@x');
SELECT pg_temp.expect_check_violation('S2-b 沒有 @',          'threads_url', 'https://threads.net/x');
SELECT pg_temp.expect_check_violation('S2-c http',            'threads_url', 'http://threads.net/@x');
SELECT pg_temp.expect_check_violation('S2-d @ 後含斜線',      'threads_url', 'https://threads.net/@a/b');
SELECT pg_temp.expect_check_violation('S2-e @ 後含空白',      'threads_url', 'https://threads.net/@a b');
SELECT pg_temp.expect_check_violation('S2-f @ 後為空',        'threads_url', 'https://threads.net/@');
SELECT pg_temp.expect_check_violation('S2-g 超過 30 字',      'threads_url', 'https://threads.net/@' || repeat('a', 31));
SELECT pg_temp.expect_check_violation('S2-h 假冒網域',        'threads_url', 'https://threads.net.evil.com/@x');
SELECT pg_temp.expect_check_violation('S2-i 帶查詢字串',      'threads_url', 'https://threads.net/@x?a=1');
SELECT pg_temp.expect_check_violation('S2-j 前綴雜訊',        'threads_url', 'javascript:alert(1)//https://threads.net/@x');

-- ───────────── S3 Discord 合法邀請可寫入 ─────────────
SELECT pg_temp.expect_ok('S3-a discord.gg',            'discord_url', 'https://discord.gg/abc');
SELECT pg_temp.expect_ok('S3-b discord.com/invite',    'discord_url', 'https://discord.com/invite/abc-1');
SELECT pg_temp.expect_ok('S3-c www.discord.com',       'discord_url', 'https://www.discord.com/invite/x1');
SELECT pg_temp.expect_ok('S3-d 尾斜線',                 'discord_url', 'https://discord.gg/abc/');
SELECT pg_temp.expect_ok('S3-e 2 字下限',               'discord_url', 'https://discord.gg/ab');
SELECT pg_temp.expect_ok('S3-f 32 字上限',              'discord_url', 'https://discord.gg/' || repeat('a', 32));
SELECT pg_temp.expect_ok('S3-g 不分大小寫',             'discord_url', 'HTTPS://DISCORD.GG/AbC');

-- ───────────── S4 Discord 非法網址被擋 ─────────────
SELECT pg_temp.expect_check_violation('S4-a 頻道連結',        'discord_url', 'https://discord.com/channels/1/2');
SELECT pg_temp.expect_check_violation('S4-b 邀請碼為空',      'discord_url', 'https://discord.gg/');
SELECT pg_temp.expect_check_violation('S4-c http',            'discord_url', 'http://discord.gg/abc');
SELECT pg_temp.expect_check_violation('S4-d 其他網域',        'discord_url', 'https://evil.com/invite/x');
SELECT pg_temp.expect_check_violation('S4-e 邀請碼 1 字',     'discord_url', 'https://discord.gg/a');
SELECT pg_temp.expect_check_violation('S4-f 邀請碼 33 字',    'discord_url', 'https://discord.gg/' || repeat('a', 33));
SELECT pg_temp.expect_check_violation('S4-g 邀請碼含底線',    'discord_url', 'https://discord.gg/a_b');
SELECT pg_temp.expect_check_violation('S4-h discord.gg 帶 invite 路徑', 'discord_url', 'https://discord.gg/invite/abc');
SELECT pg_temp.expect_check_violation('S4-i 假冒網域',        'discord_url', 'https://discord.gg.evil.com/abc');
SELECT pg_temp.expect_check_violation('S4-j 邀請碼含空白',    'discord_url', 'https://discord.gg/a b');

ROLLBACK;
