-- SmartNote atomic per-user notebook persistence.
-- The Edge Function is the only caller; service_role is required.
create or replace function public.replace_smartnote_database(p_user_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid_database_payload';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and status = 'active') then
    raise exception 'inactive_user';
  end if;

  -- Delete children first; this function runs as one transaction.
  delete from public.notes where user_id = p_user_id;
  delete from public.units where user_id = p_user_id;
  delete from public.projects where user_id = p_user_id;
  delete from public.workspaces where user_id = p_user_id;
  delete from public.clients where user_id = p_user_id;
  delete from public.tasks where user_id = p_user_id;
  delete from public.task_notification_dismissals where user_id = p_user_id;

  insert into public.workspaces(id,user_id,data)
  select x->>'id',p_user_id,x from jsonb_array_elements(coalesce(p_data->'workspaces',p_data->'spaces','[]'::jsonb)) x
  where coalesce(x->>'id','') <> '';

  insert into public.projects(id,user_id,workspace_id,data)
  select x->>'id',p_user_id,nullif(x->>'workspaceId',''),x
  from jsonb_array_elements(coalesce(p_data->'projects','[]'::jsonb)) x
  where coalesce(x->>'id','') <> '';

  insert into public.units(id,user_id,project_id,data)
  select x->>'id',p_user_id,nullif(x->>'projectId',''),x
  from jsonb_array_elements(coalesce(p_data->'units','[]'::jsonb)) x
  where coalesce(x->>'id','') <> '';

  insert into public.clients(id,user_id,data)
  select x->>'id',p_user_id,x from jsonb_array_elements(coalesce(p_data->'clients','[]'::jsonb)) x
  where coalesce(x->>'id','') <> '';

  insert into public.notes(id,user_id,workspace_id,project_id,unit_id,client_id,data)
  select x->>'id',p_user_id,nullif(x->>'workspaceId',''),nullif(x->>'projectId',''),
         nullif(x->>'unitId',''),nullif(x->>'clientId',''),x
  from jsonb_array_elements(coalesce(p_data->'notes','[]'::jsonb)) x
  where coalesce(x->>'id','') <> '';

  insert into public.tasks(id,user_id,data)
  select x->>'id',p_user_id,x from jsonb_array_elements(coalesce(p_data->'tasks','[]'::jsonb)) x
  where coalesce(x->>'id','') <> '';

  insert into public.task_notification_dismissals(user_id,notification_key)
  select p_user_id, value
  from jsonb_array_elements_text(coalesce(p_data->'taskNotificationDismissals','[]'::jsonb)) value
  where value <> '';
end;
$$;

revoke all on function public.replace_smartnote_database(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.replace_smartnote_database(uuid,jsonb) to service_role;
