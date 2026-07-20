-- ─────────────────────────────────────────────────────────────────────────
-- Οργανισμός & Ομάδα (Επαγγελματίας) — προσωπικά vs οργανισμός, μέλη & ρόλοι.
--
-- Σχεδίαση v1, ασφαλής και ειλικρινής:
--   • Κάθε επαγγελματίας έχει ΕΝΑΝ οργανισμό (owner = ο ίδιος).
--   • Προσκαλείς μέλη με email + ρόλο. Το μέλος «μπαίνει» αυτόματα με το που
--     συνδεθεί με το ίδιο email (accept_org_invites_for_me), χωρίς ξεχωριστή
--     σελίδα/token.
--   • Τα ενεργά μέλη αποκτούν ΠΡΟΣΒΑΣΗ ΑΝΑΓΝΩΣΗΣ στο χαρτοφυλάκιο του owner.
--     Η εγγραφή/επεξεργασία παραμένει στον owner (read-only για μέλη σε αυτή
--     την έκδοση, δηλωμένο καθαρά στο UI).
--
-- Η επέκταση RLS είναι ΠΡΟΣΘΕΤΙΚΗ (μόνο SELECT policies που ΠΡΟΣΘΕΤΟΥΝ πρόσβαση):
-- ποτέ δεν αφαιρεί υπάρχουσα πρόσβαση, οπότε οι μονοχρήστες δεν επηρεάζονται.
-- Ασφαλές να τρέξει πολλές φορές (idempotent).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.organizations (
  id                   uuid primary key default gen_random_uuid(),
  owner_user_id        uuid not null references auth.users(id) on delete cascade,
  name                 text not null default '',
  upgrade_requested_at timestamptz,
  created_at           timestamptz default now()
);
create unique index if not exists organizations_owner_uidx on public.organizations(owner_user_id);
alter table public.organizations enable row level security;

create table if not exists public.organization_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,  -- null μέχρι την αποδοχή
  email      text not null,
  role       text not null default 'member',   -- owner | admin | member
  status     text not null default 'invited',  -- invited | active | revoked
  invited_at timestamptz default now(),
  joined_at  timestamptz,
  unique (org_id, email)
);
create index if not exists organization_members_user_idx on public.organization_members(user_id);
alter table public.organization_members enable row level security;

