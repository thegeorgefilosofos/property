-- ─────────────────────────────────────────────────────────────────────────
-- Δικαιώματα μελών οργανισμού: έγκριση επεξεργασίας από τον owner + αιτήματα.
--
--   • Το μέλος ζητά δικαιώματα επεξεργασίας (request_member_edit) ή αναβάθμιση
--     συνδρομής (request_org_upgrade, ήδη υπάρχει). Ο owner ενημερώνεται.
--   • Ο owner εγκρίνει/ανακαλεί την επεξεργασία (set_member_edit). Μόνο τότε το
--     μέλος αποκτά δικαίωμα ΕΠΕΞΕΡΓΑΣΙΑΣ (update/delete) στο χαρτοφυλάκιο.
--
-- Ασφάλεια: οι write policies είναι ΠΡΟΣΘΕΤΙΚΕΣ (μόνο UPDATE/DELETE, μόνο για
-- μέλη με can_edit=true) και δεν αγγίζουν το INSERT (τα νέα στοιχεία τα
-- δημιουργεί ο owner σε αυτή την έκδοση). Ποτέ δεν αφαιρείται υπάρχουσα πρόσβαση.
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.organization_members
  add column if not exists can_edit          boolean default false,
  add column if not exists edit_requested_at timestamptz;

-- Owners στους οποίους το τρέχον μέλος έχει δικαίωμα ΕΠΕΞΕΡΓΑΣΙΑΣ.
create or replace function public.org_editor_owner_ids(p_uid uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select o.owner_user_id
    from organization_members m join organizations o on o.id = m.org_id
   where m.user_id = p_uid and m.status = 'active' and m.can_edit = true
$$;
grant execute on function public.org_editor_owner_ids(uuid) to authenticated;

-- ── Προσθετικές write policies (UPDATE/DELETE) για εγκεκριμένα μέλη ────────
drop policy if exists "org_edit_properties" on public.user_properties;
create policy "org_edit_properties" on public.user_properties for update
  using (user_id in (select public.org_editor_owner_ids(auth.uid())))
  with check (user_id in (select public.org_editor_owner_ids(auth.uid())));
drop policy if exists "org_del_properties" on public.user_properties;
create policy "org_del_properties" on public.user_properties for delete
  using (user_id in (select public.org_editor_owner_ids(auth.uid())));

do $$
declare t text;
begin
  foreach t in array array['expenses','bills','tenants','maintenance_tasks','loans','client_stays','checklist_items','inventory_items','inventory_maintenance','property_documents','contacts','property_settings'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'org_edit_' || t, t);
      execute format('create policy %I on public.%I for update using (exists (select 1 from public.user_properties p where p.id::text = %I.property_id::text and p.user_id in (select public.org_editor_owner_ids(auth.uid())))) with check (exists (select 1 from public.user_properties p where p.id::text = %I.property_id::text and p.user_id in (select public.org_editor_owner_ids(auth.uid()))))', 'org_edit_' || t, t, t, t);
      execute format('drop policy if exists %I on public.%I', 'org_del_' || t, t);
      execute format('create policy %I on public.%I for delete using (exists (select 1 from public.user_properties p where p.id::text = %I.property_id::text and p.user_id in (select public.org_editor_owner_ids(auth.uid()))))', 'org_del_' || t, t, t);
    end if;
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['clients'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'org_edit_' || t, t);
      execute format('create policy %I on public.%I for update using (user_id in (select public.org_editor_owner_ids(auth.uid()))) with check (user_id in (select public.org_editor_owner_ids(auth.uid())))', 'org_edit_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'org_del_' || t, t);
      execute format('create policy %I on public.%I for delete using (user_id in (select public.org_editor_owner_ids(auth.uid())))', 'org_del_' || t, t);
    end if;
  end loop;
end $$;

-- ── RPCs ──────────────────────────────────────────────────────────────────
-- Μέλος: αίτημα δικαιωμάτων επεξεργασίας.
create or replace function public.request_member_edit()
returns void language plpgsql security definer set search_path = public as $$
begin
  update organization_members set edit_requested_at = now()
   where user_id = auth.uid() and status = 'active' and role <> 'owner' and coalesce(can_edit, false) = false;
end; $$;

-- Owner: έγκριση ή ανάκληση επεξεργασίας για μέλος.
create or replace function public.set_member_edit(p_email text, p_can boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organizations where owner_user_id = auth.uid();
  if v_org is null then return; end if;
  update organization_members
     set can_edit = coalesce(p_can, false), edit_requested_at = null
   where org_id = v_org and lower(email) = lower(p_email) and role <> 'owner';
end; $$;

-- Owner: εκκαθάριση της ένδειξης αιτήματος αναβάθμισης (αφού το δει).
create or replace function public.clear_org_upgrade_request()
returns void language plpgsql security definer set search_path = public as $$
begin
  update organizations set upgrade_requested_at = null where owner_user_id = auth.uid();
end; $$;

grant execute on function public.request_member_edit()        to authenticated;
grant execute on function public.set_member_edit(text, boolean) to authenticated;
grant execute on function public.clear_org_upgrade_request()   to authenticated;
