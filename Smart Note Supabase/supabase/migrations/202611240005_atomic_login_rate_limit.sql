-- Atomic failed-login counter. Serializes concurrent failures per username.
create or replace function public.record_smartnote_login_failure(p_username_key text)
returns table(failed_attempts integer, locked_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.auth_login_attempts as current_attempt
    (username_key, failed_attempts, window_started_at, locked_until)
  values
    (lower(trim(p_username_key)), 1, now(), null)
  on conflict (username_key) do update
    set failed_attempts = case
          when current_attempt.window_started_at < now() - interval '15 minutes' then 1
          else current_attempt.failed_attempts + 1
        end,
        window_started_at = case
          when current_attempt.window_started_at < now() - interval '15 minutes' then now()
          else current_attempt.window_started_at
        end,
        locked_until = case
          when (case
            when current_attempt.window_started_at < now() - interval '15 minutes' then 1
            else current_attempt.failed_attempts + 1
          end) >= 5 then now() + interval '15 minutes'
          else null
        end
  returning current_attempt.failed_attempts, current_attempt.locked_until;
end;
$$;

revoke all on function public.record_smartnote_login_failure(text) from public, anon, authenticated;
grant execute on function public.record_smartnote_login_failure(text) to service_role;
