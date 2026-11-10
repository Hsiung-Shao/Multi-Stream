-- Supabase advisor lint 修正（2026-11-10）。
-- 1. 安全：anon／authenticated 不該能經 /rest/v1/rpc 呼叫的 SECURITY DEFINER 函式 → REVOKE（service_role 保留）。
--    increment_contribution_quota(p_user_id…) 讓任何人能灌爆任一使用者的每日投稿額度；get_vtuber_by_channel、search_vtubers 程式已無呼叫端；
--    validate_vtuber_contribution_source_urls 是 trigger 函式（trigger 執行不檢查 EXECUTE）。
--    increment_post_report_count 是 posts 表刪除後留下的孤兒 trigger 函式 → DROP。
--    is_admin／auth_trust_level／has_verified_mfa／auth_is_aal2 不動：RLS policy 用到，REVOKE 會讓 policy 失效。
-- 2. 效能 auth_rls_initplan：policy 內 auth.uid() 與無參數判斷函式包成 (select …)，每個查詢只算一次、不再逐列重算。
--    以下 alter policy 由正式庫 pg_policies 現值機械產生（只做包裝替換），語意不變。
-- 3. 效能 multiple_permissive_policies：只刪語意完全相同的重複 policy（vtuber_livestreams 兩條 using(true) 的公開讀取）。
--
-- 回滾：
--   grant execute on function public.increment_contribution_quota(uuid, text, integer), public.get_vtuber_by_channel(text, text),
--     public.search_vtubers(text, integer, real), public.validate_vtuber_contribution_source_urls() to anon, authenticated;
--   create policy "Anyone can read livestreams" on public.vtuber_livestreams for select to public using (true);
--   policy 包裝不需回滾（語意相同）；要還原就把各 alter policy 的 ( SELECT x() AS x) 換回 x()。
--   increment_post_report_count 無引用，不回建。

