-- =====================================================================
-- Migration 7/7: function privilege hardening
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Lock everything down to
-- signed-in users, then remove internal helpers from the public API surface entirely.
-- =====================================================================
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Internal helpers: only callable from other SECURITY DEFINER functions / triggers.
revoke execute on function
  public.notify(uuid, text, text, text, text, uuid),
  public.notify_task_assignees(uuid, text, text, text, uuid),
  public.notify_task_supervisors(uuid, text, text, text),
  public.task_supervisors(uuid),
  public.log_task_activity(uuid, text, text, text, text, text),
  public.assert_can_manage_task(uuid),
  public.assert_assignees_allowed(uuid[]),
  public.spawn_next_recurrence(uuid),
  public.seed_demo_data(),
  public.clear_demo_data(),
  public.promote_to_admin(text)
from authenticated;

grant execute on function public.seed_demo_data(), public.clear_demo_data() to service_role;

-- Future functions created by migrations are not executable by anonymous visitors.
alter default privileges in schema public revoke execute on functions from public, anon;
