-- ═══════════════════════════════════════════════════════════════════════════
-- Δικαιώματα μέλους ανά ακίνητο και ορατότητα οικονομικών.
--
-- Μέχρι τώρα ένα ενεργό μέλος οργανισμού έβλεπε ΟΛΑ τα ακίνητα του ιδιοκτήτη
-- (org_owner_ids) και όλα τα οικονομικά τους. Εδώ προστίθενται δύο περιορισμοί:
--
--   • property_scope       — λίστα ακινήτων· NULL ή κενό = όλα (συμβατό προς τα πίσω)
--   • can_view_financials  — αν όχι, το μέλος δεν βλέπει χρήματα (ενοίκια, δαπάνες,
--                            λογαριασμούς, δάνεια, τραπεζικές κινήσεις, κλείσιμο χρήσης)
--
-- Υλοποιούνται ως RESTRICTIVE policies: κάνουν AND με τις υπάρχουσες permissive,
-- άρα ΔΕΝ δίνουν πρόσβαση πουθενά — μόνο αφαιρούν. Καμία υπάρχουσα policy δεν
-- τροποποιείται, οπότε ο ιδιοκτήτης και οι σημερινές ροές μένουν ανέπαφες.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.organization_members
  add column if not exists property_scope uuid[],
  add column if not exists can_view_financials boolean not null default true;

comment on column public.organization_members.property_scope is
  'Ακίνητα που βλέπει το μέλος. NULL ή κενό = όλα τα ακίνητα του οργανισμού.';
comment on column public.organization_members.can_view_financials is
  'Αν false, το μέλος δεν βλέπει οικονομικά δεδομένα (ενοίκια, δαπάνες, λογαριασμούς, δάνεια).';

-- ── Βλέπει ο χρήστης το συγκεκριμένο ακίνητο; ───────────────────────────────
-- true για τον ίδιο τον ιδιοκτήτη· για μέλος, μόνο αν δεν έχει οριστεί εύρος ή
-- αν το ακίνητο ανήκει στο εύρος του. Ο έλεγχος γίνεται στο ΠΙΟ ΠΕΡΙΟΡΙΣΤΙΚΟ
-- μέλος, ώστε δεύτερη ιδιότητα να μη διευρύνει σιωπηλά την πρόσβαση.
create or replace function public.member_sees_property(p_property uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select
    -- Άγνωστο/ανύπαρκτο ακίνητο: δεν μπλοκάρουμε (η permissive policy αποφασίζει).
    coalesce((select p.user_id from user_properties p where p.id = p_property), auth.uid()) = auth.uid()
    or not exists (
      select 1
        from organization_members m
        join organizations o on o.id = m.org_id
        join user_properties p on p.id = p_property
       where m.user_id = auth.uid()
         and m.status = 'active'
         and o.owner_user_id = p.user_id
         and m.property_scope is not null
         and array_length(m.property_scope, 1) > 0
         and not (p_property = any (m.property_scope))
    )
$$;
alter function public.member_sees_property(uuid) owner to postgres;

-- ── Βλέπει ο χρήστης οικονομικά αυτού του ακινήτου; ────────────────────────
create or replace function public.member_sees_financials(p_property uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select
    coalesce((select p.user_id from user_properties p where p.id = p_property), auth.uid()) = auth.uid()
    or not exists (
      select 1
        from organization_members m
        join organizations o on o.id = m.org_id
        join user_properties p on p.id = p_property
       where m.user_id = auth.uid()
         and m.status = 'active'
         and o.owner_user_id = p.user_id
         and m.can_view_financials = false
    )
$$;
alter function public.member_sees_financials(uuid) owner to postgres;

grant execute on function public.member_sees_property(uuid) to authenticated;
grant execute on function public.member_sees_financials(uuid) to authenticated;

-- Ορισμένοι πίνακες κρατούν το property_id ως text (π.χ. checkin_links). Overload
-- με έλεγχο μορφής: ό,τι δεν είναι έγκυρο uuid δεν μπλοκάρεται εδώ, το αποφασίζουν
-- οι υπάρχουσες permissive policies.
create or replace function public.member_sees_property(p_property text)
returns boolean
language sql stable
set search_path to 'public'
as $$
  select case
    when p_property is null or p_property !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
    else public.member_sees_property(p_property::uuid)
  end
$$;

create or replace function public.member_sees_financials(p_property text)
returns boolean
language sql stable
set search_path to 'public'
as $$
  select case
    when p_property is null or p_property !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
    else public.member_sees_financials(p_property::uuid)
  end
$$;

grant execute on function public.member_sees_property(text) to authenticated;
grant execute on function public.member_sees_financials(text) to authenticated;

-- ── Εύρος ακινήτων: restrictive policy σε κάθε πίνακα με property_id ────────
do $$
declare t text;
begin
  foreach t in array array[
    'airbnb_bookings','bank_transactions','bills','bills_history','bills_settings',
    'book_closings','calendar_events','checkin_links','checklist_items','client_stays',
    'contacts','expenses','guest_checkins','ical_feeds','inventory','inventory_handovers',
    'inventory_items','inventory_maintenance','loans','maintenance_requests','maintenance_tasks',
    'portal_links','pricing_settings','property_documents','property_settings','rent_comparables',
    'rent_config','rent_payments','tenant_comm_log','tenant_damages','tenants'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'scope_property_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for all
         using (property_id is null or public.member_sees_property(property_id))
         with check (property_id is null or public.member_sees_property(property_id))',
      'scope_property_' || t, t);
  end loop;
end $$;

-- Το ίδιο το ακίνητο (κλειδί id αντί property_id).
drop policy if exists scope_property_user_properties on public.user_properties;
create policy scope_property_user_properties on public.user_properties as restrictive for all
  using (public.member_sees_property(id))
  with check (public.member_sees_property(id));

-- ── Ορατότητα οικονομικών: μόνο στους πίνακες που περιέχουν χρήματα ─────────
do $$
declare t text;
begin
  foreach t in array array[
    'expenses','rent_payments','bills','bills_history','loans','bank_transactions','book_closings'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'scope_fin_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for all
         using (property_id is null or public.member_sees_financials(property_id))
         with check (property_id is null or public.member_sees_financials(property_id))',
      'scope_fin_' || t, t);
  end loop;
end $$;