-- ── Βοηθός: οι «owners» των δεδομένων που βλέπει ο τρέχων χρήστης ──────────
-- Πάντα ο ίδιος + οι owners οργανισμών όπου είναι ενεργό μέλος.
create or replace function public.org_owner_ids(p_uid uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p_uid
  union
  select o.owner_user_id
    from organization_members m
    join organizations o on o.id = m.org_id
   where m.user_id = p_uid and m.status = 'active'
$$;

-- ── Βοηθοί SECURITY DEFINER: σπάνε την αμοιβαία αναδρομή των RLS policies ───
-- (αν οι πολιτικές organizations/organization_members ρωτούσαν η μία την άλλη
-- με απευθείας subquery, η Postgres θα έριχνε «infinite recursion in policy».)
create or replace function public.is_org_owner(p_org uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from organizations where id = p_org and owner_user_id = p_uid)
$$;
create or replace function public.is_active_org_member(p_org uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members where org_id = p_org and user_id = p_uid and status = 'active')
$$;
grant execute on function public.is_org_owner(uuid, uuid)        to authenticated;
grant execute on function public.is_active_org_member(uuid, uuid) to authenticated;

-- ── RLS: organizations ────────────────────────────────────────────────────
drop policy if exists "org_owner_all" on public.organizations;
create policy "org_owner_all" on public.organizations for all
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists "org_member_read" on public.organizations;
create policy "org_member_read" on public.organizations for select
  using (public.is_active_org_member(id, auth.uid()));

-- ── RLS: organization_members ─────────────────────────────────────────────
drop policy if exists "org_members_owner" on public.organization_members;
create policy "org_members_owner" on public.organization_members for all
  using (public.is_org_owner(org_id, auth.uid()))
  with check (public.is_org_owner(org_id, auth.uid()));
drop policy if exists "org_members_self_read" on public.organization_members;
create policy "org_members_self_read" on public.organization_members for select
  using (user_id = auth.uid());

-- ── Προσθετική πρόσβαση ΑΝΑΓΝΩΣΗΣ στο χαρτοφυλάκιο του owner για τα μέλη ────
-- user_properties (η λίστα).
drop policy if exists "org_read_properties" on public.user_properties;
create policy "org_read_properties" on public.user_properties for select
  using (user_id in (select public.org_owner_ids(auth.uid())));

-- Πίνακες με property_id (cast σε text για ασφάλεια, όπως αλλού στο schema).
do $$
declare t text;
begin
  foreach t in array array[
    'expenses','bills','tenants','maintenance_tasks','loans','client_stays',
    'checklist_items','inventory_items','inventory_maintenance','property_documents',
    'contacts','property_settings'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'org_read_' || t, t);
      execute format(
        'create policy %I on public.%I for select using (exists (select 1 from public.user_properties p where p.id::text = %I.property_id::text and p.user_id in (select public.org_owner_ids(auth.uid()))))',
        'org_read_' || t, t, t
      );
    end if;
  end loop;
end $$;

-- Πίνακες με user_id (π.χ. πελατολόγιο).
do $$
declare t text;
begin
  foreach t in array array['clients'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'org_read_' || t, t);
      execute format(
        'create policy %I on public.%I for select using (user_id in (select public.org_owner_ids(auth.uid())))',
        'org_read_' || t, t
      );
    end if;
  end loop;
end $$;

-- ── RPCs (SECURITY DEFINER, owner-gated) ──────────────────────────────────
create or replace function public.ensure_organization()
returns public.organizations language plpgsql security definer set search_path = public as $$
declare v_org public.organizations;
begin
  select * into v_org from organizations where owner_user_id = auth.uid();
  if v_org.id is null then
    insert into organizations(owner_user_id, name) values (auth.uid(), '') returning * into v_org;
    insert into organization_members(org_id, user_id, email, role, status, joined_at)
      values (v_org.id, auth.uid(), coalesce(auth.email(), ''), 'owner', 'active', now())
    on conflict (org_id, email) do nothing;
  end if;
  return v_org;
end; $$;

create or replace function public.rename_organization(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update organizations set name = coalesce(nullif(trim(p_name), ''), name) where owner_user_id = auth.uid();
end; $$;

create or replace function public.invite_org_member(p_email text, p_role text default 'member')
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organizations where owner_user_id = auth.uid();
  if v_org is null or p_email is null or position('@' in p_email) = 0 then return; end if;
  insert into organization_members(org_id, email, role, status)
    values (v_org, lower(trim(p_email)), case when p_role in ('admin','member') then p_role else 'member' end, 'invited')
  on conflict (org_id, email) do update set role = excluded.role, status = case when organization_members.status = 'revoked' then 'invited' else organization_members.status end;
end; $$;

create or replace function public.set_org_member_role(p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organizations where owner_user_id = auth.uid();
  if v_org is null then return; end if;
  update organization_members set role = case when p_role in ('admin','member') then p_role else role end
   where org_id = v_org and lower(email) = lower(p_email) and role <> 'owner';
end; $$;

create or replace function public.revoke_org_member(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organizations where owner_user_id = auth.uid();
  if v_org is null then return; end if;
  delete from organization_members where org_id = v_org and lower(email) = lower(p_email) and role <> 'owner';
end; $$;

-- Αυτόματη αποδοχή πρόσκλησης με το που συνδεθεί το προσκεκλημένο email.
create or replace function public.accept_org_invites_for_me()
returns void language plpgsql security definer set search_path = public as $$
begin
  update organization_members
     set user_id = auth.uid(), status = 'active', joined_at = coalesce(joined_at, now())
   where lower(email) = lower(coalesce(auth.email(), '')) and status = 'invited';
end; $$;

-- Αίτημα αναβάθμισης από μέλος προς τον owner (request-to-upgrade).
create or replace function public.request_org_upgrade()
returns void language plpgsql security definer set search_path = public as $$
begin
  update organizations set upgrade_requested_at = now()
   where id in (select org_id from organization_members where user_id = auth.uid() and status = 'active');
end; $$;

grant execute on function public.org_owner_ids(uuid)          to authenticated;
grant execute on function public.ensure_organization()         to authenticated;
grant execute on function public.rename_organization(text)     to authenticated;
grant execute on function public.invite_org_member(text, text) to authenticated;
grant execute on function public.set_org_member_role(text, text) to authenticated;
grant execute on function public.revoke_org_member(text)       to authenticated;
grant execute on function public.accept_org_invites_for_me()   to authenticated;
grant execute on function public.request_org_upgrade()         to authenticated;
