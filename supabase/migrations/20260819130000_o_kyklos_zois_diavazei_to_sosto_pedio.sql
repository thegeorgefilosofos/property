-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΜΗΧΑΝΗ ΚΥΚΛΟΥ ΖΩΗΣ ΣΥΓΚΡΙΝΕ ΔΥΟ ΛΕΞΙΛΟΓΙΑ ΜΕ ΕΝΑ ΟΝΟΜΑ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ. Το κοινό των μηνυμάτων χτιζόταν με
--
--     case when bp.plan in ('individual','professional') then bp.plan else 'free' end
--
-- Ομως το `billing_profiles.plan` παίρνει free/solo/owner/agency/office
-- (lib/billing/plans.ts). Τα 'individual' και 'professional' είναι τιμές του
-- `profile_type` (lib/billing/entitlements.ts: ProfileType). Δηλαδή η συνθήκη
-- δεν ήταν ΠΟΤΕ αληθής και κάθε λογαριασμός έπεφτε στο 'free'.
--
-- ΤΙ ΚΟΣΤΙΖΕ, ΣΙΩΠΗΛΑ:
--
--   • ΟΛΟΙ έπαιρναν `welcome_free`. Τα `welcome_individual` και
--     `welcome_professional` υπήρχαν γραμμένα και δεν στάλθηκαν ποτέ.
--   • Το `upsell_to_individual` («έχεις 2+ ακίνητα, αναβάθμισε») στόχευε
--     και ΣΥΝΔΡΟΜΗΤΕΣ, γιατί ο συνδρομητής φαινόταν κι αυτός 'free'. Το να
--     ζητάς από πληρωμένο πελάτη να αρχίσει να πληρώνει είναι το χειρότερο
--     μήνυμα που μπορεί να στείλει ένα SaaS.
--
-- Η ΔΙΟΡΘΩΣΗ ΧΩΡΙΖΕΙ ΤΑ ΔΥΟ. Το `profile` κρατά τον τύπο προφίλ και χτίζει το
-- `welcome_*` — τα πρότυπα ήταν ΠΑΝΤΑ αυτού του λεξιλογίου, όπως λένε τα
-- ονόματά τους. Το `plan` κρατά το πακέτο χρέωσης και φυλάει την προτροπή
-- αναβάθμισης, που αφορά χρέωση. Ενα όνομα ανά έννοια.
--
-- ΤΙ ΔΕΝ ΑΛΛΑΖΕΙ ΕΔΩ. Το `trial_ending` παραμένει εκτός: η δοκιμή είναι
-- ξεχωριστό ρολόι και μπαίνει με δική της μετανάστευση, όχι κρυμμένη μέσα σε
-- διόρθωση λεξιλογίου.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.lifecycle_enqueue()
returns integer
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_before bigint;
  v_after  bigint;
  v_year   text := to_char(now(), 'YYYY');
  v_month  int  := extract(month from now())::int;
  v_day    int  := extract(day   from now())::int;
