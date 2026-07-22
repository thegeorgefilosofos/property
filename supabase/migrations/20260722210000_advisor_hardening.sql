-- ═══════════════════════════════════════════════════════════════════════════
-- Advisor hardening — closes the verified Security + Performance Advisor
-- findings (Supabase Dashboard → Advisors) in one idempotent migration.
--
--   1. function_search_path_mutable  → pin search_path on the flagged functions
--   2. security_definer_view         → active_loan_programs runs as the invoker
--   3. anon/authenticated_*_executable → drop EXECUTE on backend-only functions
--   4. unindexed_foreign_keys        → add a covering index for every FK missing
--                                       one (done generically from the catalog)
--
-- Everything here is bookkeeping/hardening: it never changes a row of data and
-- is safe to re-run. Client-facing, token-gated RPCs (portal / check-in /
-- accountant / verify / referral / org) are deliberately LEFT executable — they
-- authenticate the caller inside the function body, so they must stay reachable
-- by anon/authenticated. Only genuinely server-/trigger-only functions are
-- locked down below.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Pin search_path on the functions the Security Advisor flagged ─────────
-- A mutable search_path lets a caller shadow an unqualified object; pinning it
-- removes that vector. Every function below references only `public` (+ builtin
-- pg_catalog), so pinning to `public` cannot break resolution. Done through a
-- guarded loop so a not-yet-created / renamed function is skipped, not an error,
-- and every overload of a name is covered.
do $$
declare
  r record;
begin
  for r in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'try_email_schedule_lock', 'release_email_schedule_lock',
         'can_send_marketing', 'update_updated_at_column', 'lock_billing_plan',
         'feedback_campaign', 'count_real_words', 'plan_max_properties'
       )
       -- only touch functions that don't already pin it
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
          where c like 'search_path=%'
       )
  loop
    execute format('alter function public.%I(%s) set search_path = public',
                   r.proname, r.args);
  end loop;
end $$;

-- ── 2. active_loan_programs: run with the querying user's rights (not owner) ──
-- A plain view executes as its owner, which the linter flags as a SECURITY
-- DEFINER view (it can bypass the caller's RLS). The underlying loan_programs
-- table has RLS with a public `select using (true)` policy and is granted to
-- anon+authenticated, so switching the view to security_invoker keeps reads
-- working while removing the privilege-escalation surface.
do $$
begin
  if exists (
    select 1 from pg_views where schemaname = 'public' and viewname = 'active_loan_programs'
  ) then
    execute 'alter view public.active_loan_programs set (security_invoker = true)';
  end if;
end $$;

-- ── 3. Revoke EXECUTE from anon/authenticated on backend-only functions ──────
-- These are called by edge functions (service role), by pg_cron, or fire as
-- triggers — never directly by a browser client. Triggers do not need an
-- EXECUTE grant to fire, so revoking is safe. Guarded per-signature so a
-- missing function is skipped. This closes the
-- anon/authenticated_security_definer_function_executable findings without
-- touching the intentionally anon-reachable token RPCs.
do $$
declare
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'enqueue_email', 'drain_email_outbox',
         'try_email_schedule_lock', 'release_email_schedule_lock',
         'can_send_marketing', 'user_plan_rank',
         'lock_billing_plan', 'plan_max_properties'
       )
  loop
    execute format('revoke execute on function public.%I(%s) from anon, authenticated',
                   r.proname, r.args);
  end loop;
end $$;

-- ── 4. Covering index for every foreign key that lacks one ───────────────────
-- The Performance Advisor flags foreign keys with no supporting index: joins
-- and, crucially, ON DELETE/UPDATE cascade checks then seq-scan the child table.
-- Instead of hand-listing columns (brittle as the schema grows), we derive the
-- gap from the catalog: for each FK whose leading index columns don't already
-- match the FK columns, create a btree index on exactly those columns. Names
-- are deterministic, so `if not exists` makes the whole block idempotent.
do $$
declare
  fk        record;
  cols      text;   -- quoted, ordered column list for the CREATE INDEX
  name_part text;   -- underscore-joined column names for the index name
  n         int;    -- number of columns in the FK
  idx_name  text;
  has_index boolean;
begin
  for fk in
    select con.conrelid                                        as rel,
           con.conkey                                          as attnums,
           (select relname from pg_class where oid = con.conrelid) as tbl
      from pg_constraint con
      join pg_namespace n on n.oid = con.connamespace
     where con.contype = 'f'
       and n.nspname = 'public'
  loop
    n := array_length(fk.attnums, 1);

    -- ordered column projections (quoted for SQL, raw for the index name)
    select string_agg(quote_ident(a.attname), ', ' order by k.ord),
           string_agg(a.attname,              '_'  order by k.ord)
      into cols, name_part
      from unnest(fk.attnums) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = fk.rel and a.attnum = k.attnum;

    -- Covered already? An index covers the FK if its first n key columns equal
    -- the FK columns in order. Compare via int[] (bound-normalised) to avoid the
    -- int2vector 0-based vs conkey 1-based array-bounds pitfall.
    select exists (
      select 1
        from pg_index i
       where i.indrelid = fk.rel
         and (
           select array_agg(c order by ord)
             from unnest(string_to_array(i.indkey::text, ' ')::int[])
                    with ordinality as t(c, ord)
            where ord <= n
         ) = fk.attnums::int[]
    ) into has_index;

    if not has_index then
      idx_name := left('idx_' || fk.tbl || '_' || name_part, 63);
      execute format('create index if not exists %I on public.%I (%s)',
                     idx_name, fk.tbl, cols);
    end if;
  end loop;
end $$;
