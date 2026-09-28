-- Drop tables that don't belong to multi-stream project
-- products / orders / gallery 看起來是先前其他專案殘留 schema，全部 0 rows，無業務依賴
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.gallery CASCADE;
