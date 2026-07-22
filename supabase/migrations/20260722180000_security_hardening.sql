-- ═══════════════════════════════════════════════════════════════════════════
-- Security hardening — verified findings from a full RLS + stored-function +
-- edge-function audit (4 independent adversarial passes).
--
--   1. Revoke the implicit PUBLIC EXECUTE that Supabase grants by default on
--      server-only functions. These run from cron / service_role / definer
--      triggers — a client (anon or authenticated) must never call them.
--        · enqueue_email / drain_email_outbox  → else anyone could send mail
--          from our verified domain, or flush the outbox on demand.
--        · user_plan_rank                       → cross-tenant billing-tier read.
--        · try/release_email_schedule_lock      → scheduler DoS.
--   2. inventory_repairs: tighten WITH CHECK so a write cannot be injected onto
--      another owner's inventory item (the old OR-branch let user_id=self pass).
--   3. org helper functions: return nothing unless asked about the caller, so a
--      user cannot enumerate another user's organization relationships.
--
-- Every statement is idempotent and safe to re-run. Revokes are guarded so a
-- not-yet-present function can never fail the deploy.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Lock server-only functions to service_role / definer callers ─────────
do $$ begin
  execute 'revoke all on function public.enqueue_email(text, text, text, jsonb, text, text, interval) from public';
exception when undefined_function then raise notice 'enqueue_email absent — skipped'; end $$;

do $$ begin
  execute 'revoke all on function public.drain_email_outbox(int) from public';
exception when undefined_function then raise notice 'drain_email_outbox absent — skipped'; end $$;

do $$ begin
  execute 'revoke all on function public.user_plan_rank(uuid) from public';
exception when undefined_function then raise notice 'user_plan_rank absent — skipped'; end $$;

do $$ begin
  execute 'revoke all on function public.try_email_schedule_lock() from public';
exception when undefined_function then raise notice 'try_email_schedule_lock absent — skipped'; end $$;

do $$ begin
  execute 'revoke all on function public.release_email_schedule_lock() from public';
exception when undefined_function then raise notice 'release_email_schedule_lock absent — skipped'; end $$;

-- ── 2. inventory_repairs: the write target must be an item the caller owns ───
drop policy if exists "own_inventory_repairs" on public.inventory_repairs;
create policy "own_inventory_repairs" on public.inventory_repairs for all
  using (
    inventory_repairs.user_id::text = auth.uid()::text
    or exists (
      select 1 from public.inventory_items i
      join public.user_properties p on p.id::text = i.property_id::text
      where i.id::text = inventory_repairs.item_id::text and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.inventory_items i
      join public.user_properties p on p.id::text = i.property_id::text
      where i.id::text = inventory_repairs.item_id::text and p.user_id = auth.uid()
    )
    or (inventory_repairs.item_id is null and inventory_repairs.user_id::text = auth.uid()::text)
  );

-- ── 3. org helpers only answer about the calling user ───────────────────────
-- The data-plane RLS policies always invoke these with a hardcoded auth.uid(),
-- so guarding on p_uid = auth.uid() is transparent to every legitimate call and
-- makes org_owner_ids('<someone-else>') return the empty set.
create or replace function public.org_owner_ids(p_uid uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p_uid where p_uid = auth.uid()
  union
  select o.owner_user_id
    from organization_members m
    join organizations o on o.id = m.org_id
   where m.user_id = p_uid and m.status = 'active' and p_uid = auth.uid()
$$;

create or replace function public.org_editor_owner_ids(p_uid uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select o.owner_user_id
    from organization_members m
    join organizations o on o.id = m.org_id
   where m.user_id = p_uid and m.status = 'active' and m.can_edit = true and p_uid = auth.uid()
$$;
