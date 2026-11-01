-- Demonstration data is clearly marked and removable
\i tests/db/_helpers.sql
begin;
select tests.ok((select bool_and(is_demo) from public.tasks), 'all seeded tasks are flagged as demo data');
select tests.ok((select bool_and(is_demo) from public.profiles), 'all seeded people are flagged as demo data');
select tests.throws($$select public.clear_demo_data()$$, 'demo data cannot be cleared before a real admin exists', 'real administrator');
insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ('real.admin@company.test', '{"role":"admin"}', '{"full_name":"Real Admin"}');
select public.clear_demo_data();
select tests.eq((select count(*) from public.tasks)::int, 0, 'demo tasks removed');
select tests.eq((select count(*) from public.profiles)::int, 1, 'demo users removed, real admin kept');
select tests.ok((select count(*) from public.categories) >= 30, 'configuration (categories) is kept');
select tests.ok((select count(*) from public.system_settings) >= 10, 'configuration (settings) is kept');
rollback;
