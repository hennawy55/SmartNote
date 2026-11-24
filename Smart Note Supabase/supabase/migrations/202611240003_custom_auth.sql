-- Custom username/password authentication; no email or domain required.
create table if not exists public.auth_accounts (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 username_key text not null unique,
 password_hash text not null,
 password_salt text not null,
 password_iterations integer not null default 600000 check(password_iterations >= 300000),
 failed_attempts integer not null default 0 check(failed_attempts >= 0),
 locked_until timestamptz,
 password_changed_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create table if not exists public.auth_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 token_hash text not null unique,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 last_seen_at timestamptz not null default now(),
 revoked_at timestamptz
);
create index if not exists auth_sessions_user_active_idx on public.auth_sessions(user_id,expires_at desc) where revoked_at is null;
create index if not exists auth_sessions_expiry_idx on public.auth_sessions(expires_at);
create table if not exists public.auth_login_attempts (
 username_key text primary key,
 failed_attempts integer not null default 0,
 window_started_at timestamptz not null default now(),
 locked_until timestamptz
);
-- Custom sessions do not use auth.users. Profiles become app-owned identities.
alter table public.profiles alter column id drop default;
alter table public.profiles drop constraint if exists profiles_id_fkey;
-- Credentials and all app data are inaccessible to browser roles. Edge Functions use service_role
-- and MUST validate session, status, ownership and role for every operation.
revoke all on public.auth_accounts,public.auth_sessions,public.auth_login_attempts from anon,authenticated;
revoke all on public.profiles,public.workspaces,public.projects,public.units,public.notes,public.clients,
 public.tasks,public.task_notification_dismissals,public.assignments,public.assignment_activity,
 public.reassignment_requests,public.assignment_notes,public.notifications,public.audit_log
 from anon,authenticated;
