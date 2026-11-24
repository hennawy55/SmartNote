-- Correct the transition away from Supabase Auth identities and prepare first-admin provisioning.
drop trigger if exists on_auth_user_created_smartnote on auth.users;
drop function if exists public.handle_new_auth_user();
-- Ensure usernames are canonical and cannot collide by case.
create unique index if not exists profiles_username_lower_uidx on public.profiles (lower(username));
-- Keep account lookup key aligned with the profile username.
create or replace function public.prevent_profile_auth_field_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  if lower(trim(new.username)) !~ '^[a-z0-9_.-]{3,40}$' then
    raise exception 'invalid_username';
  end if;
  new.username := lower(trim(new.username));
  return new;
end; $$;
drop trigger if exists profiles_validate_username on public.profiles;
create trigger profiles_validate_username before insert or update of username on public.profiles
for each row execute function public.prevent_profile_auth_field_mutation();
revoke all on function public.prevent_profile_auth_field_mutation() from public,anon,authenticated;