begin
  select count(*) into v_before from public.email_outbox;

  -- Base audience: confirmed, non-deleted users with their plan + tenure.
  drop table if exists _aud;
  create temporary table _aud on commit drop as
  select u.id::uuid                                   as uid,
         lower(trim(u.email))                         as email,
         coalesce(nullif(trim(bp.owner_name), ''),
                  nullif(trim(bp.full_name), ''))     as name,
         -- ΤΟ ΠΕΔΙΟ ΕΙΝΑΙ Ο ΤΥΠΟΣ ΠΡΟΦΙΛ, ΟΧΙ ΤΟ ΠΑΚΕΤΟ ΧΡΕΩΣΗΣ.
         -- Διαβαζόταν το `bp.plan`, που παίρνει free/solo/owner/agency/office,
         -- και συγκρινόταν με 'individual'/'professional' — τιμές του
         -- `profile_type`. Η σύγκριση δεν πετύχαινε ΠΟΤΕ, οπότε κάθε χρήστης
         -- έπεφτε στο 'free': όλοι έπαιρναν welcome_free και το
         -- `upsell_to_individual` στόχευε και συνδρομητές. Δύο λεξιλόγια με
         -- ένα όνομα· τα πρότυπα (welcome_individual / welcome_professional)
         -- ήταν ΠΑΝΤΑ του τύπου προφίλ, όπως δείχνουν τα ονόματά τους.
         case coalesce(bp.profile_type, 'individual')
           when 'professional' then 'professional'
           else 'individual'
         end                                          as profile,
         -- Και το πακέτο χωριστά, με το ΔΙΚΟ του λεξιλόγιο. Χρησιμοποιείται
         -- ΜΟΝΟ ως φίλτρο στην προτροπή αναβάθμισης, που αφορά χρέωση. ΔΕΝ
         -- μπαίνει ποτέ στα `params`: εκεί το `plan` το διαβάζει το
         -- `PLAN_LABEL` (emailTemplates.ts:35), που έχει κλειδιά
         -- free|individual|professional — πάλι λεξιλόγιο προφίλ. Ενα
         -- 'solo' εκεί θα τύπωνε «undefined» μέσα σε επιστολή.
         coalesce(bp.plan, 'free')                     as plan,
         u.created_at                                 as signup,
         (current_date - u.created_at::date)          as age_days
    from auth.users u
    left join public.billing_profiles bp on bp.user_id = u.id
   where u.email is not null and trim(u.email) <> ''
     and u.email_confirmed_at is not null
     and u.deleted_at is null;

  -- ── 1) Onboarding drip ────────────────────────────────────────────────────
  -- welcome_{plan} once, in the first days after signup.
  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'welcome_'||a.profile, a.email, a.name,
         jsonb_build_object('plan', a.profile, 'name', a.name),
         'marketing', 'welcome:'||a.uid, now()
    from _aud a
   where a.age_days between 0 and 2
  on conflict (dedup_key) do nothing;

  -- Add your first property (days 2-6, if not done yet).
  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'add_first_property', a.email, a.name,
         jsonb_build_object('name', a.name, 'plan', a.profile),
         'marketing', 'add_first_property:'||a.uid, now()
    from _aud a
    left join public.onboarding_progress op on op.user_id = a.uid
   where a.age_days between 2 and 6
     and coalesce(op.first_property, false) = false
  on conflict (dedup_key) do nothing;

  -- Celebrate the first property (within 2 days of creating it).
  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'first_property_success', a.email, a.name,
         jsonb_build_object('name', a.name, 'propertyName', p.name),
         'marketing', 'first_property_success:'||a.uid, now()
    from _aud a
    join lateral (
      select name, created_at
        from public.user_properties
       where user_id = a.uid
       order by created_at asc
       limit 1
    ) p on true
   where p.created_at >= now() - interval '2 days'
  on conflict (dedup_key) do nothing;

  -- ── 2) Obligations / expiry (operational — must be seen) ──────────────────
  -- Lease ending within 30 days.
  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'lease_ending', a.email, a.name,
         jsonb_build_object('tenantName', t.full_name, 'propertyName', pr.name,
                            'leaseEndDate', to_char(t.lease_end, 'DD/MM/YYYY')),
         'operational', 'lease_ending:'||t.id||':'||to_char(t.lease_end,'YYYYMMDD'), now()
    from public.tenants t
    join _aud a on a.uid = t.user_id
    left join public.user_properties pr on pr.id = t.property_id
   where t.lease_end is not null
     and t.lease_end between current_date and current_date + 30
     and coalesce(t.status, 'active') not in ('ended', 'moved_out')
  on conflict (dedup_key) do nothing;

  -- Insurance policy expiring within 30 days.
  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'insurance_expiring', a.email, a.name,
         jsonb_build_object('propertyName', p.name, 'insurerName', p.insurance_company,
                            'policyEndDate', to_char(p.insurance_expiry, 'DD/MM/YYYY')),
         'operational', 'insurance_expiring:'||p.id||':'||to_char(p.insurance_expiry,'YYYYMMDD'), now()
    from public.user_properties p
    join _aud a on a.uid = p.user_id
   where p.insurance_expiry between current_date and current_date + 30
  on conflict (dedup_key) do nothing;

  -- ── 3) Seasonality (marketing, gated per month, one per user per season) ──
  -- Black Friday (20-30 Nov).
  if v_month = 11 and v_day between 20 and 30 then
    insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
    select 'black_friday', a.email, a.name, jsonb_build_object('name', a.name, 'plan', a.profile),
           'marketing', 'black_friday:'||a.uid||':'||v_year, now()
      from _aud a
    on conflict (dedup_key) do nothing;
  end if;

  -- Christmas (15-26 Dec).
  if v_month = 12 and v_day between 15 and 26 then
    insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
    select 'christmas', a.email, a.name, jsonb_build_object('name', a.name),
           'marketing', 'christmas:'||a.uid||':'||v_year, now()
      from _aud a
    on conflict (dedup_key) do nothing;
  end if;

  -- Tax season nudge (March–May: income-tax + ENFIA planning).
  if v_month between 3 and 5 and v_day between 1 and 10 then
    insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
    select 'tax_season', a.email, a.name, jsonb_build_object('name', a.name, 'plan', a.profile),
           'marketing', 'tax_season:'||a.uid||':'||v_year, now()
      from _aud a
    on conflict (dedup_key) do nothing;
  end if;

  -- Summer short-term-rental prep (May).
  if v_month = 5 and v_day between 1 and 10 then
    insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
    select 'summer_str', a.email, a.name, jsonb_build_object('name', a.name),
           'marketing', 'summer_str:'||a.uid||':'||v_year, now()
      from _aud a
    on conflict (dedup_key) do nothing;
  end if;

  -- September student-demand: nudge owners of a VACANT property to list/adjust.
  if v_month = 9 and v_day between 1 and 15 then
    insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
    select 'rent_benchmark_alert', a.email, a.name,
           jsonb_build_object('name', a.name, 'propertyName', p.name, 'marketRent', p.target_rent),
           'marketing', 'sept_vacant:'||p.id||':'||v_year, now()
      from public.user_properties p
      join _aud a on a.uid = p.user_id
     where p.status_detail = 'vacant'
    on conflict (dedup_key) do nothing;
  end if;

  -- ── 4) Tenure / growth (marketing) ────────────────────────────────────────
  -- Anniversary (each completed year, within 2 days of the date).
  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'anniversary', a.email, a.name,
         jsonb_build_object('name', a.name, 'anniversaryYears', (a.age_days / 365)),
         'marketing', 'anniversary:'||a.uid||':'||(a.age_days / 365)::text, now()
    from _aud a
   where a.age_days >= 365
     and (a.age_days % 365) < 2
  on conflict (dedup_key) do nothing;

  -- Referral reminder: has a code, no successful referral yet, settled in (>30d).
  -- Once per quarter.
  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'referral_reminder', a.email, a.name,
         jsonb_build_object('name', a.name, 'referralCode', rc.code, 'plan', a.profile),
         'marketing', 'referral_reminder:'||a.uid||':'||to_char(now(),'YYYY-Q'), now()
    from _aud a
    join public.referral_codes rc on rc.user_id = a.uid
   where a.age_days > 30
     and not exists (
       select 1 from public.referrals r
        where r.referrer_user_id = a.uid and r.activated_at is not null
     )
  on conflict (dedup_key) do nothing;

  -- Upgrade nudge: free plan carrying real load (2+ properties). Once per quarter.
  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'upsell_to_individual', a.email, a.name,
         jsonb_build_object('name', a.name, 'properties', pc.n, 'toPlan', 'individual'),
         'marketing', 'upsell_individual:'||a.uid||':'||to_char(now(),'YYYY-Q'), now()
    from _aud a
    join lateral (
      select count(*)::int as n from public.user_properties where user_id = a.uid
    ) pc on true
   where a.plan = 'free' and a.profile <> 'professional' and pc.n >= 2
  on conflict (dedup_key) do nothing;

  select count(*) into v_after from public.email_outbox;
  return (v_after - v_before)::int;
end;
$$;
