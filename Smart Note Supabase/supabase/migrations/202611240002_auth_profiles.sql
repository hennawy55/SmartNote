-- SmartNote authentication foundation
-- Creates a profile for each Supabase Auth user. Role is always forced to "user"
-- at signup; privileged roles must only be assigned by a trusted server function.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, ''), '@', 1))));
  if requested_username !~ '^[a-zA-Z0-9_.-]{3,40}$' then
    raise exception 'invalid_username';
  end if;

  insert into public.profiles (id, username, role, status, must_change_password)
  values (new.id, requested_username, 'user', 'active',
          false);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_smartnote on auth.users;
create trigger on_auth_user_created_smartnote
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Maintain updated_at consistently.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','workspaces','projects','units','clients','notes','tasks',
    'assignments','assignment_notes'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

-- Prevent clients from inserting or changing profile roles/status directly.
-- Profile creation is performed only by the auth.users trigger.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
