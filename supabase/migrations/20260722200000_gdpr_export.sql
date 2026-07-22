-- ═══════════════════════════════════════════════════════════════════════════
-- GDPR — right to data portability (Art. 20). A user can export ALL of their own
-- data as one JSON document. Pairs with delete_my_account (right to erasure).
--
-- Implementation: a SECURITY DEFINER function that dynamically walks every table in
-- `public` carrying a `user_id` column and returns that user's rows. Being dynamic,
-- it stays correct as tables are added — no maintenance. It is definer (to read past
-- RLS uniformly) but every query is filtered to the CALLER's own user_id, so it can
-- only ever return the caller's data. Executable by authenticated users only.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_out  jsonb := '{}'::jsonb;
  v_rows jsonb;
  r      record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and c.column_name  = 'user_id'
       and t.table_type   = 'BASE TABLE'
     order by c.table_name
  loop
    -- Cast both sides to text so it works whether user_id is uuid or legacy text.
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where t.user_id::text = $1',
      r.table_name
    )
    into v_rows
    using v_uid::text;

    if v_rows <> '[]'::jsonb then
      v_out := v_out || jsonb_build_object(r.table_name, v_rows);
    end if;
  end loop;

  return jsonb_build_object(
    'exported_at', now(),
    'user_id',     v_uid,
    'data',        v_out
  );
end;
$$;

-- Server-only default is PUBLIC; restrict to authenticated callers (each exports
-- only their own rows).
revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;
