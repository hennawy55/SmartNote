-- SmartNote Supabase schema draft
-- Reviewed against upgrade version/app.js and Code.gs.
-- This migration is intentionally additive and does not import or delete legacy data.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'user' check (role in ('admin','leader','user')),
  status text not null default 'active' check (status in ('active','disabled')),
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_user_role() = 'admin', false) $$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and status = 'active') $$;

-- The six notebook collections remain separate tables. The JSONB payload preserves
-- all current form fields while indexed relationship columns support safe joins.
create table if not exists public.workspaces (
  id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.projects (
  id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id text,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, workspace_id) references public.workspaces(user_id, id)
);
create table if not exists public.units (
  id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id text,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, project_id) references public.projects(user_id, id)
);
create table if not exists public.clients (
  id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.notes (
  id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id text,
  project_id text,
  unit_id text,
  client_id text,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, workspace_id) references public.workspaces(user_id, id),
  foreign key (user_id, project_id) references public.projects(user_id, id),
  foreign key (user_id, unit_id) references public.units(user_id, id),
  foreign key (user_id, client_id) references public.clients(user_id, id)
);
create table if not exists public.tasks (
  id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.task_notification_dismissals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_key text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, notification_key)
);

-- Directed follow-ups. Owner fields are immutable ownership history:
-- reassignment changes assignee_id, never owner_leader_id.
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'new' check (status in ('new','viewed','in_progress','paused','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  created_by_name text not null,
  owner_leader_id uuid not null references public.profiles(id),
  owner_leader_name text not null,
  assignee_id uuid not null references public.profiles(id),
  assignee_name text not null,
  archived_at timestamptz,
  viewed_at timestamptz,
  assignment_type text not null default 'task' check (assignment_type in ('task','client')),
  client_name text not null default '',
  client_phone text not null default ''
);
create index if not exists assignments_owner_updated_idx on public.assignments(owner_leader_id, updated_at desc);
create index if not exists assignments_assignee_status_idx on public.assignments(assignee_id, status, assigned_at desc);
create index if not exists assignments_active_due_idx on public.assignments(due_at) where archived_at is null;

create table if not exists public.assignment_activity (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  actor_name text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists assignment_activity_timeline_idx on public.assignment_activity(assignment_id, created_at desc);

create table if not exists public.reassignment_requests (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id),
  from_user_name text not null,
  to_user_id uuid not null references public.profiles(id),
  to_user_name text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','stale')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_id uuid references public.profiles(id),
  reviewed_by_name text
);
create index if not exists reassignment_pending_idx on public.reassignment_requests(assignment_id, status);

create table if not exists public.assignment_notes (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  author_name text not null,
  visibility text not null default 'private' check (visibility in ('private','shared')),
  body text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assignment_notes_timeline_idx on public.assignment_notes(assignment_id, created_at);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid references public.assignments(id),
  type text not null,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_timeline_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id) where is_read = false;

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  actor_name text not null default '',
  action text not null,
  target_id text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  outcome text not null default 'success'
);

-- Enable RLS on every exposed table.
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.projects enable row level security;
alter table public.units enable row level security;
alter table public.notes enable row level security;
alter table public.clients enable row level security;
alter table public.tasks enable row level security;
alter table public.task_notification_dismissals enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_activity enable row level security;
alter table public.reassignment_requests enable row level security;
alter table public.assignment_notes enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- Profile role/status fields are not self-editable; account provisioning is server-side.
create policy profiles_read_self_admin_or_leader on public.profiles for select
  using (id = auth.uid() or public.is_admin() or (public.current_user_role() = 'leader' and status = 'active'));

-- Personal notebook data: only its owning account (and active sessions) can access it.
do $$
declare t text;
begin
  foreach t in array array['workspaces','projects','units','notes','clients','tasks','task_notification_dismissals']
  loop
    execute format('create policy %I on public.%I for all using (user_id = auth.uid() and public.is_active_user()) with check (user_id = auth.uid() and public.is_active_user())', t || '_owner_all', t);
  end loop;
end $$;

-- Assignment visibility: administrator, original distributing leader, or current assignee.
create policy assignments_read_participants on public.assignments for select
  using (public.is_active_user() and (public.is_admin() or owner_leader_id = auth.uid() or assignee_id = auth.uid()));

create policy assignment_activity_read_participants on public.assignment_activity for select
  using (exists (select 1 from public.assignments a where a.id = assignment_id and (public.is_admin() or a.owner_leader_id = auth.uid() or a.assignee_id = auth.uid())));

create policy reassignment_requests_read_participants on public.reassignment_requests for select
  using (from_user_id = auth.uid() or public.is_admin() or exists (select 1 from public.assignments a where a.id = assignment_id and a.owner_leader_id = auth.uid()));

create policy assignment_notes_read_visibility on public.assignment_notes for select
  using (
    author_id = auth.uid()
    or (visibility = 'shared' and exists (select 1 from public.assignments a where a.id = assignment_id and (public.is_admin() or a.owner_leader_id = auth.uid() or a.assignee_id = auth.uid())))
  );

create policy notifications_read_own on public.notifications for select using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy audit_log_admin_read on public.audit_log for select using (public.is_admin());

-- Privileged writes for assignments, history, transfer requests and assignment notes will be exposed
-- through SECURITY DEFINER RPCs with explicit role/ownership checks in the next migration.
-- Do not expose anonymous access. The application will use authenticated sessions only.
revoke all on all tables in schema public from anon;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.workspaces, public.projects, public.units, public.notes, public.clients, public.tasks, public.task_notification_dismissals to authenticated;
grant select on public.assignments to authenticated;
grant select on public.assignment_activity to authenticated;
grant select on public.reassignment_requests to authenticated;
grant select on public.assignment_notes to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.audit_log to authenticated;

-- Restrict helper functions to signed-in users.
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_active_user() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
