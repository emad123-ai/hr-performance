-- =====================================================================
-- Migration 5/6: private file storage, realtime, scheduled jobs
-- =====================================================================

-- ---------- Private bucket for task attachments (10 MB per file) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments', 'task-attachments', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object path convention: <task_id>/<random>-<file name>
create policy "task files: read if task visible" on storage.objects for select to authenticated
  using (bucket_id = 'task-attachments' and public.can_view_task(public.try_uuid((storage.foldername(name))[1])));
create policy "task files: upload if task visible" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-attachments' and public.can_view_task(public.try_uuid((storage.foldername(name))[1])));
create policy "task files: delete own or as manager" on storage.objects for delete to authenticated
  using (bucket_id = 'task-attachments' and (owner = auth.uid()
         or public.can_manage_task(public.try_uuid((storage.foldername(name))[1]))));

-- ---------- Realtime: live notification bell ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------- Scheduled jobs (pg_cron is available on the Supabase Free plan) ----------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('hrp-deadline-checks', '15 * * * *', 'select public.run_deadline_checks()');
    perform cron.schedule('hrp-workload-snapshot', '30 23 * * *', 'select public.record_workload_snapshot()');
    perform cron.schedule('hrp-monthly-metrics', '0 2 1 * *',
      $job$select public.refresh_performance_metrics('monthly',
             (date_trunc('month', public.app_today()) - interval '1 month')::date,
             (date_trunc('month', public.app_today()) - interval '1 day')::date)$job$);
  else
    raise notice 'pg_cron not available – enable it in Database > Extensions, or rely on the app/Vercel daily cron.';
  end if;
end $$;
