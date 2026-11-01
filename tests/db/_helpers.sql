\o /dev/null
-- Shared helpers for the database test-suite (loaded by every test file).
drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.uid(p_email text) returns uuid language sql stable as $$
  select id from public.profiles where email = p_email
$$;

-- Impersonate a signed-in user exactly like Supabase/PostgREST does.
create function tests.login(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.uid(p_email), 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FAIL: %', p_msg;
  end if;
  raise notice 'PASS: %', p_msg;
end $$;

create function tests.eq(p_actual anyelement, p_expected anyelement, p_msg text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % (expected %, got %)', p_msg, p_expected, p_actual;
  end if;
  raise notice 'PASS: %', p_msg;
end $$;

-- Expect the statement to raise an error (optionally matching a fragment of the message).
create function tests.throws(p_sql text, p_msg text, p_fragment text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_fragment is not null and position(lower(p_fragment) in lower(sqlerrm)) = 0 then
      raise exception 'FAIL: % (raised "%" but expected "%")', p_msg, sqlerrm, p_fragment;
    end if;
    raise notice 'PASS: %', p_msg;
    return;
  end;
  raise exception 'FAIL: % (statement succeeded but should have failed)', p_msg;
end $$;

-- Number of rows affected by a DML statement (RLS silently filters rows).
create function tests.affected(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on all functions in schema tests to authenticated, anon;