-- ===== 1. 安全 =====
revoke execute on function public.increment_contribution_quota(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.get_vtuber_by_channel(text, text) from public, anon, authenticated;
revoke execute on function public.search_vtubers(text, integer, real) from public, anon, authenticated;
revoke execute on function public.validate_vtuber_contribution_source_urls() from public, anon, authenticated;
grant execute on function public.increment_contribution_quota(uuid, text, integer) to service_role;
grant execute on function public.get_vtuber_by_channel(text, text) to service_role;
grant execute on function public.search_vtubers(text, integer, real) to service_role;

drop function if exists public.increment_post_report_count();

-- ===== 3. 重複的公開讀取 policy =====
drop policy if exists "Anyone can read livestreams" on public.vtuber_livestreams;

-- ===== 2. RLS initplan（由 pg_policies 產生）=====
alter policy admin_actions_admin_requires_aal2 on public.admin_actions
  using (((NOT (( SELECT is_admin() AS is_admin) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)))
  with check (((NOT (( SELECT is_admin() AS is_admin) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy admin_actions_admin_select on public.admin_actions
  using (( SELECT is_admin() AS is_admin));
alter policy announcement_responses_admin_select on public.announcement_responses
  using ((( SELECT is_admin() AS is_admin) AND ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy announcements_admin_write on public.announcements
  using ((( SELECT is_admin() AS is_admin) AND ( SELECT auth_is_aal2() AS auth_is_aal2)))
  with check ((( SELECT is_admin() AS is_admin) AND ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy feedbacks_admin_delete on public.feedbacks
  using (( SELECT is_admin() AS is_admin));
alter policy feedbacks_admin_requires_aal2 on public.feedbacks
  using (((NOT (( SELECT is_admin() AS is_admin) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)))
  with check (((NOT (( SELECT is_admin() AS is_admin) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy feedbacks_admin_select on public.feedbacks
  using (( SELECT is_admin() AS is_admin));
alter policy feedbacks_admin_update on public.feedbacks
  using (( SELECT is_admin() AS is_admin))
  with check (( SELECT is_admin() AS is_admin));
alter policy song_segments_admin_write on public.song_segments
  using ((( SELECT is_admin() AS is_admin) AND ( SELECT auth_is_aal2() AS auth_is_aal2)))
  with check ((( SELECT is_admin() AS is_admin) AND ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy song_videos_admin_write on public.song_videos
  using ((( SELECT is_admin() AS is_admin) AND ( SELECT auth_is_aal2() AS auth_is_aal2)))
  with check ((( SELECT is_admin() AS is_admin) AND ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy system_logs_admin_requires_aal2 on public.system_logs
  using (((NOT (( SELECT is_admin() AS is_admin) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)))
  with check (((NOT (( SELECT is_admin() AS is_admin) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy system_logs_admin_select on public.system_logs
  using (( SELECT is_admin() AS is_admin));
alter policy "Owner can delete own categories" on public.user_favorite_categories
  using ((( SELECT auth.uid() AS uid) = user_id));
alter policy "Owner can insert own categories" on public.user_favorite_categories
  with check ((( SELECT auth.uid() AS uid) = user_id));
alter policy "Owner can read own categories" on public.user_favorite_categories
  using ((( SELECT auth.uid() AS uid) = user_id));
alter policy "Owner can update own categories" on public.user_favorite_categories
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
alter policy user_favorite_categories_aal2_when_mfa_enrolled on public.user_favorite_categories
  using (((NOT ( SELECT has_verified_mfa() AS has_verified_mfa)) OR (( SELECT (auth.jwt() ->> 'aal'::text)) = 'aal2'::text)));
alter policy "Owner can delete own tags" on public.user_favorite_tags
  using ((( SELECT auth.uid() AS uid) = user_id));
alter policy "Owner can insert own tags" on public.user_favorite_tags
  with check ((( SELECT auth.uid() AS uid) = user_id));
alter policy "Owner can read own tags" on public.user_favorite_tags
  using ((( SELECT auth.uid() AS uid) = user_id));
alter policy "Owner can update own tags" on public.user_favorite_tags
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
alter policy user_favorite_tags_aal2_when_mfa_enrolled on public.user_favorite_tags
  using (((NOT ( SELECT has_verified_mfa() AS has_verified_mfa)) OR (( SELECT (auth.jwt() ->> 'aal'::text)) = 'aal2'::text)));
alter policy "Owner can delete own favorites" on public.user_favorites
  using ((( SELECT auth.uid() AS uid) = user_id));
alter policy "Owner can insert own favorites" on public.user_favorites
  with check ((( SELECT auth.uid() AS uid) = user_id));
alter policy "Owner can read own favorites" on public.user_favorites
  using ((( SELECT auth.uid() AS uid) = user_id));
alter policy "Owner can update own favorites" on public.user_favorites
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
alter policy user_favorites_aal2_when_mfa_enrolled on public.user_favorites
  using (((NOT ( SELECT has_verified_mfa() AS has_verified_mfa)) OR (( SELECT (auth.jwt() ->> 'aal'::text)) = 'aal2'::text)));
alter policy user_profiles_aal2_when_mfa_enrolled on public.user_profiles
  using (((NOT ( SELECT has_verified_mfa() AS has_verified_mfa)) OR (( SELECT (auth.jwt() ->> 'aal'::text)) = 'aal2'::text)));
alter policy user_profiles_insert on public.user_profiles
  with check ((supabase_auth_id = ( SELECT auth.uid() AS uid)));
alter policy user_profiles_select on public.user_profiles
  using (((supabase_auth_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));
alter policy user_profiles_update_own on public.user_profiles
  using ((supabase_auth_id = ( SELECT auth.uid() AS uid)))
  with check ((supabase_auth_id = ( SELECT auth.uid() AS uid)));
alter policy vtuber_categories_admin_full on public.vtuber_categories
  using ((( SELECT is_admin() AS is_admin) AND ( SELECT auth_is_aal2() AS auth_is_aal2)))
  with check ((( SELECT is_admin() AS is_admin) AND ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy vtuber_category_tags_self_delete on public.vtuber_category_tags
  using ((tagged_by = ( SELECT auth.uid() AS uid)));
alter policy vtuber_category_tags_self_insert on public.vtuber_category_tags
  with check ((tagged_by = ( SELECT auth.uid() AS uid)));
alter policy "Admins can update contributions" on public.vtuber_contributions
  using ((auth_trust_level(( SELECT auth.uid() AS uid)) = ANY (ARRAY['admin'::text, 'moderator'::text])));
alter policy "Submitter can read own contributions" on public.vtuber_contributions
  using (((submitted_by = (( SELECT auth.uid() AS uid))::text) OR (auth_trust_level(( SELECT auth.uid() AS uid)) = ANY (ARRAY['admin'::text, 'moderator'::text]))));
alter policy vtuber_contributions_admin_requires_aal2 on public.vtuber_contributions
  using (((NOT ((auth_trust_level(( SELECT auth.uid() AS uid)) = ANY (ARRAY['admin'::text, 'moderator'::text])) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)))
  with check (((NOT ((auth_trust_level(( SELECT auth.uid() AS uid)) = ANY (ARRAY['admin'::text, 'moderator'::text])) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy vtuber_contributions_admin_update on public.vtuber_contributions
  using (( SELECT is_admin() AS is_admin))
  with check (( SELECT is_admin() AS is_admin));
alter policy "Admins can mutate events" on public.vtuber_events
  using ((auth_trust_level(( SELECT auth.uid() AS uid)) = ANY (ARRAY['admin'::text, 'moderator'::text])))
  with check ((auth_trust_level(( SELECT auth.uid() AS uid)) = ANY (ARRAY['admin'::text, 'moderator'::text])));
alter policy "Owners can update own events" on public.vtuber_events
  using ((( SELECT auth.uid() AS uid) = organizer_id));
alter policy vtuber_events_admin_requires_aal2 on public.vtuber_events
  using (((NOT ((auth_trust_level(( SELECT auth.uid() AS uid)) = ANY (ARRAY['admin'::text, 'moderator'::text])) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)))
  with check (((NOT ((auth_trust_level(( SELECT auth.uid() AS uid)) = ANY (ARRAY['admin'::text, 'moderator'::text])) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy vtuber_group_links_admin_delete on public.vtuber_group_links
  using (( SELECT is_admin() AS is_admin));
alter policy vtuber_group_links_admin_insert on public.vtuber_group_links
  with check (( SELECT is_admin() AS is_admin));
alter policy vtuber_group_links_admin_requires_aal2 on public.vtuber_group_links
  using (((NOT (( SELECT is_admin() AS is_admin) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)))
  with check (((NOT (( SELECT is_admin() AS is_admin) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy vtuber_group_links_admin_update on public.vtuber_group_links
  using (( SELECT is_admin() AS is_admin))
  with check (( SELECT is_admin() AS is_admin));
alter policy vtuber_groups_admin_delete on public.vtuber_groups
  using (( SELECT is_admin() AS is_admin));
alter policy vtuber_groups_admin_insert on public.vtuber_groups
  with check (( SELECT is_admin() AS is_admin));
alter policy vtuber_groups_admin_requires_aal2 on public.vtuber_groups
  using (((NOT (( SELECT is_admin() AS is_admin) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)))
  with check (((NOT (( SELECT is_admin() AS is_admin) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy vtuber_groups_admin_update on public.vtuber_groups
  using (( SELECT is_admin() AS is_admin))
  with check (( SELECT is_admin() AS is_admin));
alter policy "Admins can mutate livestreams" on public.vtuber_livestreams
  using ((auth_trust_level(( SELECT auth.uid() AS uid)) = ANY (ARRAY['admin'::text, 'moderator'::text])))
  with check ((auth_trust_level(( SELECT auth.uid() AS uid)) = ANY (ARRAY['admin'::text, 'moderator'::text])));
alter policy vtuber_livestreams_admin_delete on public.vtuber_livestreams
  using (( SELECT is_admin() AS is_admin));
alter policy vtuber_livestreams_admin_insert on public.vtuber_livestreams
  with check (( SELECT is_admin() AS is_admin));
alter policy vtuber_livestreams_admin_requires_aal2 on public.vtuber_livestreams
  using (((NOT ((auth_trust_level(( SELECT auth.uid() AS uid)) = ANY (ARRAY['admin'::text, 'moderator'::text])) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)))
  with check (((NOT ((auth_trust_level(( SELECT auth.uid() AS uid)) = ANY (ARRAY['admin'::text, 'moderator'::text])) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy vtuber_livestreams_admin_update on public.vtuber_livestreams
  using (( SELECT is_admin() AS is_admin))
  with check (( SELECT is_admin() AS is_admin));
alter policy vtuber_recommendations_self_delete on public.vtuber_recommendations
  using ((user_id = ( SELECT auth.uid() AS uid)));
alter policy vtuber_recommendations_self_insert on public.vtuber_recommendations
  with check ((user_id = ( SELECT auth.uid() AS uid)));
alter policy vtubers_admin_delete on public.vtubers
  using (( SELECT is_admin() AS is_admin));
alter policy vtubers_admin_insert on public.vtubers
  with check (( SELECT is_admin() AS is_admin));
alter policy vtubers_admin_requires_aal2 on public.vtubers
  using (((NOT (( SELECT is_admin() AS is_admin) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)))
  with check (((NOT (( SELECT is_admin() AS is_admin) AND ( SELECT has_verified_mfa() AS has_verified_mfa))) OR ( SELECT auth_is_aal2() AS auth_is_aal2)));
alter policy vtubers_admin_update on public.vtubers
  using (( SELECT is_admin() AS is_admin))
  with check (( SELECT is_admin() AS is_admin));
