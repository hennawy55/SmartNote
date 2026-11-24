-- Required by the smartnote-auth Edge Function, which uses the service-role key.
-- The function performs authorization checks before every assignment operation.
grant usage on schema public to service_role;
grant select, insert, update, delete on table
  public.assignments,
  public.assignment_activity,
  public.reassignment_requests,
  public.assignment_notes,
  public.notifications,
  public.audit_log
to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Prevent concurrent duplicate pending transfer requests for the same assignment.
create unique index if not exists reassignment_one_pending_per_assignment_idx
  on public.reassignment_requests(assignment_id) where status = 'pending';
