-- Security Hotfix:cleanup_old_logs 權限收回 + vtuber_events admin policy bug 修正

-- Step A:REVOKE cleanup_old_logs EXECUTE
revoke execute on function public.cleanup_old_logs() from public;
revoke execute on function public.cleanup_old_logs() from anon;
revoke execute on function public.cleanup_old_logs() from authenticated;

comment on function public.cleanup_old_logs() is
  'Service-only log cleanup. EXECUTE revoked from public/anon/authenticated; only service_role can invoke (typically via cron / backend functions).';

-- Step B:DROP buggy vtuber_events admin policy + 重建為 auth_trust_level 版本
drop policy if exists "Admins full access" on public.vtuber_events;

create policy "Admins can mutate events"
  on public.vtuber_events
  as permissive
  for all
  to authenticated
  using (
    public.auth_trust_level(auth.uid()) = any (array['admin','moderator'])
  )
  with check (
    public.auth_trust_level(auth.uid()) = any (array['admin','moderator'])
  );
