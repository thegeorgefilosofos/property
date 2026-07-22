


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_org_invites_for_me"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update organization_members
     set user_id = auth.uid(), status = 'active', joined_at = coalesce(joined_at, now())
   where lower(email) = lower(coalesce(auth.email(), '')) and status = 'invited';
end; $$;


ALTER FUNCTION "public"."accept_org_invites_for_me"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_send_marketing"("p_to_email" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select max(sent_at)
       from public.email_outbox
      where to_email = lower(trim(p_to_email)) and category = 'marketing' and status = 'sent')
      < now() - interval '3 days',
    true);
$$;


ALTER FUNCTION "public"."can_send_marketing"("p_to_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_referral_bonus"("p_code" "text", "p_kind" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid; v_count int; v_target int; v_months int; v_tier text; v_exists int;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return json_build_object('ok', false, 'reason', 'not_owner'); end if;

  if    p_kind = 'indiv_volume' then v_target := 5;  v_months := 1; v_tier := 'owner';
  elsif p_kind = 'pro_paid'     then v_target := 5;  v_months := 2; v_tier := 'agency';
  elsif p_kind = 'pro_free'     then v_target := 10; v_months := 1; v_tier := 'agency';
  else return json_build_object('ok', false, 'reason', 'bad_kind'); end if;

  -- Σειριοποίησε ταυτόχρονες διεκδικήσεις ανά χρήστη/είδος (anti double-claim).
  perform pg_advisory_xact_lock(hashtext('referral_bonus:' || p_kind || ':' || v_owner::text));

  select
    case p_kind
      when 'indiv_volume' then count(*) filter (where coalesce(bp.profile_type,'individual') <> 'professional')
      when 'pro_paid'     then count(*) filter (where coalesce(bp.plan,'') in ('monthly','annual'))
      when 'pro_free'     then count(*) filter (where coalesce(bp.plan,'') not in ('monthly','annual'))
    end::int
  into v_count
  from referrals r
  left join billing_profiles bp on bp.user_id = r.referred_user_id
  where r.referrer_user_id = v_owner and r.activated_at is not null
    and date_trunc('month', r.activated_at) = date_trunc('month', now());

  if v_count < v_target then return json_build_object('ok', false, 'reason', 'not_reached', 'count', v_count, 'target', v_target); end if;

  select count(*)::int into v_exists from referral_rewards
   where user_id = v_owner and reason = p_kind
     and date_trunc('month', created_at) = date_trunc('month', now());
  if v_exists > 0 then return json_build_object('ok', false, 'reason', 'already_claimed'); end if;

  insert into referral_rewards (user_id, kind, months, tier, reason, status)
       values (v_owner, 'months', v_months, v_tier, p_kind, 'pending');
  return json_build_object('ok', true, 'status', 'pending', 'months', v_months, 'tier', v_tier);
end; $$;


ALTER FUNCTION "public"."claim_referral_bonus"("p_code" "text", "p_kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_org_upgrade_request"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update organizations set upgrade_requested_at = null where owner_user_id = auth.uid();
end; $$;


ALTER FUNCTION "public"."clear_org_upgrade_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."community_market_stats"() RETURNS TABLE("postal_code" "text", "sample_count" integer, "median_gross_yield" numeric, "p25_yield" numeric, "p75_yield" numeric, "median_rent_per_sqm" numeric, "median_price_per_sqm" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with base as (
    select
      up.postal_code,
      up.value::numeric as value,
      coalesce(rc.actual_rent, rc.target_rent, up.target_rent)::numeric as rent,
      nullif(up.sqm, 0)::numeric as sqm
    from public.user_properties up
    left join public.billing_profiles bp on bp.user_id = up.user_id
    left join lateral (
      select actual_rent, target_rent
      from public.rent_config rc
      where rc.property_id = up.id
      limit 1
    ) rc on true
    where up.postal_code is not null and btrim(up.postal_code) <> ''
      and up.value is not null and up.value > 0
      and coalesce(rc.actual_rent, rc.target_rent, up.target_rent) > 0
      and coalesce(bp.share_market_data, true) = true   -- σέβεται το opt-out
  ),
  filtered as (
    select postal_code, value, rent, sqm, (rent * 12.0 / value) * 100.0 as gy
    from base
    where (rent * 12.0 / value) * 100.0 between 1 and 25
  )
  select
    postal_code,
    count(*)::int,
    round(percentile_cont(0.5)  within group (order by gy)::numeric, 1),
    round(percentile_cont(0.25) within group (order by gy)::numeric, 1),
    round(percentile_cont(0.75) within group (order by gy)::numeric, 1),
    round(percentile_cont(0.5)  within group (order by rent / sqm)  filter (where sqm is not null)::numeric, 2),
    round(percentile_cont(0.5)  within group (order by value / sqm) filter (where sqm is not null)::numeric, 0)
  from filtered
  group by postal_code
  having count(*) >= 5;
$$;


ALTER FUNCTION "public"."community_market_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_real_words"("p" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select coalesce(array_length(
    array(
      select w from unnest(regexp_split_to_array(coalesce(trim(p), ''), '\s+')) as w
      where w ~ '[A-Za-zΑ-Ωα-ωΆΈΉΊΌΎΏϊϋΐΰ]'
    ), 1), 0);
$$;


ALTER FUNCTION "public"."count_real_words"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."declare_rent_payment"("p_token" "text", "p_payment_id" "uuid", "p_note" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_link record; v_ok int;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return false; end if;
  -- Μόνο δόσεις που ανήκουν στο ακίνητο της πύλης, και ΔΕΝ σημειώνεται «πληρωμένο»
  -- (αυτό το κάνει ο ιδιοκτήτης) — μόνο «δηλώθηκε από τον ενοικιαστή».
  update rent_payments
    set tenant_declared = true, tenant_declared_at = now(), tenant_note = left(coalesce(p_note,''), 500)
    where id = p_payment_id and property_id::text = v_link.property_id::text and paid = false;
  get diagnostics v_ok = row_count;
  return v_ok > 0;
end; $$;


ALTER FUNCTION "public"."declare_rent_payment"("p_token" "text", "p_payment_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_my_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  uid uuid := auth.uid();
  t   record;
begin
  if uid is null then
    raise exception 'Δεν υπάρχει συνδεδεμένος χρήστης';
  end if;

  -- 1) Σβήσε όλες τις εγγραφές του χρήστη από κάθε πίνακα public με στήλη user_id
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format('delete from public.%I where user_id = $1', t.table_name) using uid;
  end loop;

  -- 2) Σβήσε τα ανεβασμένα αρχεία του χρήστη από το storage
  begin
    delete from storage.objects where owner = uid;
  exception when others then
    -- αν δεν υπάρχει πρόσβαση/πίνακας, μη μπλοκάρεις τη διαγραφή
    null;
  end;

  -- 3) Σβήσε τον ίδιο τον χρήστη (auth). Ό,τι έχει FK με on delete cascade φεύγει μαζί.
  delete from auth.users where id = uid;
end;
$_$;


ALTER FUNCTION "public"."delete_my_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."drain_email_outbox"("p_limit" integer DEFAULT 100) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r        record;
  v_secret text;
  v_url    text := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/send-lifecycle-email';
  v_sent   int := 0;
begin
  select secret into v_secret from public.cron_secrets where name = 'email_cron' limit 1;
  if v_secret is null then return 0; end if;   -- not configured yet → no-op

  for r in
    -- State gate: only send rows the scheduler has PLANNED (send_window set), or
    -- transactional rows (which bypass the scheduler and go immediately). Raw
    -- freshly-enqueued marketing/operational rows wait for schedule-email-outbox
    -- to apply the cadence policy first, so the drain can never flood a recipient.
    select * from public.email_outbox
     where status = 'pending' and scheduled_for <= now()
       and (send_window is not null or category = 'transactional')
     order by scheduled_for
     limit p_limit
     for update skip locked
  loop
    -- throttle marketing; transactional/operational always pass
    if r.category = 'marketing' and not public.can_send_marketing(r.to_email) then
      update public.email_outbox set status = 'skipped', last_error = 'frequency_cap' where id = r.id;
      continue;
    end if;

    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body    := jsonb_build_object('copyId', r.copy_id, 'email', r.to_email, 'name', r.to_name, 'params', r.params)
    );
    -- Optimistic mark. Enhancement (post-domain): poll net._http_response and
    -- flip to 'failed' + retry with backoff when a call did not return 2xx.
    update public.email_outbox
       set status = 'sent', sent_at = now(), attempts = attempts + 1
     where id = r.id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;


ALTER FUNCTION "public"."drain_email_outbox"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."draw_due_feedback_winners"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_last  timestamptz := date_trunc('month', now()) - interval '15 days';
  v_camp  text;
  v_phase int;
begin
  select campaign_id into v_camp from public.feedback_campaign(v_last);
  v_phase := ((extract(year from v_last)::int - 2026) * 12 + (extract(month from v_last)::int - 1))
             - floor(((extract(year from v_last)::int - 2026) * 12 + (extract(month from v_last)::int - 1))::numeric / 4)::int * 4;
  if v_phase = 2 then           -- τελευταίος ενεργός μήνας → η καμπάνια έκλεισε
    perform public.draw_feedback_winner(v_camp);
  end if;
end; $$;


ALTER FUNCTION "public"."draw_due_feedback_winners"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."draw_feedback_winner"("p_campaign" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_winner uuid;
begin
  if p_campaign is null then return null; end if;
  if exists (select 1 from feedback_campaign_winners where campaign_id = p_campaign) then
    return null;   -- η κλήρωση έχει ήδη γίνει (idempotent)
  end if;

  -- Ένας νικητής ανά χρήστη (group by), τυχαία επιλογή από το pool.
  select user_id into v_winner
    from user_feedback
   where campaign_id = p_campaign and in_pool
   group by user_id
   order by random()
   limit 1;
  if v_winner is null then return null; end if;

  insert into feedback_campaign_winners(campaign_id, user_id) values (p_campaign, v_winner);

  -- Δώρο μέσω των υπαρχόντων comp πεδίων (bypass του lock_billing_plan: εδώ
  -- τρέχουμε ως definer/owner, όχι ως authenticated).
  insert into billing_profiles(user_id, comp_plan, comp_until, comp_started_at, comp_months_granted)
  values (v_winner, 'agency', now() + interval '12 months', now(), 12)
  on conflict (user_id) do update set
    comp_plan           = 'agency',
    comp_until          = greatest(coalesce(billing_profiles.comp_until, now()), now() + interval '12 months'),
    comp_started_at     = coalesce(billing_profiles.comp_started_at, now()),
    comp_months_granted = coalesce(billing_profiles.comp_months_granted, 0) + 12;

  return v_winner;
end; $$;


ALTER FUNCTION "public"."draw_feedback_winner"("p_campaign" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_property_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count int;
  v_limit int;
begin
  select count(*) into v_count from user_properties where user_id = NEW.user_id;
  v_limit := plan_max_properties(user_plan_rank(NEW.user_id));
  if v_count >= v_limit then
    raise exception 'PROPERTY_LIMIT: Το πλάνο σου καλύπτει % ακίνητα. Αναβάθμισε για περισσότερα.', v_limit
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."enforce_property_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_email"("p_copy_id" "text", "p_to_email" "text", "p_to_name" "text" DEFAULT NULL::"text", "p_params" "jsonb" DEFAULT '{}'::"jsonb", "p_category" "text" DEFAULT 'marketing'::"text", "p_dedup_key" "text" DEFAULT NULL::"text", "p_delay" interval DEFAULT '00:00:00'::interval) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_id bigint;
begin
  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  values (p_copy_id, lower(trim(p_to_email)), p_to_name, coalesce(p_params, '{}'::jsonb),
          p_category, p_dedup_key, now() + coalesce(p_delay, '0'::interval))
  on conflict (dedup_key) do nothing
  returning id into v_id;
  return v_id;
end $$;


ALTER FUNCTION "public"."enqueue_email"("p_copy_id" "text", "p_to_email" "text", "p_to_name" "text", "p_params" "jsonb", "p_category" "text", "p_dedup_key" "text", "p_delay" interval) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "upgrade_requested_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_organization"() RETURNS "public"."organizations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."ensure_organization"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_my_data"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."export_my_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."feedback_campaign"("p_ts" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("campaign_id" "text", "active" boolean)
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  with e as (
    select ((extract(year from p_ts)::int - 2026) * 12 + (extract(month from p_ts)::int - 1)) as m
  )
  select 'C' || floor(m::numeric / 4)::text,
         (m - floor(m::numeric / 4)::int * 4) < 3
  from e;
$$;


ALTER FUNCTION "public"."feedback_campaign"("p_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_accountant_data"("p_token" "text", "p_year" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_link record; v_props json; v_owner text;
begin
  select * into v_link from accountant_links where token = p_token and active = true;
  if not found then return null; end if;
  select coalesce(nullif(trim(owner_name), ''), full_name) into v_owner from billing_profiles where user_id = v_link.user_id;
  select json_agg(sub.row) into v_props from (
    select json_build_object(
      'name', p.name, 'atak', p.atak, 'address', p.address, 'prop_type', p.prop_type,
      'rent', (select t.monthly_rent from tenants t where t.property_id = p.id order by t.created_at desc limit 1),
      'expenses', coalesce((select json_agg(json_build_object('category', e.category, 'amount', e.amount, 'date', e.date)) from expenses e where e.property_id = p.id and extract(year from e.date) = p_year), '[]'::json),
      'stays', coalesce((select json_agg(json_build_object('check_in', s.check_in, 'check_out', s.check_out, 'nights', s.nights, 'total', s.total)) from client_stays s where s.property_id = p.id and extract(year from coalesce(s.check_in, s.check_out)) = p_year), '[]'::json)
    ) as row
    from user_properties p where p.user_id = v_link.user_id order by p.name
  ) sub;
  return json_build_object('owner', v_owner, 'year', p_year, 'properties', coalesce(v_props, '[]'::json));
end; $$;


ALTER FUNCTION "public"."get_accountant_data"("p_token" "text", "p_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_checkin_context"("p_token" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_link record; v_prop record;
begin
  select * into v_link from checkin_links where token = p_token and active = true;
  if not found then return null; end if;
  select name, address into v_prop from user_properties where id::text = v_link.property_id::text;
  return json_build_object('property', json_build_object('name', coalesce(v_prop.name, 'το κατάλυμα'), 'address', v_prop.address));
end; $$;


ALTER FUNCTION "public"."get_checkin_context"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_portal_data"("p_token" "text", "p_pin" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare v_link record; v_prop record; v_ten record; v_due json; v_total numeric;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return null; end if;
  -- Αν έχει οριστεί PIN, απαιτείται σωστός κωδικός· αλλιώς επιστρέφει «κλειδωμένο».
  if v_link.pin_hash is not null then
    if p_pin is null or crypt(p_pin, v_link.pin_hash) <> v_link.pin_hash then
      return json_build_object('locked', true);
    end if;
  end if;
  select name, address, prop_type into v_prop from user_properties where id::text = v_link.property_id::text;
  select id, monthly_rent, lease_start, lease_end, deposit_amount, full_name, rent_iban into v_ten
    from tenants where property_id = v_link.property_id order by created_at desc limit 1;

  select coalesce(json_agg(json_build_object(
           'id', rp.id, 'year', rp.period_year, 'month', rp.period_month,
           'amount', rp.amount, 'due_date', rp.due_date, 'declared', rp.tenant_declared
         ) order by rp.period_year, rp.period_month), '[]'::json),
         coalesce(sum(rp.amount), 0)
    into v_due, v_total
    from rent_payments rp
    where rp.tenant_id = v_ten.id and rp.paid = false;

  return json_build_object(
    'property', json_build_object('name', v_prop.name, 'address', v_prop.address, 'type', v_prop.prop_type),
    'tenant',   json_build_object('name', v_ten.full_name, 'rent', v_ten.monthly_rent,
      'lease_start', v_ten.lease_start, 'lease_end', v_ten.lease_end, 'deposit', v_ten.deposit_amount,
      'rent_iban', v_ten.rent_iban),
    'payment_link', v_link.payment_link,
    'due',      v_due,
    'total_due', v_total
  );
end; $$;


ALTER FUNCTION "public"."get_portal_data"("p_token" "text", "p_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_referral_list"("p_code" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_owner uuid; v_rows json;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return json_build_array(); end if;

  select coalesce(json_agg(t order by t.created_at desc), json_build_array())
    into v_rows
    from (
      select r.created_at, r.activated_at
        from referrals r
       where r.referrer_user_id = v_owner
    ) t;

  return v_rows;
end;
$$;


ALTER FUNCTION "public"."get_referral_list"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_referral_overview"("p_code" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner uuid;
  v_invites int; v_activated int;
  v_m_pro int; v_m_indiv int; v_m_paid int; v_m_free int;
  v_streak int := 0; v_partner boolean; v_monthly json;
  r record;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then
    return json_build_object('invites',0,'activated',0,'m_pro',0,'m_indiv',0,
      'm_paid',0,'m_free',0,'streak',0,'partner',false,'paid_monthly_counts',json_build_array());
  end if;

  select count(*)::int into v_invites   from referrals where referrer_user_id = v_owner;
  select count(*)::int into v_activated from referrals where referrer_user_id = v_owner and activated_at is not null;

  -- Ενεργοποιήσεις τρέχοντος μήνα, ανά ιδιότητα του νέου χρήστη.
  select
    (count(*) filter (where coalesce(bp.profile_type,'individual') = 'professional'))::int,
    (count(*) filter (where coalesce(bp.profile_type,'individual') <> 'professional'))::int,
    (count(*) filter (where coalesce(bp.plan,'') in ('monthly','annual')))::int,
    (count(*) filter (where coalesce(bp.plan,'') not in ('monthly','annual')))::int
  into v_m_pro, v_m_indiv, v_m_paid, v_m_free
  from referrals r2
  left join billing_profiles bp on bp.user_id = r2.referred_user_id
  where r2.referrer_user_id = v_owner and r2.activated_at is not null
    and date_trunc('month', r2.activated_at) = date_trunc('month', now());

  -- Σερί συνδρομητών: πιο πρόσφατος ΟΛΟΚΛΗΡΩΜΕΝΟΣ μήνας και πίσω, όσο ≥5 paid.
  for r in
    select (
      select (count(*) filter (where coalesce(bp.plan,'') in ('monthly','annual')))::int
        from referrals rr
        left join billing_profiles bp on bp.user_id = rr.referred_user_id
       where rr.referrer_user_id = v_owner and rr.activated_at is not null
         and date_trunc('month', rr.activated_at) = gs.m) as paid
      from generate_series(
             date_trunc('month', now()) - interval '1 month',
             date_trunc('month', now()) - interval '12 months',
             interval '-1 month') as gs(m)
      order by gs.m desc
  loop
    if r.paid >= 5 then v_streak := v_streak + 1; else exit; end if;
  end loop;

  if v_streak >= 3 then
    insert into referral_partners (user_id) values (v_owner) on conflict (user_id) do nothing;
  end if;
  select exists(select 1 from referral_partners where user_id = v_owner) into v_partner;

  -- Ιστορικό 6 ολοκληρωμένων μηνών (παλιό→νέο): συνδρομητές/μήνα (γράφημα).
  select json_agg(paid order by m) into v_monthly from (
      select gs.m as m, (
             select (count(*) filter (where coalesce(bp.plan,'') in ('monthly','annual')))::int
               from referrals rr
               left join billing_profiles bp on bp.user_id = rr.referred_user_id
              where rr.referrer_user_id = v_owner and rr.activated_at is not null
                and date_trunc('month', rr.activated_at) = gs.m) as paid
        from generate_series(
               date_trunc('month', now()) - interval '6 months',
               date_trunc('month', now()) - interval '1 month',
               interval '1 month') as gs(m)
    ) months;

  return json_build_object(
    'invites', v_invites, 'activated', v_activated,
    'm_pro', v_m_pro, 'm_indiv', v_m_indiv, 'm_paid', v_m_paid, 'm_free', v_m_free,
    'streak', v_streak, 'partner', v_partner,
    'paid_monthly_counts', coalesce(v_monthly, json_build_array())
  );
end; $$;


ALTER FUNCTION "public"."get_referral_overview"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_referral_social_proof"() RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(distinct referrer_user_id)::int from referrals
   where referrer_user_id is not null
     and date_trunc('month', created_at) = date_trunc('month', now());
$$;


ALTER FUNCTION "public"."get_referral_social_proof"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_referral_standing"() RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_me int; v_total int; v_below int; v_top int;
begin
  select count(*) into v_me from referrals
   where referrer_user_id = auth.uid() and activated_at is not null
     and date_trunc('month', activated_at) = date_trunc('month', now());
  if v_me < 1 then return 0; end if;

  select count(*) into v_total from (
    select referrer_user_id from referrals
     where activated_at is not null
       and date_trunc('month', activated_at) = date_trunc('month', now())
     group by referrer_user_id) t;
  if v_total < 5 then return 0; end if;

  select count(*) into v_below from (
    select referrer_user_id from referrals
     where activated_at is not null
       and date_trunc('month', activated_at) = date_trunc('month', now())
     group by referrer_user_id
    having count(*) < v_me) t;

  v_top := greatest(1, round(100.0 * (v_total - v_below) / v_total)::int);
  if v_top > 50 then return 0; end if;
  return v_top;
end;
$$;


ALTER FUNCTION "public"."get_referral_standing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_referral_stats"("p_code" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_owner uuid;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return 0; end if;
  return (select count(*)::int from referrals where code = p_code);
end; $$;


ALTER FUNCTION "public"."get_referral_stats"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_org_member"("p_email" "text", "p_role" "text" DEFAULT 'member'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_org uuid;
begin
  select id into v_org from organizations where owner_user_id = auth.uid();
  if v_org is null or p_email is null or position('@' in p_email) = 0 then return; end if;
  insert into organization_members(org_id, email, role, status)
    values (v_org, lower(trim(p_email)), case when p_role in ('admin','member') then p_role else 'member' end, 'invited')
  on conflict (org_id, email) do update set role = excluded.role, status = case when organization_members.status = 'revoked' then 'invited' else organization_members.status end;
end; $$;


ALTER FUNCTION "public"."invite_org_member"("p_email" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_org_member"("p_org" "uuid", "p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from organization_members where org_id = p_org and user_id = p_uid and status = 'active')
$$;


ALTER FUNCTION "public"."is_active_org_member"("p_org" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_portal_token"("p_token" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists(select 1 from portal_links where token = p_token and active);
$$;


ALTER FUNCTION "public"."is_active_portal_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_owner"("p_org" "uuid", "p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from organizations where id = p_org and owner_user_id = p_uid)
$$;


ALTER FUNCTION "public"."is_org_owner"("p_org" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_mobile_waitlist"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null then return; end if;
  select email into v_email from auth.users where id = v_uid;

  insert into mobile_waitlist(user_id, email) values (v_uid, v_email)
  on conflict (user_id) do update set email = excluded.email;

  -- Διατηρούμε και την ένδειξη wants_mobile (τη διαβάζει το UI για το «μπήκες»).
  insert into billing_profiles(user_id, wants_mobile) values (v_uid, true)
  on conflict (user_id) do update set wants_mobile = true;
end; $$;


ALTER FUNCTION "public"."join_mobile_waitlist"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_mobile_waitlist"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  delete from mobile_waitlist where user_id = v_uid;
  update billing_profiles set wants_mobile = false where user_id = v_uid;
end; $$;


ALTER FUNCTION "public"."leave_mobile_waitlist"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_billing_plan"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.plan := 'free';
      new.comp_plan := null;
      new.comp_until := null;
      new.comp_months_granted := 0;
      new.comp_started_at := null;
    else
      if new.plan is distinct from old.plan then new.plan := old.plan; end if;
      new.comp_plan          := old.comp_plan;
      new.comp_until         := old.comp_until;
      new.comp_months_granted := old.comp_months_granted;
      new.comp_started_at    := old.comp_started_at;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."lock_billing_plan"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_activity"("p_action" "text", "p_entity" "text" DEFAULT NULL::"text", "p_entity_id" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null or coalesce(p_action, '') = '' then return; end if;
  select email into v_email from auth.users where id = v_uid;
  insert into activity_log(user_id, actor_id, actor_email, action, entity, entity_id, metadata)
  values (v_uid, v_uid, v_email, left(p_action, 60), left(p_entity, 40), left(p_entity_id, 100), coalesce(p_metadata, '{}'));
end; $$;


ALTER FUNCTION "public"."log_activity"("p_action" "text", "p_entity" "text", "p_entity_id" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_referral_activated"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_props int; v_docs int;
begin
  select count(*)::int into v_props from user_properties where user_id = auth.uid();
  select count(*)::int into v_docs  from property_documents where user_id = auth.uid();
  if v_props >= 1 and v_docs >= 1 then
    update referrals set activated_at = now()
     where referred_user_id = auth.uid() and activated_at is null;
  end if;
end; $$;


ALTER FUNCTION "public"."mark_referral_activated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."marketing_prefs_by_token"("p_token" "uuid") RETURNS TABLE("product_news" boolean, "market_news" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select product_news, market_news from public.email_marketing_prefs where unsubscribe_token = p_token;
$$;


ALTER FUNCTION "public"."marketing_prefs_by_token"("p_token" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "actor_email" "text",
    "action" "text" NOT NULL,
    "entity" "text",
    "entity_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_activity"("p_limit" integer DEFAULT 30) RETURNS SETOF "public"."activity_log"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select * from activity_log
   where user_id = auth.uid() or actor_id = auth.uid()
   order by created_at desc
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;


ALTER FUNCTION "public"."my_activity"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_feedback_status"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_uid uuid := auth.uid(); v_has boolean; v_active boolean; v_camp text;
begin
  if v_uid is null then return jsonb_build_object('status', 'error'); end if;
  select exists(
    select 1 from user_feedback
     where user_id = v_uid and date_trunc('month', created_at) = date_trunc('month', now())
  ) into v_has;
  select campaign_id, active into v_camp, v_active from public.feedback_campaign(now());
  return jsonb_build_object('submitted_this_month', v_has, 'campaign_active', v_active, 'campaign', v_camp);
end; $$;


ALTER FUNCTION "public"."my_feedback_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_invoice_number"("p_series" "text", "p_year" integer) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v bigint;
begin
  insert into invoice_counters(series, year, last_no)
  values (p_series, p_year, 1)
  on conflict (series, year)
    do update set last_no = invoice_counters.last_no + 1
  returning last_no into v;
  return v;
end; $$;


ALTER FUNCTION "public"."next_invoice_number"("p_series" "text", "p_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."org_editor_owner_ids"("p_uid" "uuid") RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select o.owner_user_id
    from organization_members m
    join organizations o on o.id = m.org_id
   where m.user_id = p_uid and m.status = 'active' and m.can_edit = true and p_uid = auth.uid()
$$;


ALTER FUNCTION "public"."org_editor_owner_ids"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."org_owner_ids"("p_uid" "uuid") RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p_uid where p_uid = auth.uid()
  union
  select o.owner_user_id
    from organization_members m
    join organizations o on o.id = m.org_id
   where m.user_id = p_uid and m.status = 'active' and p_uid = auth.uid()
$$;


ALTER FUNCTION "public"."org_owner_ids"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."owns_portal_token"("p_token" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists(select 1 from portal_links where token = p_token and user_id = auth.uid());
$$;


ALTER FUNCTION "public"."owns_portal_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."plan_max_properties"("p_rank" integer) RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select case p_rank when 2 then 2147483647 when 1 then 6 else 1 end;
$$;


ALTER FUNCTION "public"."plan_max_properties"("p_rank" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."portal_meta"("p_token" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_link record;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return json_build_object('found', false, 'pin_required', false); end if;
  return json_build_object('found', true, 'pin_required', v_link.pin_hash is not null);
end; $$;


ALTER FUNCTION "public"."portal_meta"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_referral_rewards"("p_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_owner  uuid;
  v_ptype  text;
  v_paying boolean;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return; end if;

  select coalesce(profile_type, 'individual'),
         coalesce(plan, '') in ('monthly', 'annual')
    into v_ptype, v_paying
    from billing_profiles where user_id = v_owner;
  v_ptype  := coalesce(v_ptype, 'individual');
  v_paying := coalesce(v_paying, false);

  -- Μόνο ο Ιδιώτης έχει ανά-σύσταση αξία· ο Επαγγελματίας αμείβεται αλλιώς.
  if v_ptype = 'professional' then return; end if;

  -- 1) Base ανά ενεργοποιημένη σύσταση: δωρεάν ακίνητο (δωρεάν συστήνων) ή μήνας.
  insert into referral_rewards (user_id, referral_id, kind, months, tier, reason, status)
  select v_owner, r.id,
         case when v_paying then 'months' else 'slot' end,
         1, 'owner', 'per_referral', 'pending'
    from referrals r
   where r.referrer_user_id = v_owner and r.activated_at is not null
  on conflict (user_id, referral_id, reason) where referral_id is not null do nothing;

  -- 2) Μπόνους +2 μήνες Ιδιώτη όταν ο συστημένος γίνει Επαγγελματίας.
  insert into referral_rewards (user_id, referral_id, kind, months, tier, reason, status)
  select v_owner, r.id, 'months', 2, 'owner', 'per_referral_pro', 'pending'
    from referrals r
    join billing_profiles bp on bp.user_id = r.referred_user_id
   where r.referrer_user_id = v_owner and r.activated_at is not null
     and coalesce(bp.profile_type, 'individual') = 'professional'
  on conflict (user_id, referral_id, reason) where referral_id is not null do nothing;
end;
$$;


ALTER FUNCTION "public"."reconcile_referral_rewards"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_referral"("p_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_owner uuid; v_created timestamptz;
begin
  if p_code is null or length(trim(p_code)) = 0 then return; end if;
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner = auth.uid() then return; end if;
  select created_at into v_created from auth.users where id = auth.uid();
  if v_created is null or v_created < now() - interval '14 days' then return; end if;
  insert into referrals (code, referred_user_id, referrer_user_id)
       values (p_code, auth.uid(), v_owner)
  on conflict (referred_user_id) do nothing;
end; $$;


ALTER FUNCTION "public"."redeem_referral"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_email_schedule_lock"() RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select pg_advisory_unlock(hashtext('email-outbox-schedule')); $$;


ALTER FUNCTION "public"."release_email_schedule_lock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rename_organization"("p_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update organizations set name = coalesce(nullif(trim(p_name), ''), name) where owner_user_id = auth.uid();
end; $$;


ALTER FUNCTION "public"."rename_organization"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_member_edit"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update organization_members set edit_requested_at = now()
   where user_id = auth.uid() and status = 'active' and role <> 'owner' and coalesce(can_edit, false) = false;
end; $$;


ALTER FUNCTION "public"."request_member_edit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_org_upgrade"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update organizations set upgrade_requested_at = now()
   where id in (select org_id from organization_members where user_id = auth.uid() and status = 'active');
end; $$;


ALTER FUNCTION "public"."request_org_upgrade"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_org_member"("p_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_org uuid;
begin
  select id into v_org from organizations where owner_user_id = auth.uid();
  if v_org is null then return; end if;
  delete from organization_members where org_id = v_org and lower(email) = lower(p_email) and role <> 'owner';
end; $$;


ALTER FUNCTION "public"."revoke_org_member"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_member_edit"("p_email" "text", "p_can" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_org uuid;
begin
  select id into v_org from organizations where owner_user_id = auth.uid();
  if v_org is null then return; end if;
  update organization_members
     set can_edit = coalesce(p_can, false), edit_requested_at = null
   where org_id = v_org and lower(email) = lower(p_email) and role <> 'owner';
end; $$;


ALTER FUNCTION "public"."set_member_edit"("p_email" "text", "p_can" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_org_member_role"("p_email" "text", "p_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_org uuid;
begin
  select id into v_org from organizations where owner_user_id = auth.uid();
  if v_org is null then return; end if;
  update organization_members set role = case when p_role in ('admin','member') then p_role else role end
   where org_id = v_org and lower(email) = lower(p_email) and role <> 'owner';
end; $$;


ALTER FUNCTION "public"."set_org_member_role"("p_email" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_portal_pin"("p_token" "text", "p_pin" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare v_ok int;
begin
  update portal_links
    set pin_hash = case when coalesce(trim(p_pin), '') = '' then null else crypt(p_pin, gen_salt('bf')) end
    where token = p_token and user_id = auth.uid();
  get diagnostics v_ok = row_count;
  return v_ok > 0;
end; $$;


ALTER FUNCTION "public"."set_portal_pin"("p_token" "text", "p_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_checkin"("p_token" "text", "p_full_name" "text", "p_id_number" "text", "p_nationality" "text", "p_birth_date" "text", "p_phone" "text", "p_email" "text", "p_arrival_date" "text", "p_guests" integer, "p_accepts" boolean, "p_privacy_consent" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_link record;
begin
  select * into v_link from checkin_links where token = p_token and active = true;
  if not found then return false; end if;
  if coalesce(trim(p_full_name), '') = '' then return false; end if;
  -- Χωρίς ρητή συγκατάθεση GDPR δεν αποθηκεύουμε προσωπικά δεδομένα.
  if coalesce(p_privacy_consent, false) = false then return false; end if;
  insert into guest_checkins(token, user_id, client_id, property_id, full_name, id_number, nationality, birth_date, phone, email, arrival_date, guests_count, accepts_rules, privacy_consent, privacy_consent_at)
    values (p_token, v_link.user_id, v_link.client_id, v_link.property_id, left(p_full_name,160), left(p_id_number,60),
            left(p_nationality,60), nullif(p_birth_date,'')::date, left(p_phone,40), left(p_email,160),
            nullif(p_arrival_date,'')::date, p_guests, coalesce(p_accepts,false), true, now());
  return true;
end; $$;


ALTER FUNCTION "public"."submit_checkin"("p_token" "text", "p_full_name" "text", "p_id_number" "text", "p_nationality" "text", "p_birth_date" "text", "p_phone" "text", "p_email" "text", "p_arrival_date" "text", "p_guests" integer, "p_accepts" boolean, "p_privacy_consent" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_feedback"("p_body" "text", "p_target" "text" DEFAULT 'general'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid   uuid := auth.uid();
  v_words int;
  v_camp  text;
  v_active boolean;
  v_email text;
  v_min   int := 12;
begin
  if v_uid is null then return jsonb_build_object('status', 'error'); end if;

  v_words := public.count_real_words(p_body);
  if v_words < v_min then
    return jsonb_build_object('status', 'too_short', 'min', v_min, 'words', v_words);
  end if;

  if exists (
    select 1 from user_feedback
     where user_id = v_uid and date_trunc('month', created_at) = date_trunc('month', now())
  ) then
    return jsonb_build_object('status', 'already');
  end if;

  select campaign_id, active into v_camp, v_active from public.feedback_campaign(now());
  select email into v_email from auth.users where id = v_uid;

  insert into user_feedback(user_id, email, body, word_count, target, campaign_id, in_pool)
  values (v_uid, v_email, left(p_body, 4000), v_words,
          coalesce(nullif(p_target, ''), 'general'),
          case when v_active then v_camp else null end,
          v_active);

  return jsonb_build_object('status', 'ok', 'in_pool', v_active,
                            'campaign', case when v_active then v_camp else null end);
end; $$;


ALTER FUNCTION "public"."submit_feedback"("p_body" "text", "p_target" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_maintenance_request"("p_token" "text", "p_title" "text", "p_description" "text", "p_contact" "text", "p_photos" "jsonb" DEFAULT '[]'::"jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_link record; v_ten_id uuid;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return false; end if;
  if coalesce(trim(p_title), '') = '' then return false; end if;
  select id into v_ten_id from tenants where property_id = v_link.property_id order by created_at desc limit 1;
  insert into maintenance_requests(property_id, user_id, token, tenant_id, title, description, contact, photos)
    values (v_link.property_id, v_link.user_id, p_token, v_ten_id, left(p_title, 200), left(p_description, 2000), left(p_contact, 200),
            coalesce(p_photos, '[]'::jsonb));
  return true;
end; $$;


ALTER FUNCTION "public"."submit_maintenance_request"("p_token" "text", "p_title" "text", "p_description" "text", "p_contact" "text", "p_photos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_comp_from_referrals"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid    uuid := auth.uid();
  v_months int;
  v_ptype  text;
  v_target text;
  v_cap    int := 12;
begin
  if v_uid is null then return; end if;

  select coalesce(sum(months), 0) into v_months
    from referral_rewards
   where user_id = v_uid and kind = 'months';
  v_months := least(v_months, v_cap);
  if v_months <= 0 then return; end if;

  select coalesce(profile_type, 'individual') into v_ptype
    from billing_profiles where user_id = v_uid;
  v_target := case when v_ptype = 'professional' then 'agency' else 'owner' end;

  -- Αύξηση μόνο (idempotent): ενημερώνουμε όταν κερδήθηκαν περισσότεροι μήνες.
  update billing_profiles
     set comp_months_granted = greatest(coalesce(comp_months_granted, 0), v_months),
         comp_started_at     = coalesce(comp_started_at, now()),
         comp_plan           = v_target,
         comp_until          = coalesce(comp_started_at, now())
                               + (greatest(coalesce(comp_months_granted, 0), v_months) || ' months')::interval
   where user_id = v_uid
     and v_months > coalesce(comp_months_granted, 0);
end;
$$;


ALTER FUNCTION "public"."sync_comp_from_referrals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_email_schedule_lock"() RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$ select pg_try_advisory_lock(hashtext('email-outbox-schedule')); $$;


ALTER FUNCTION "public"."try_email_schedule_lock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unsubscribe_email"("p_token" "uuid", "p_kind" "text" DEFAULT 'all'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare n int;
begin
  update public.email_marketing_prefs
     set product_news = case when p_kind in ('all','product') then false else product_news end,
         market_news  = case when p_kind in ('all','market')  then false else market_news  end,
         updated_at = now()
   where unsubscribe_token = p_token;
  get diagnostics n = row_count;
  return n > 0;
end $$;


ALTER FUNCTION "public"."unsubscribe_email"("p_token" "uuid", "p_kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_plan_rank"("p_uid" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_plan       text;
  v_comp_plan  text;
  v_comp_until timestamptz;
  v_rank       int := 0;
begin
  select plan, comp_plan, comp_until
    into v_plan, v_comp_plan, v_comp_until
    from billing_profiles where user_id = p_uid;

  -- Βασικό πλάνο (ό,τι δεν είναι owner/agency θεωρείται free).
  if v_plan = 'owner'  then v_rank := greatest(v_rank, 1); end if;
  if v_plan = 'agency' then v_rank := greatest(v_rank, 2); end if;

  -- Ενεργή δωρεάν πρόσβαση.
  if v_comp_until is not null and v_comp_until > now() then
    if v_comp_plan = 'owner'  then v_rank := greatest(v_rank, 1); end if;
    if v_comp_plan = 'agency' then v_rank := greatest(v_rank, 2); end if;
  end if;

  -- Ιδιότητα Συνεργάτη → Επαγγελματίας.
  if exists (select 1 from referral_partners where user_id = p_uid) then
    v_rank := greatest(v_rank, 2);
  end if;

  return v_rank;
end;
$$;


ALTER FUNCTION "public"."user_plan_rank"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_document"("p_id" "text") RETURNS TABLE("id" "text", "doc_type" "text", "subject" "text", "period" "text", "issued_at" timestamp with time zone, "issuer" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select d.id, d.doc_type, d.subject, d.period, d.issued_at,
         coalesce(nullif(btrim(b.company_name), ''), 'Property OS') as issuer
  from public.issued_documents d
  left join public.report_branding b on b.user_id = d.user_id and b.enabled = true
  where d.id = p_id;
$$;


ALTER FUNCTION "public"."verify_document"("p_id" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accountant_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" DEFAULT "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") NOT NULL,
    "user_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."accountant_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loan_programs" (
    "program_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text",
    "color" "text",
    "status" "text" DEFAULT 'active'::"text",
    "type_label" "text",
    "description" "text",
    "how_it_works" "text",
    "extra_info" "text",
    "savings_example" "text",
    "max_amount" integer,
    "max_prop_value" integer,
    "max_ltv" integer,
    "max_sqm" integer,
    "age_min" integer,
    "age_max" integer,
    "duration_label" "text",
    "deadline" "date",
    "deadline_label" "text",
    "deadline_urgent" boolean DEFAULT false,
    "total_budget" "text",
    "criteria" "text"[] DEFAULT '{}'::"text"[],
    "participating_banks" "text"[] DEFAULT '{}'::"text"[],
    "source_url" "text",
    "verified_at" "date"
);


ALTER TABLE "public"."loan_programs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."active_loan_programs" WITH ("security_invoker"='true') AS
 SELECT "program_id",
    "name",
    "icon",
    "color",
    "status",
    "type_label",
    "description",
    "how_it_works",
    "extra_info",
    "savings_example",
    "max_amount",
    "max_prop_value",
    "max_ltv",
    "max_sqm",
    "age_min",
    "age_max",
    "duration_label",
    "deadline",
    "deadline_label",
    "deadline_urgent",
    "total_budget",
    "criteria",
    "participating_banks",
    "source_url",
    "verified_at",
    "program_id" AS "id"
   FROM "public"."loan_programs" "lp"
  WHERE ((COALESCE("status", 'active'::"text") <> 'ended'::"text") AND (("deadline" IS NULL) OR ("deadline" >= CURRENT_DATE)));


ALTER VIEW "public"."active_loan_programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."airbnb_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "check_in" "date" NOT NULL,
    "check_out" "date" NOT NULL,
    "nights" integer NOT NULL,
    "guests" integer DEFAULT 2,
    "gross_amount" numeric(10,2) NOT NULL,
    "airbnb_fee" numeric(10,2) DEFAULT 0,
    "cleaning_fee" numeric(10,2) DEFAULT 0,
    "net_amount" numeric(10,2) NOT NULL,
    "platform" "text" DEFAULT 'airbnb'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."airbnb_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_admins" (
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_rates" (
    "bank_id" "text" NOT NULL,
    "bank_name" "text" NOT NULL,
    "color" "text",
    "fixed_3yr" "text",
    "fixed_5yr" "text",
    "fixed_10yr" "text",
    "fixed_15yr" "text",
    "fixed_20yr" "text",
    "variable_spread_min" numeric,
    "variable_spread_max" numeric,
    "fixed_min" numeric,
    "max_ltv" integer,
    "max_years" integer,
    "max_amount" integer,
    "min_amount" integer,
    "green_discount" numeric,
    "spiti_mou" boolean DEFAULT false,
    "features" "text"[] DEFAULT '{}'::"text"[],
    "programs" "text"[] DEFAULT '{}'::"text"[],
    "fees" "text",
    "note" "text",
    "url" "text",
    "source_url" "text",
    "verified_at" "date",
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."bank_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "txn_date" "date",
    "description" "text",
    "amount" numeric NOT NULL,
    "dedup_hash" "text" NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bank_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_profiles" (
    "user_id" "uuid" NOT NULL,
    "doc_type" "text" DEFAULT 'receipt'::"text",
    "full_name" "text",
    "company_name" "text",
    "afm" "text",
    "doy" "text",
    "profession" "text",
    "address" "text",
    "city" "text",
    "postal_code" "text",
    "country" "text" DEFAULT 'GR'::"text",
    "phone" "text",
    "plan" "text" DEFAULT 'trial'::"text",
    "billing_cycle" "text" DEFAULT 'monthly'::"text",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "subscription_status" "text" DEFAULT 'trialing'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "owner_name" "text",
    "profile_type" "text" DEFAULT 'individual'::"text",
    "share_market_data" boolean DEFAULT true NOT NULL,
    "comp_plan" "text",
    "comp_until" timestamp with time zone,
    "comp_months_granted" integer DEFAULT 0,
    "comp_started_at" timestamp with time zone,
    "wants_mobile" boolean DEFAULT false,
    "full_name_changed_at" timestamp with time zone,
    "vat_number" "text"
);


ALTER TABLE "public"."billing_profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."billing_profiles"."share_market_data" IS 'Συγκατάθεση συμμετοχής στα ανώνυμα δεδομένα κοινότητας. false = εξαίρεση.';



CREATE TABLE IF NOT EXISTS "public"."bills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "type" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "due_date" "date" NOT NULL,
    "period" "text",
    "paid" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    "name" "text",
    "vat_rate" integer,
    "recurring" boolean DEFAULT false,
    "notes" "text",
    "kwh" numeric,
    "ert" numeric,
    "etmear" numeric,
    "dimotika" numeric,
    "paid_at" timestamp with time zone,
    "paid_by" "text" DEFAULT 'owner'::"text",
    "share_percent" numeric,
    "share_note" "text"
);


ALTER TABLE "public"."bills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bills_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "category" "text" NOT NULL,
    "month" integer NOT NULL,
    "year" integer DEFAULT EXTRACT(year FROM "now"()) NOT NULL,
    "amount" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "bills_history_month_check" CHECK ((("month" >= 0) AND ("month" <= 11)))
);


ALTER TABLE "public"."bills_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bills_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "section" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bills_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."book_closings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "locked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."book_closings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" DEFAULT 'reminder'::"text" NOT NULL,
    "event_date" "date" NOT NULL,
    "amount" numeric(10,2),
    "priority" "text" DEFAULT 'medium'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "recurring" boolean DEFAULT false,
    "recurring_interval" "text",
    "notes" "text",
    "source" "text" DEFAULT 'manual'::"text",
    "attachment_url" "text",
    "color" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "bill_id" "uuid",
    "event_time" "text",
    "duration_minutes" integer,
    "recurrence_until" "date",
    "recurrence_count" integer,
    "recurrence_exdates" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "contact_phone" "text",
    "contact_email" "text"
);


ALTER TABLE "public"."calendar_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_feed_tokens" (
    "user_id" "uuid" NOT NULL,
    "token" "text" DEFAULT ("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") || "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text")) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."calendar_feed_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkin_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" DEFAULT "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") NOT NULL,
    "property_id" "text",
    "client_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."checkin_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checklist_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "note" "text",
    "completed" boolean DEFAULT false,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "priority" "text" DEFAULT 'normal'::"text",
    "due_date" "date",
    "recurring" "text" DEFAULT 'none'::"text",
    "assigned_contact_id" "uuid",
    "assigned_contact_name" "text",
    "estimated_cost" numeric DEFAULT 0,
    "actual_cost" numeric DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text",
    "template_id" "text",
    "linked_expense_id" "uuid",
    "linked_event_id" "uuid",
    "sort_order" integer DEFAULT 0,
    "start_date" "date",
    "budget" numeric DEFAULT 0,
    "depends_on" "uuid",
    "calendar_event_id" "uuid",
    "expense_id" "uuid"
);


ALTER TABLE "public"."checklist_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "mime" "text",
    "size" bigint,
    "kind" "text" DEFAULT 'other'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "kind" "text" DEFAULT 'note'::"text",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_stays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "property_id" "text",
    "check_in" "date",
    "check_out" "date",
    "nights" integer,
    "guests" integer,
    "nightly_rate" numeric,
    "total" numeric,
    "channel" "text",
    "rating" integer,
    "damages" boolean DEFAULT false,
    "damage_cost" numeric,
    "damage_note" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_stays" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'owner'::"text" NOT NULL,
    "full_name" "text" NOT NULL,
    "afm" "text",
    "phone" "text",
    "email" "text",
    "notes" "text",
    "stage" "text" DEFAULT 'lead'::"text" NOT NULL,
    "deal_value" numeric,
    "next_action" "text",
    "next_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rating" integer,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "do_not_rent" boolean DEFAULT false,
    "address" "text",
    "id_number" "text",
    "nationality" "text",
    "budget" numeric,
    "needs" "text",
    "source" "text",
    "vip" boolean DEFAULT false,
    CONSTRAINT "clients_stage_chk" CHECK (("stage" = ANY (ARRAY['lead'::"text", 'viewing'::"text", 'offer'::"text", 'closed'::"text"]))),
    CONSTRAINT "clients_type_chk" CHECK (("type" = ANY (ARRAY['owner'::"text", 'lead'::"text", 'client'::"text"])))
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "role" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cron_secrets" (
    "name" "text" NOT NULL,
    "secret" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cron_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "body_html" "text" DEFAULT ''::"text" NOT NULL,
    "kind" "text" DEFAULT 'broadcast'::"text" NOT NULL,
    "recipient_count" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone
);


ALTER TABLE "public"."email_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_marketing_prefs" (
    "user_id" "uuid" NOT NULL,
    "product_news" boolean DEFAULT true NOT NULL,
    "market_news" boolean DEFAULT true NOT NULL,
    "unsubscribe_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_marketing_prefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_outbox" (
    "id" bigint NOT NULL,
    "copy_id" "text" NOT NULL,
    "to_email" "text" NOT NULL,
    "to_name" "text",
    "params" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "category" "text" DEFAULT 'marketing'::"text" NOT NULL,
    "priority" integer DEFAULT 4 NOT NULL,
    "send_window" "text",
    "digest_group" "text",
    "dedup_key" "text",
    "scheduled_for" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "sent_at" timestamp with time zone,
    "channel" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_outbox" OWNER TO "postgres";


ALTER TABLE "public"."email_outbox" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."email_outbox_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."email_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "email" "text" NOT NULL,
    "name" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error" "text",
    "resend_id" "text",
    "sent_at" timestamp with time zone
);


ALTER TABLE "public"."email_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."energy_tariffs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tariff_id" "text" NOT NULL,
    "valid_month" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_label" "text" NOT NULL,
    "name" "text" NOT NULL,
    "badge" "text" NOT NULL,
    "type" "text" NOT NULL,
    "kwh_day" numeric(10,5),
    "kwh_night" numeric(10,5),
    "kwh_tier2" numeric(10,5),
    "tier2_threshold" integer,
    "flat_monthly" numeric(10,2),
    "fixed" numeric(10,2) DEFAULT 0,
    "fixed_ebill" numeric(10,2),
    "contract_months" integer DEFAULT 0,
    "no_fixed" boolean DEFAULT false,
    "dynamic" boolean DEFAULT false,
    "source" "text" DEFAULT 'manual'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."energy_tariffs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "description" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "category" "text" NOT NULL,
    "date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expense_group" "text",
    "payment_method" "text",
    "installments" integer,
    "amount_upfront" numeric,
    "amount_per_installment" numeric,
    "cashback_pct" numeric,
    "cashback_amount" numeric,
    "original_price" numeric,
    "discount_amount" numeric,
    "vat_rate" numeric DEFAULT 24,
    "vat_amount" numeric,
    "energy_class" "text",
    "serial_number" "text",
    "warranty_months" integer,
    "purchase_year" integer,
    "model_sku" "text",
    "store_vendor" "text",
    "is_recurring" boolean DEFAULT false,
    "recurring_frequency" "text",
    "notes" "text",
    "paid" boolean DEFAULT true,
    "paid_by" "text" DEFAULT 'owner'::"text",
    "vehicle_lease_model" "text",
    "vehicle_lease_months" integer,
    "vehicle_lease_monthly" numeric,
    "vehicle_lease_type" "text",
    "vehicle_lease_count" integer,
    "broker_commission_pct" numeric,
    "broker_commission_amount" numeric,
    "travel_type" "text",
    "appliance_lease_months" integer,
    "appliance_lease_monthly" numeric,
    "exhibition_booth_cost" numeric,
    "exhibition_name" "text",
    "travel_destination" "text",
    "floor_type" "text",
    "attachment_url" "text",
    "bill_id" "uuid",
    "share_percent" numeric,
    "share_note" "text",
    "contact_id" "uuid"
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_campaign_winners" (
    "campaign_id" "text" NOT NULL,
    "user_id" "uuid",
    "drawn_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feedback_campaign_winners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text",
    "user_id" "uuid",
    "client_id" "uuid",
    "property_id" "text",
    "full_name" "text" NOT NULL,
    "id_number" "text",
    "nationality" "text",
    "birth_date" "date",
    "phone" "text",
    "email" "text",
    "arrival_date" "date",
    "guests_count" integer,
    "accepts_rules" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "privacy_consent" boolean DEFAULT false,
    "privacy_consent_at" timestamp with time zone
);


ALTER TABLE "public"."guest_checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ical_feeds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "property_id" "text" NOT NULL,
    "channel" "text" DEFAULT 'airbnb'::"text" NOT NULL,
    "url" "text" NOT NULL,
    "include_blocked" boolean DEFAULT false,
    "active" boolean DEFAULT true,
    "last_synced_at" timestamp with time zone,
    "last_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ical_feeds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "category" "text" NOT NULL,
    "acquisition" "text" DEFAULT 'purchase'::"text",
    "description" "text" NOT NULL,
    "brand" "text",
    "model" "text",
    "serial_number" "text",
    "energy_class" "text",
    "year_bought" integer,
    "value" numeric(10,2) DEFAULT 0,
    "quantity" integer DEFAULT 1,
    "useful_life" integer DEFAULT 10,
    "warranty_until" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_handovers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "text",
    "user_id" "uuid",
    "handover_type" "text" NOT NULL,
    "tenant_name" "text",
    "tenant_phone" "text",
    "handover_date" "date",
    "notes" "text",
    "items_snapshot" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_handovers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "text",
    "user_id" "text",
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "room" "text",
    "brand" "text",
    "model" "text",
    "serial_number" "text",
    "purchase_value" numeric(10,2),
    "current_value" numeric(10,2),
    "purchase_date" "date",
    "warranty_expiry" "date",
    "condition" "text" DEFAULT 'Καλή'::"text",
    "notes" "text",
    "photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "energy_class" "text",
    "power_watts" numeric(8,1),
    "daily_hours_use" numeric(4,1),
    "standby_watts" numeric(6,1),
    "replacement_cost" numeric(10,2),
    "smart_device" boolean DEFAULT false,
    "smart_notes" "text",
    "photos" "text"[] DEFAULT '{}'::"text"[],
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "age_display" "text",
    "provenance" "text" DEFAULT 'new'::"text",
    "original_price" numeric DEFAULT 0,
    "discount_pct" numeric DEFAULT 0,
    "store_vendor" "text" DEFAULT ''::"text",
    "receipt_number" "text" DEFAULT ''::"text",
    "receipt_doc_url" "text",
    "receipt_doc_name" "text"
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_maintenance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "item_id" "text" DEFAULT ''::"text",
    "item_name" "text" DEFAULT ''::"text",
    "task" "text" NOT NULL,
    "interval_months" integer DEFAULT 12,
    "last_done" "date",
    "next_due" "date",
    "notes" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "est_cost" numeric DEFAULT 0,
    "calendar_event_id" "uuid",
    "expense_id" "uuid"
);


ALTER TABLE "public"."inventory_maintenance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_repairs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid",
    "user_id" "uuid",
    "repair_date" "date",
    "cost" numeric(10,2),
    "technician" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_repairs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_counters" (
    "series" "text" NOT NULL,
    "year" integer NOT NULL,
    "last_no" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."invoice_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "number" "text" NOT NULL,
    "series" "text" NOT NULL,
    "year" integer NOT NULL,
    "user_id" "uuid",
    "country" "text",
    "vat_treatment" "text",
    "currency" "text" DEFAULT 'EUR'::"text",
    "net" numeric(12,2),
    "vat_pct" numeric(5,2),
    "vat_amount" numeric(12,2),
    "gross" numeric(12,2),
    "stripe_ref" "text",
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."issued_documents" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "doc_type" "text" NOT NULL,
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "period" "text" DEFAULT ''::"text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "checksum" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."issued_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "bank" "text",
    "loan_amount" numeric(12,2),
    "down_payment" numeric(12,2),
    "rate_type" "text" DEFAULT 'fixed'::"text",
    "fixed_rate" numeric(6,4),
    "euribor" numeric(6,4) DEFAULT 2.08,
    "spread" numeric(6,4) DEFAULT 2.5,
    "years" integer DEFAULT 20,
    "start_date" "date",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."loans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "text" NOT NULL,
    "user_id" "uuid",
    "token" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "contact" "text",
    "status" "text" DEFAULT 'new'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid",
    "category" "text",
    "resolved_at" timestamp with time zone,
    "photos" "jsonb" DEFAULT '[]'::"jsonb",
    "assignee_name" "text",
    "assignee_contact" "text"
);


ALTER TABLE "public"."maintenance_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "due_date" "date" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text",
    "completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."maintenance_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_rates" (
    "id" bigint NOT NULL,
    "euribor_1m" numeric,
    "euribor_3m" numeric,
    "euribor_6m" numeric,
    "euribor_12m" numeric,
    "ecb_rate" numeric,
    "ecb_dfl" numeric,
    "bog_housing_new" numeric,
    "bog_housing_stock" numeric,
    "source_euribor" "text",
    "source_bog" "text",
    "rate_changed" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."market_rates" OWNER TO "postgres";


ALTER TABLE "public"."market_rates" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."market_rates_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."messaging_prefs" (
    "user_id" "uuid" NOT NULL,
    "wants_email" boolean DEFAULT true NOT NULL,
    "wants_push" boolean DEFAULT false NOT NULL,
    "wants_viber" boolean DEFAULT false NOT NULL,
    "wants_whatsapp" boolean DEFAULT false NOT NULL,
    "wants_imessage" boolean DEFAULT false NOT NULL,
    "phone_e164" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."messaging_prefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mobile_waitlist" (
    "user_id" "uuid" NOT NULL,
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notified_at" timestamp with time zone
);


ALTER TABLE "public"."mobile_waitlist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "reminder_type" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email_enabled" boolean DEFAULT true,
    "reminder_7days" boolean DEFAULT true,
    "reminder_3days" boolean DEFAULT true,
    "reminder_1day" boolean DEFAULT true,
    "reminder_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "dunning_enabled" boolean DEFAULT true,
    "dunning_every_days" integer DEFAULT 7,
    "dunning_max" integer DEFAULT 3
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_progress" (
    "user_id" "uuid" NOT NULL,
    "welcomed" boolean DEFAULT false,
    "first_property" boolean DEFAULT false,
    "demo_seen" boolean DEFAULT false,
    "completed" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."onboarding_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'invited'::"text" NOT NULL,
    "invited_at" timestamp with time zone DEFAULT "now"(),
    "joined_at" timestamp with time zone,
    "can_edit" boolean DEFAULT false,
    "edit_requested_at" timestamp with time zone
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portal_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" DEFAULT "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") NOT NULL,
    "property_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "pin_hash" "text",
    "payment_link" "text"
);


ALTER TABLE "public"."portal_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_settings" (
    "user_id" "uuid" NOT NULL,
    "property_id" "text" NOT NULL,
    "base" numeric,
    "min_price" numeric,
    "max_price" numeric,
    "weekend_premium" numeric DEFAULT 0.18,
    "min_stay" integer DEFAULT 1,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pricing_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body_html" "text" DEFAULT ''::"text" NOT NULL,
    "cta_label" "text",
    "cta_url" "text",
    "published" boolean DEFAULT false NOT NULL,
    "emailed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."property_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."property_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."property_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "kind" "text" DEFAULT 'document'::"text" NOT NULL,
    "category" "text",
    "title" "text",
    "notes" "text",
    "doc_date" "date",
    "file_path" "text" NOT NULL,
    "file_name" "text",
    "mime" "text",
    "size_bytes" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "supplier" "text"
);


ALTER TABLE "public"."property_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."property_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "owner_name" "text",
    "owner_afm" "text",
    "owner_phone" "text",
    "owner_email" "text",
    "electricity_provider" "text",
    "water_provider" "text",
    "internet_provider" "text",
    "internet_plan" "text",
    "property_manager" "text",
    "property_manager_phone" "text",
    "insurance_company" "text",
    "insurance_policy" "text",
    "insurance_expiry" "date",
    "notes" "text"
);


ALTER TABLE "public"."property_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_devices" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_devices" OWNER TO "postgres";


ALTER TABLE "public"."push_devices" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."push_devices_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."referral_codes" (
    "user_id" "uuid" NOT NULL,
    "code" "text" DEFAULT "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 8)) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."referral_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_partners" (
    "user_id" "uuid" NOT NULL,
    "earned_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."referral_partners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "referral_id" "uuid",
    "kind" "text" NOT NULL,
    "months" integer DEFAULT 0,
    "amount_eur" numeric DEFAULT 0,
    "tier" "text" DEFAULT ''::"text",
    "reason" "text" DEFAULT ''::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."referral_rewards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "referred_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "referrer_user_id" "uuid",
    "activated_at" timestamp with time zone
);


ALTER TABLE "public"."referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rent_comparables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "title" "text",
    "area" "text",
    "sqm" numeric DEFAULT 0,
    "rent" numeric DEFAULT 0,
    "rent_per_sqm" numeric DEFAULT 0,
    "distance" "text",
    "condition" "text" DEFAULT 'good'::"text",
    "source" "text" DEFAULT 'spitogatos'::"text",
    "url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "listing_type" "text" DEFAULT 'rent'::"text",
    "asking_price" numeric DEFAULT 0,
    "price_per_sqm" numeric DEFAULT 0,
    "days_on_market" integer DEFAULT 0,
    "sold_price" numeric DEFAULT 0,
    CONSTRAINT "rent_comparables_listing_type_chk" CHECK (("listing_type" = ANY (ARRAY['rent'::"text", 'sale'::"text"])))
);


ALTER TABLE "public"."rent_comparables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rent_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "target_rent" numeric(10,2),
    "actual_rent" numeric(10,2),
    "tenant_name" "text",
    "deposit" numeric(10,2),
    "lease_start" "date",
    "lease_end" "date",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rent_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rent_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "payment_date" "date" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "period" "text",
    "status" "text" DEFAULT 'paid'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "method" "text",
    "receipt_url" "text",
    "receipt_doc_id" "uuid",
    "due_date" "date",
    "base_rent" numeric,
    "services_charge" numeric,
    "tenant_declared" boolean DEFAULT false,
    "tenant_declared_at" timestamp with time zone,
    "tenant_note" "text"
);


ALTER TABLE "public"."rent_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_branding" (
    "user_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true,
    "company_name" "text",
    "logo_url" "text",
    "accent_color" "text" DEFAULT '#1a73e8'::"text",
    "phone" "text",
    "email" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "report_branding_accent_hex" CHECK ((("accent_color" IS NULL) OR ("accent_color" ~* '^#[0-9a-f]{6}$'::"text")))
);


ALTER TABLE "public"."report_branding" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_comm_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "date" "date" NOT NULL,
    "outcome" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tenant_comm_log_type_check" CHECK (("type" = ANY (ARRAY['call'::"text", 'email'::"text", 'sms'::"text", 'meeting'::"text", 'note'::"text"])))
);


ALTER TABLE "public"."tenant_comm_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_damages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "property_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "occurred_on" "date",
    "description" "text" NOT NULL,
    "cost" numeric,
    "charged_to_tenant" boolean DEFAULT false,
    "repaired" boolean DEFAULT false,
    "repaired_on" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_damages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid",
    "user_id" "uuid",
    "full_name" "text",
    "nationality" "text",
    "profession" "text",
    "employer" "text",
    "phone" "text",
    "email" "text",
    "afm" "text",
    "id_number" "text",
    "lease_start" "date",
    "lease_end" "date",
    "monthly_rent" numeric(10,2),
    "deposit" numeric(10,2),
    "payment_day" integer DEFAULT 1,
    "contract_type" "text" DEFAULT 'annual'::"text",
    "status" "text" DEFAULT 'searching'::"text",
    "mi_home_app" boolean DEFAULT false,
    "penalty_early_exit" numeric(10,2),
    "kwh_limit" integer DEFAULT 150,
    "kwh_overage_price" numeric(6,4) DEFAULT 0.19,
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "lease_doc_url" "text",
    "lease_doc_name" "text",
    "lease_doc_external_url" "text",
    "internet_provider" "text",
    "internet_plan" "text",
    "internet_cost" numeric,
    "electricity_provider" "text",
    "electricity_tariff" "text",
    "electricity_monthly_limit" numeric,
    "water_monthly_limit" numeric,
    "streaming_owner_cost" numeric,
    "streaming_charged_to_tenant" numeric,
    "cleaning_owner_cost" numeric,
    "cleaning_charged_to_tenant" numeric,
    "welcome_basket" boolean DEFAULT false,
    "welcome_basket_amount" numeric,
    "welcome_basket_contents" "text",
    "ac_service_by" "text" DEFAULT 'owner'::"text",
    "solar_service_by" "text" DEFAULT 'owner'::"text",
    "pest_control_by" "text" DEFAULT 'owner'::"text",
    "pest_control_frequency" "text",
    "heat_pump_service_by" "text" DEFAULT 'owner'::"text",
    "solar_panels_service_by" "text" DEFAULT 'owner'::"text",
    "annual_services_notes" "text",
    "parking_included" boolean DEFAULT false,
    "parking_extra" boolean DEFAULT false,
    "parking_extra_price" numeric,
    "parking_type" "text",
    "parking_has_electricity" boolean DEFAULT false,
    "parking_notes" "text",
    "ac_service_frequency" "text" DEFAULT 'annual'::"text",
    "solar_service_frequency" "text" DEFAULT 'annual'::"text",
    "heat_pump_service_frequency" "text" DEFAULT 'annual'::"text",
    "solar_panels_service_frequency" "text" DEFAULT 'annual'::"text",
    "prepay_option" boolean DEFAULT false,
    "prepay_months" integer,
    "prepay_discount_pct" numeric,
    "prepay_invested" boolean DEFAULT false,
    "prepay_invest_rate" numeric,
    "prepay_invest_type" "text",
    "prepay_invest_term" "text",
    "deposit_invest_rate" numeric,
    "deposit_invest_type" "text",
    "deposit_invest_term" "text",
    "all_inclusive" boolean DEFAULT false,
    "kwh_price" numeric,
    "e_payment" boolean DEFAULT true,
    "streaming" "jsonb",
    "cleaning" "jsonb",
    "extra_perks" "text",
    "deposit_returned" boolean DEFAULT false,
    "deposit_return_date" "date",
    "deposit_invested" boolean DEFAULT false,
    "phone_work" "text",
    "id_doc_type" "text",
    "id_doc_number" "text",
    "iban" "text",
    "lease_type" "text",
    "custom_lease_days" integer,
    "payment_frequency" "text" DEFAULT 'monthly'::"text",
    "deposit_amount" numeric,
    "lease_category" "text",
    "rent_due_day" integer,
    "deposit_method" "text",
    "deposit_paid_on" "date",
    "move_out_date" "date",
    "ac_service_owner_pct" numeric,
    "solar_service_owner_pct" numeric,
    "heat_pump_service_owner_pct" numeric,
    "solar_panels_service_owner_pct" numeric,
    "pest_control_owner_pct" numeric,
    "furnishing" "text",
    "rent_iban" "text"
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text",
    "body" "text" NOT NULL,
    "word_count" integer DEFAULT 0 NOT NULL,
    "target" "text" DEFAULT 'general'::"text" NOT NULL,
    "campaign_id" "text",
    "in_pool" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_properties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "prop_type" "text" DEFAULT 'Κατοικία'::"text" NOT NULL,
    "address" "text" DEFAULT ''::"text",
    "sqm" numeric DEFAULT 0 NOT NULL,
    "ownership" numeric DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "purchase_price" numeric(12,2),
    "purchase_date" "date",
    "obj_value" numeric(12,2),
    "enfia" numeric(10,2),
    "insurance_company" "text",
    "insurance_amount" numeric(10,2),
    "insurance_expiry" "date",
    "pea_class" "text",
    "year_built" integer,
    "atak" "text",
    "floor" "text",
    "heating" "text",
    "status" "text" DEFAULT 'active'::"text",
    "notes" "text",
    "target_rent" numeric(10,2),
    "status_detail" "text" DEFAULT 'vacant'::"text",
    "postal_code" "text",
    "value" numeric,
    "parking_spaces" integer,
    "storage_sqm" numeric,
    "bedrooms" integer,
    "rental_mode" "text",
    "client_id" "uuid",
    "co_owners" "jsonb"
);


ALTER TABLE "public"."user_properties" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_properties"."status_detail" IS 'vacant=Κενό/Προς ενοικίαση, rented=Ενοικιασμένο, own_use=Ιδιοκατοίκηση, renovation=Ανακαίνιση, for_sale=Προς Πώληση, seasonal=Εποχιακό, disputed=Νομικό ζήτημα';



COMMENT ON COLUMN "public"."user_properties"."co_owners" IS 'Ονόματα συνιδιοκτητών (jsonb array of text) όταν το ownership είναι < 100%.';



ALTER TABLE ONLY "public"."accountant_links"
    ADD CONSTRAINT "accountant_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accountant_links"
    ADD CONSTRAINT "accountant_links_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."accountant_links"
    ADD CONSTRAINT "accountant_links_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."airbnb_bookings"
    ADD CONSTRAINT "airbnb_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_admins"
    ADD CONSTRAINT "app_admins_pkey" PRIMARY KEY ("email");



ALTER TABLE ONLY "public"."bank_rates"
    ADD CONSTRAINT "bank_rates_pkey" PRIMARY KEY ("bank_id");



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_profiles"
    ADD CONSTRAINT "billing_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."bills_history"
    ADD CONSTRAINT "bills_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bills_history"
    ADD CONSTRAINT "bills_history_property_id_category_month_year_key" UNIQUE ("property_id", "category", "month", "year");



ALTER TABLE ONLY "public"."bills"
    ADD CONSTRAINT "bills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bills_settings"
    ADD CONSTRAINT "bills_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bills_settings"
    ADD CONSTRAINT "bills_settings_property_id_section_key" UNIQUE ("property_id", "section");



ALTER TABLE ONLY "public"."book_closings"
    ADD CONSTRAINT "book_closings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_feed_tokens"
    ADD CONSTRAINT "calendar_feed_tokens_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."calendar_feed_tokens"
    ADD CONSTRAINT "calendar_feed_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."checkin_links"
    ADD CONSTRAINT "checkin_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_links"
    ADD CONSTRAINT "checkin_links_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."checkin_links"
    ADD CONSTRAINT "checkin_links_user_id_client_id_key" UNIQUE ("user_id", "client_id");



ALTER TABLE ONLY "public"."checklist_items"
    ADD CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_documents"
    ADD CONSTRAINT "client_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_notes"
    ADD CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_stays"
    ADD CONSTRAINT "client_stays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cron_secrets"
    ADD CONSTRAINT "cron_secrets_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."email_campaigns"
    ADD CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_marketing_prefs"
    ADD CONSTRAINT "email_marketing_prefs_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."email_outbox"
    ADD CONSTRAINT "email_outbox_dedup_key_key" UNIQUE ("dedup_key");



ALTER TABLE ONLY "public"."email_outbox"
    ADD CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_recipients"
    ADD CONSTRAINT "email_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."energy_tariffs"
    ADD CONSTRAINT "energy_tariffs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."energy_tariffs"
    ADD CONSTRAINT "energy_tariffs_tariff_id_valid_month_key" UNIQUE ("tariff_id", "valid_month");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_campaign_winners"
    ADD CONSTRAINT "feedback_campaign_winners_pkey" PRIMARY KEY ("campaign_id");



ALTER TABLE ONLY "public"."guest_checkins"
    ADD CONSTRAINT "guest_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ical_feeds"
    ADD CONSTRAINT "ical_feeds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ical_feeds"
    ADD CONSTRAINT "ical_feeds_user_id_property_id_url_key" UNIQUE ("user_id", "property_id", "url");



ALTER TABLE ONLY "public"."inventory_handovers"
    ADD CONSTRAINT "inventory_handovers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_maintenance"
    ADD CONSTRAINT "inventory_maintenance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_repairs"
    ADD CONSTRAINT "inventory_repairs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_counters"
    ADD CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("series", "year");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_number_key" UNIQUE ("number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."issued_documents"
    ADD CONSTRAINT "issued_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loan_programs"
    ADD CONSTRAINT "loan_programs_pkey" PRIMARY KEY ("program_id");



ALTER TABLE ONLY "public"."loans"
    ADD CONSTRAINT "loans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_requests"
    ADD CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_tasks"
    ADD CONSTRAINT "maintenance_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_rates"
    ADD CONSTRAINT "market_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messaging_prefs"
    ADD CONSTRAINT "messaging_prefs_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."mobile_waitlist"
    ADD CONSTRAINT "mobile_waitlist_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_event_id_reminder_type_key" UNIQUE ("event_id", "reminder_type");



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_org_id_email_key" UNIQUE ("org_id", "email");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portal_links"
    ADD CONSTRAINT "portal_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."portal_links"
    ADD CONSTRAINT "portal_links_property_id_user_id_key" UNIQUE ("property_id", "user_id");



ALTER TABLE ONLY "public"."portal_links"
    ADD CONSTRAINT "portal_links_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."pricing_settings"
    ADD CONSTRAINT "pricing_settings_pkey" PRIMARY KEY ("user_id", "property_id");



ALTER TABLE ONLY "public"."product_updates"
    ADD CONSTRAINT "product_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."property_data"
    ADD CONSTRAINT "property_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."property_documents"
    ADD CONSTRAINT "property_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."property_settings"
    ADD CONSTRAINT "property_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."property_settings"
    ADD CONSTRAINT "property_settings_property_id_key" UNIQUE ("property_id");



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_user_id_token_key" UNIQUE ("user_id", "token");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."referral_partners"
    ADD CONSTRAINT "referral_partners_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referred_user_id_key" UNIQUE ("referred_user_id");



ALTER TABLE ONLY "public"."rent_comparables"
    ADD CONSTRAINT "rent_comparables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rent_config"
    ADD CONSTRAINT "rent_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rent_config"
    ADD CONSTRAINT "rent_config_property_id_key" UNIQUE ("property_id");



ALTER TABLE ONLY "public"."rent_payments"
    ADD CONSTRAINT "rent_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_branding"
    ADD CONSTRAINT "report_branding_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."tenant_comm_log"
    ADD CONSTRAINT "tenant_comm_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_damages"
    ADD CONSTRAINT "tenant_damages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_properties"
    ADD CONSTRAINT "user_properties_pkey" PRIMARY KEY ("id");



CREATE INDEX "bills_created_at_idx" ON "public"."bills" USING "btree" ("created_at");



CREATE INDEX "bills_due_date_idx" ON "public"."bills" USING "btree" ("due_date");



CREATE INDEX "bills_history_prop_idx" ON "public"."bills_history" USING "btree" ("property_id");



CREATE INDEX "bills_history_property_idx" ON "public"."bills_history" USING "btree" ("property_id", "year", "month");



CREATE INDEX "bills_history_year_idx" ON "public"."bills_history" USING "btree" ("property_id", "year");



CREATE INDEX "bills_paid_idx" ON "public"."bills" USING "btree" ("paid");



CREATE INDEX "bills_property_id_idx" ON "public"."bills" USING "btree" ("property_id");



CREATE INDEX "bills_settings_prop_idx" ON "public"."bills_settings" USING "btree" ("property_id");



CREATE INDEX "bills_settings_property_section_idx" ON "public"."bills_settings" USING "btree" ("property_id", "section");



CREATE INDEX "bills_user_id_idx" ON "public"."bills" USING "btree" ("user_id");



CREATE INDEX "calendar_events_bill_id_idx" ON "public"."calendar_events" USING "btree" ("bill_id");



CREATE INDEX "client_documents_client_idx" ON "public"."client_documents" USING "btree" ("client_id");



CREATE INDEX "client_notes_client_idx" ON "public"."client_notes" USING "btree" ("client_id");



CREATE INDEX "client_stays_client_idx" ON "public"."client_stays" USING "btree" ("client_id");



CREATE INDEX "client_stays_user_idx" ON "public"."client_stays" USING "btree" ("user_id");



CREATE INDEX "clients_user_idx" ON "public"."clients" USING "btree" ("user_id");



CREATE INDEX "email_campaigns_user_idx" ON "public"."email_campaigns" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "email_marketing_prefs_token_idx" ON "public"."email_marketing_prefs" USING "btree" ("unsubscribe_token");



CREATE INDEX "email_outbox_due_idx" ON "public"."email_outbox" USING "btree" ("status", "scheduled_for");



CREATE INDEX "email_outbox_recipient_idx" ON "public"."email_outbox" USING "btree" ("to_email", "category", "status");



CREATE INDEX "email_recipients_camp_idx" ON "public"."email_recipients" USING "btree" ("campaign_id");



CREATE INDEX "expenses_bill_id_idx" ON "public"."expenses" USING "btree" ("bill_id");



CREATE INDEX "ical_feeds_user_idx" ON "public"."ical_feeds" USING "btree" ("user_id");



CREATE INDEX "idx_activity_actor" ON "public"."activity_log" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "idx_activity_user" ON "public"."activity_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_bank_txn_user" ON "public"."bank_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_bills_category" ON "public"."bills" USING "btree" ("category");



CREATE INDEX "idx_bills_history_user_id" ON "public"."bills_history" USING "btree" ("user_id");



CREATE INDEX "idx_bills_recurring" ON "public"."bills" USING "btree" ("recurring") WHERE ("recurring" = true);



CREATE INDEX "idx_bills_settings_user_id" ON "public"."bills_settings" USING "btree" ("user_id");



CREATE INDEX "idx_calendar_events_user_id" ON "public"."calendar_events" USING "btree" ("user_id");



CREATE INDEX "idx_checkin_links_client_id" ON "public"."checkin_links" USING "btree" ("client_id");



CREATE INDEX "idx_checklist_items_property_id" ON "public"."checklist_items" USING "btree" ("property_id");



CREATE INDEX "idx_checklist_items_user_id" ON "public"."checklist_items" USING "btree" ("user_id");



CREATE INDEX "idx_client_documents_user_id" ON "public"."client_documents" USING "btree" ("user_id");



CREATE INDEX "idx_client_notes_user_id" ON "public"."client_notes" USING "btree" ("user_id");



CREATE INDEX "idx_contacts_property_id" ON "public"."contacts" USING "btree" ("property_id");



CREATE INDEX "idx_contacts_user_id" ON "public"."contacts" USING "btree" ("user_id");



CREATE INDEX "idx_email_recipients_user_id" ON "public"."email_recipients" USING "btree" ("user_id");



CREATE INDEX "idx_energy_tariffs_month" ON "public"."energy_tariffs" USING "btree" ("valid_month");



CREATE INDEX "idx_energy_tariffs_provider" ON "public"."energy_tariffs" USING "btree" ("provider");



CREATE INDEX "idx_expenses_contact" ON "public"."expenses" USING "btree" ("contact_id");



CREATE INDEX "idx_expenses_property_id" ON "public"."expenses" USING "btree" ("property_id");



CREATE INDEX "idx_expenses_user_id" ON "public"."expenses" USING "btree" ("user_id");



CREATE INDEX "idx_feedback_campaign_winners_user_id" ON "public"."feedback_campaign_winners" USING "btree" ("user_id");



CREATE INDEX "idx_inventory_handovers_user_id" ON "public"."inventory_handovers" USING "btree" ("user_id");



CREATE INDEX "idx_inventory_property_id" ON "public"."inventory" USING "btree" ("property_id");



CREATE INDEX "idx_inventory_repairs_item_id" ON "public"."inventory_repairs" USING "btree" ("item_id");



CREATE INDEX "idx_inventory_repairs_user_id" ON "public"."inventory_repairs" USING "btree" ("user_id");



CREATE INDEX "idx_inventory_user_id" ON "public"."inventory" USING "btree" ("user_id");



CREATE INDEX "idx_invoices_user" ON "public"."invoices" USING "btree" ("user_id", "issued_at" DESC);



CREATE INDEX "idx_loans_property_id" ON "public"."loans" USING "btree" ("property_id");



CREATE INDEX "idx_loans_user_id" ON "public"."loans" USING "btree" ("user_id");



CREATE INDEX "idx_maintenance_tasks_property_id" ON "public"."maintenance_tasks" USING "btree" ("property_id");



CREATE INDEX "idx_maintenance_tasks_user_id" ON "public"."maintenance_tasks" USING "btree" ("user_id");



CREATE INDEX "idx_notif_log_dedup" ON "public"."notification_log" USING "btree" ("reminder_type", "event_id");



CREATE INDEX "idx_portal_links_user_id" ON "public"."portal_links" USING "btree" ("user_id");



CREATE INDEX "idx_property_data_user_id" ON "public"."property_data" USING "btree" ("user_id");



CREATE INDEX "idx_property_settings_user_id" ON "public"."property_settings" USING "btree" ("user_id");



CREATE INDEX "idx_referral_rewards_referral_id" ON "public"."referral_rewards" USING "btree" ("referral_id");



CREATE INDEX "idx_rent_comparables_user_id" ON "public"."rent_comparables" USING "btree" ("user_id");



CREATE INDEX "idx_rent_config_user_id" ON "public"."rent_config" USING "btree" ("user_id");



CREATE INDEX "idx_rent_payments_property_id" ON "public"."rent_payments" USING "btree" ("property_id");



CREATE INDEX "idx_rent_payments_user_id" ON "public"."rent_payments" USING "btree" ("user_id");



CREATE INDEX "idx_user_feedback_campaign" ON "public"."user_feedback" USING "btree" ("campaign_id") WHERE "in_pool";



CREATE INDEX "idx_user_feedback_user" ON "public"."user_feedback" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_user_properties_user_id" ON "public"."user_properties" USING "btree" ("user_id");



CREATE INDEX "issued_documents_user_idx" ON "public"."issued_documents" USING "btree" ("user_id", "issued_at" DESC);



CREATE INDEX "organization_members_user_idx" ON "public"."organization_members" USING "btree" ("user_id");



CREATE UNIQUE INDEX "organizations_owner_uidx" ON "public"."organizations" USING "btree" ("owner_user_id");



CREATE INDEX "property_documents_property_idx" ON "public"."property_documents" USING "btree" ("property_id", "created_at" DESC);



CREATE INDEX "property_documents_supplier_idx" ON "public"."property_documents" USING "btree" ("property_id", "supplier");



CREATE UNIQUE INDEX "referral_rewards_referral_reason_uidx" ON "public"."referral_rewards" USING "btree" ("user_id", "referral_id", "reason") WHERE ("referral_id" IS NOT NULL);



CREATE INDEX "referrals_activated_idx" ON "public"."referrals" USING "btree" ("referrer_user_id", "activated_at");



CREATE INDEX "referrals_referrer_idx" ON "public"."referrals" USING "btree" ("referrer_user_id");



CREATE INDEX "rent_comparables_property_idx" ON "public"."rent_comparables" USING "btree" ("property_id");



CREATE INDEX "rent_comparables_type_idx" ON "public"."rent_comparables" USING "btree" ("property_id", "listing_type");



CREATE INDEX "tenant_damages_property_idx" ON "public"."tenant_damages" USING "btree" ("property_id");



CREATE INDEX "tenant_damages_tenant_idx" ON "public"."tenant_damages" USING "btree" ("tenant_id");



CREATE INDEX "tenants_property_idx" ON "public"."tenants" USING "btree" ("property_id");



CREATE INDEX "tenants_user_idx" ON "public"."tenants" USING "btree" ("user_id");



CREATE UNIQUE INDEX "uq_bank_txn_dedup" ON "public"."bank_transactions" USING "btree" ("user_id", "dedup_hash");



CREATE UNIQUE INDEX "uq_book_closing" ON "public"."book_closings" USING "btree" ("user_id", "property_id", "year");



CREATE INDEX "user_properties_client_idx" ON "public"."user_properties" USING "btree" ("client_id");



CREATE OR REPLACE TRIGGER "bills_settings_updated_at" BEFORE UPDATE ON "public"."bills_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "bills_updated_at" BEFORE UPDATE ON "public"."bills" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "lock_billing_plan_trg" BEFORE INSERT OR UPDATE ON "public"."billing_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."lock_billing_plan"();



CREATE OR REPLACE TRIGGER "trg_enforce_property_limit" BEFORE INSERT ON "public"."user_properties" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_property_limit"();



ALTER TABLE ONLY "public"."accountant_links"
    ADD CONSTRAINT "accountant_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_profiles"
    ADD CONSTRAINT "billing_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bills_history"
    ADD CONSTRAINT "bills_history_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bills_history"
    ADD CONSTRAINT "bills_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bills"
    ADD CONSTRAINT "bills_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bills_settings"
    ADD CONSTRAINT "bills_settings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bills_settings"
    ADD CONSTRAINT "bills_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bills"
    ADD CONSTRAINT "bills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."book_closings"
    ADD CONSTRAINT "book_closings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_feed_tokens"
    ADD CONSTRAINT "calendar_feed_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkin_links"
    ADD CONSTRAINT "checkin_links_client_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checkin_links"
    ADD CONSTRAINT "checkin_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checkin_links"
    ADD CONSTRAINT "checkin_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_items"
    ADD CONSTRAINT "checklist_items_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_items"
    ADD CONSTRAINT "checklist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_documents"
    ADD CONSTRAINT "client_documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_documents"
    ADD CONSTRAINT "client_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_notes"
    ADD CONSTRAINT "client_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_notes"
    ADD CONSTRAINT "client_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_stays"
    ADD CONSTRAINT "client_stays_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_stays"
    ADD CONSTRAINT "client_stays_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_campaigns"
    ADD CONSTRAINT "email_campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_marketing_prefs"
    ADD CONSTRAINT "email_marketing_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_recipients"
    ADD CONSTRAINT "email_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_recipients"
    ADD CONSTRAINT "email_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_campaign_winners"
    ADD CONSTRAINT "feedback_campaign_winners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ical_feeds"
    ADD CONSTRAINT "ical_feeds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_handovers"
    ADD CONSTRAINT "inventory_handovers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_repairs"
    ADD CONSTRAINT "inventory_repairs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_repairs"
    ADD CONSTRAINT "inventory_repairs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issued_documents"
    ADD CONSTRAINT "issued_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loans"
    ADD CONSTRAINT "loans_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loans"
    ADD CONSTRAINT "loans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."maintenance_tasks"
    ADD CONSTRAINT "maintenance_tasks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."maintenance_tasks"
    ADD CONSTRAINT "maintenance_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messaging_prefs"
    ADD CONSTRAINT "messaging_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mobile_waitlist"
    ADD CONSTRAINT "mobile_waitlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_progress"
    ADD CONSTRAINT "onboarding_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portal_links"
    ADD CONSTRAINT "portal_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_settings"
    ADD CONSTRAINT "pricing_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."property_data"
    ADD CONSTRAINT "property_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."property_settings"
    ADD CONSTRAINT "property_settings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."property_settings"
    ADD CONSTRAINT "property_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_partners"
    ADD CONSTRAINT "referral_partners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rent_comparables"
    ADD CONSTRAINT "rent_comparables_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_comparables"
    ADD CONSTRAINT "rent_comparables_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_config"
    ADD CONSTRAINT "rent_config_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_config"
    ADD CONSTRAINT "rent_config_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_payments"
    ADD CONSTRAINT "rent_payments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rent_payments"
    ADD CONSTRAINT "rent_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_branding"
    ADD CONSTRAINT "report_branding_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_damages"
    ADD CONSTRAINT "tenant_damages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."user_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_properties"
    ADD CONSTRAINT "user_properties_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_properties"
    ADD CONSTRAINT "user_properties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Service write inventory_handovers" ON "public"."inventory_handovers" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Users see own inventory" ON "public"."inventory" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."accountant_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_select_own" ON "public"."activity_log" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("actor_id" = "auth"."uid"())));



ALTER TABLE "public"."airbnb_bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_admins_self" ON "public"."app_admins" FOR SELECT TO "authenticated" USING (("email" = ("auth"."jwt"() ->> 'email'::"text")));



ALTER TABLE "public"."bank_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bank_rates_admin_write" ON "public"."bank_rates" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_admins" "a"
  WHERE ("a"."email" = ("auth"."jwt"() ->> 'email'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_admins" "a"
  WHERE ("a"."email" = ("auth"."jwt"() ->> 'email'::"text")))));



CREATE POLICY "bank_rates_read" ON "public"."bank_rates" FOR SELECT USING (true);



ALTER TABLE "public"."bank_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bills_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bills_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."book_closings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calendar_feed_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkin_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checklist_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_stays" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cron_secrets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_marketing_prefs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."energy_tariffs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "energy_tariffs_public_read" ON "public"."energy_tariffs" FOR SELECT USING (true);



CREATE POLICY "energy_tariffs_service_write" ON "public"."energy_tariffs" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_campaign_winners" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feedback_select_own" ON "public"."user_feedback" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."guest_checkins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ical_feeds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_handovers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_maintenance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_repairs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_select_own" ON "public"."invoices" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."issued_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loan_programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loan_programs_read" ON "public"."loan_programs" FOR SELECT USING (true);



ALTER TABLE "public"."loans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."maintenance_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."maintenance_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."market_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "market_rates_read" ON "public"."market_rates" FOR SELECT USING (true);



ALTER TABLE "public"."messaging_prefs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messaging_prefs_own" ON "public"."messaging_prefs" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."mobile_waitlist" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mobile_waitlist_select_own" ON "public"."mobile_waitlist" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."notification_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_del_bills" ON "public"."bills" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("bills"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_del_checklist_items" ON "public"."checklist_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("checklist_items"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_del_client_stays" ON "public"."client_stays" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "client_stays"."property_id") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_del_clients" ON "public"."clients" FOR DELETE USING (("user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")));



CREATE POLICY "org_del_contacts" ON "public"."contacts" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("contacts"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_del_expenses" ON "public"."expenses" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("expenses"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_del_inventory_items" ON "public"."inventory_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_items"."property_id") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_del_inventory_maintenance" ON "public"."inventory_maintenance" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_maintenance"."property_id") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_del_loans" ON "public"."loans" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("loans"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_del_maintenance_tasks" ON "public"."maintenance_tasks" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("maintenance_tasks"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_del_properties" ON "public"."user_properties" FOR DELETE USING (("user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")));



CREATE POLICY "org_del_property_documents" ON "public"."property_documents" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("property_documents"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_del_property_settings" ON "public"."property_settings" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("property_settings"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_del_tenants" ON "public"."tenants" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("tenants"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_edit_bills" ON "public"."bills" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("bills"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("bills"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_edit_checklist_items" ON "public"."checklist_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("checklist_items"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("checklist_items"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_edit_client_stays" ON "public"."client_stays" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "client_stays"."property_id") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "client_stays"."property_id") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_edit_clients" ON "public"."clients" FOR UPDATE USING (("user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))) WITH CHECK (("user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")));



CREATE POLICY "org_edit_contacts" ON "public"."contacts" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("contacts"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("contacts"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_edit_expenses" ON "public"."expenses" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("expenses"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("expenses"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_edit_inventory_items" ON "public"."inventory_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_items"."property_id") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_items"."property_id") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_edit_inventory_maintenance" ON "public"."inventory_maintenance" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_maintenance"."property_id") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_maintenance"."property_id") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_edit_loans" ON "public"."loans" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("loans"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("loans"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_edit_maintenance_tasks" ON "public"."maintenance_tasks" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("maintenance_tasks"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("maintenance_tasks"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_edit_properties" ON "public"."user_properties" FOR UPDATE USING (("user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))) WITH CHECK (("user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")));



CREATE POLICY "org_edit_property_documents" ON "public"."property_documents" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("property_documents"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("property_documents"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_edit_property_settings" ON "public"."property_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("property_settings"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("property_settings"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_edit_tenants" ON "public"."tenants" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("tenants"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("tenants"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_editor_owner_ids"("auth"."uid"()) AS "org_editor_owner_ids"))))));



CREATE POLICY "org_member_read" ON "public"."organizations" FOR SELECT USING ("public"."is_active_org_member"("id", "auth"."uid"()));



CREATE POLICY "org_members_owner" ON "public"."organization_members" USING ("public"."is_org_owner"("org_id", "auth"."uid"())) WITH CHECK ("public"."is_org_owner"("org_id", "auth"."uid"()));



CREATE POLICY "org_members_self_read" ON "public"."organization_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "org_owner_all" ON "public"."organizations" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "org_read_bills" ON "public"."bills" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("bills"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids"))))));



CREATE POLICY "org_read_checklist_items" ON "public"."checklist_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("checklist_items"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids"))))));



CREATE POLICY "org_read_client_stays" ON "public"."client_stays" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "client_stays"."property_id") AND ("p"."user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids"))))));



CREATE POLICY "org_read_clients" ON "public"."clients" FOR SELECT USING (("user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids")));



CREATE POLICY "org_read_contacts" ON "public"."contacts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("contacts"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids"))))));



CREATE POLICY "org_read_expenses" ON "public"."expenses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("expenses"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids"))))));



CREATE POLICY "org_read_inventory_items" ON "public"."inventory_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_items"."property_id") AND ("p"."user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids"))))));



CREATE POLICY "org_read_inventory_maintenance" ON "public"."inventory_maintenance" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_maintenance"."property_id") AND ("p"."user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids"))))));



CREATE POLICY "org_read_loans" ON "public"."loans" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("loans"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids"))))));



CREATE POLICY "org_read_maintenance_tasks" ON "public"."maintenance_tasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("maintenance_tasks"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids"))))));



CREATE POLICY "org_read_properties" ON "public"."user_properties" FOR SELECT USING (("user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids")));



CREATE POLICY "org_read_property_documents" ON "public"."property_documents" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("property_documents"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids"))))));



CREATE POLICY "org_read_property_settings" ON "public"."property_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("property_settings"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids"))))));



CREATE POLICY "org_read_tenants" ON "public"."tenants" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("tenants"."property_id")::"text") AND ("p"."user_id" IN ( SELECT "public"."org_owner_ids"("auth"."uid"()) AS "org_owner_ids"))))));



ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own bank txn delete" ON "public"."bank_transactions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own bank txn insert" ON "public"."bank_transactions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own bank txn select" ON "public"."bank_transactions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own closing delete" ON "public"."book_closings" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own closing insert" ON "public"."book_closings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own closing select" ON "public"."book_closings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own closing update" ON "public"."book_closings" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own feed token delete" ON "public"."calendar_feed_tokens" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own feed token insert" ON "public"."calendar_feed_tokens" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own feed token select" ON "public"."calendar_feed_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own_accountant_links" ON "public"."accountant_links" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_airbnb" ON "public"."airbnb_bookings" USING ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "own_billing_profile" ON "public"."billing_profiles" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_bills" ON "public"."bills" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_bills_history" ON "public"."bills_history" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_bills_settings" ON "public"."bills_settings" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_calendar_events" ON "public"."calendar_events" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_checkin_links" ON "public"."checkin_links" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_checklist_items" ON "public"."checklist_items" USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("checklist_items"."property_id")::"text") AND ("p"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = ("checklist_items"."property_id")::"text") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "own_client_documents" ON "public"."client_documents" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_client_notes" ON "public"."client_notes" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_client_stays" ON "public"."client_stays" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_clients" ON "public"."clients" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_contacts" ON "public"."contacts" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_email_campaigns" ON "public"."email_campaigns" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own_email_recipients" ON "public"."email_recipients" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own_expenses" ON "public"."expenses" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_guest_checkins" ON "public"."guest_checkins" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_ical_feeds" ON "public"."ical_feeds" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_inventory_handovers" ON "public"."inventory_handovers" USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_handovers"."property_id") AND ("p"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_handovers"."property_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "own_inventory_items" ON "public"."inventory_items" USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_items"."property_id") AND ("p"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_items"."property_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "own_inventory_maintenance" ON "public"."inventory_maintenance" USING ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_maintenance"."property_id") AND ("p"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_properties" "p"
  WHERE ((("p"."id")::"text" = "inventory_maintenance"."property_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "own_inventory_repairs" ON "public"."inventory_repairs" USING (((("user_id")::"text" = ("auth"."uid"())::"text") OR (EXISTS ( SELECT 1
   FROM ("public"."inventory_items" "i"
     JOIN "public"."user_properties" "p" ON ((("p"."id")::"text" = "i"."property_id")))
  WHERE ((("i"."id")::"text" = ("inventory_repairs"."item_id")::"text") AND ("p"."user_id" = "auth"."uid"())))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."inventory_items" "i"
     JOIN "public"."user_properties" "p" ON ((("p"."id")::"text" = "i"."property_id")))
  WHERE ((("i"."id")::"text" = ("inventory_repairs"."item_id")::"text") AND ("p"."user_id" = "auth"."uid"())))) OR (("item_id" IS NULL) AND (("user_id")::"text" = ("auth"."uid"())::"text"))));



CREATE POLICY "own_issued_documents" ON "public"."issued_documents" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own_loans" ON "public"."loans" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_maint_req" ON "public"."maintenance_requests" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_maintenance_tasks" ON "public"."maintenance_tasks" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_marketing_prefs" ON "public"."email_marketing_prefs" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own_notif_log" ON "public"."notification_log" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "own_notification_preferences" ON "public"."notification_preferences" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_onboarding_progress" ON "public"."onboarding_progress" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_portal_links" ON "public"."portal_links" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_pricing_settings" ON "public"."pricing_settings" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_property_data" ON "public"."property_data" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_property_documents" ON "public"."property_documents" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_property_settings" ON "public"."property_settings" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_referral_code" ON "public"."referral_codes" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_referral_partner" ON "public"."referral_partners" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "own_referral_rewards" ON "public"."referral_rewards" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "own_rent_comparables" ON "public"."rent_comparables" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_rent_config" ON "public"."rent_config" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_rent_payments" ON "public"."rent_payments" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



CREATE POLICY "own_report_branding" ON "public"."report_branding" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_tenant_comm_log" ON "public"."tenant_comm_log" USING (("user_id" = ("auth"."uid"())::"text")) WITH CHECK (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "own_tenant_damages" ON "public"."tenant_damages" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_tenants" ON "public"."tenants" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_user_properties" ON "public"."user_properties" USING ((("user_id")::"text" = ("auth"."uid"())::"text")) WITH CHECK ((("user_id")::"text" = ("auth"."uid"())::"text"));



ALTER TABLE "public"."portal_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_updates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."property_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."property_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."property_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_devices_own" ON "public"."push_devices" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "read_published_updates" ON "public"."product_updates" FOR SELECT USING (("published" = true));



ALTER TABLE "public"."referral_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_partners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_rewards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referrals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rent_comparables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rent_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rent_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_branding" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_comm_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_damages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_properties" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bills";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bills_history";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bills_settings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."calendar_events";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."checklist_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."client_documents";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."client_notes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."client_stays";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."clients";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."expenses";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."ical_feeds";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."maintenance_tasks";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."pricing_settings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tenants";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."accept_org_invites_for_me"() TO "anon";
GRANT ALL ON FUNCTION "public"."accept_org_invites_for_me"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_org_invites_for_me"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_send_marketing"("p_to_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_referral_bonus"("p_code" "text", "p_kind" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_referral_bonus"("p_code" "text", "p_kind" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_referral_bonus"("p_code" "text", "p_kind" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_org_upgrade_request"() TO "anon";
GRANT ALL ON FUNCTION "public"."clear_org_upgrade_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_org_upgrade_request"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."community_market_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."community_market_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."community_market_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."community_market_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."count_real_words"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."count_real_words"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_real_words"("p" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."declare_rent_payment"("p_token" "text", "p_payment_id" "uuid", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."declare_rent_payment"("p_token" "text", "p_payment_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."declare_rent_payment"("p_token" "text", "p_payment_id" "uuid", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_my_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."drain_email_outbox"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."drain_email_outbox"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."draw_due_feedback_winners"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."draw_due_feedback_winners"() TO "anon";
GRANT ALL ON FUNCTION "public"."draw_due_feedback_winners"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."draw_due_feedback_winners"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."draw_feedback_winner"("p_campaign" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."draw_feedback_winner"("p_campaign" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."draw_feedback_winner"("p_campaign" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."draw_feedback_winner"("p_campaign" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_property_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_property_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_property_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_email"("p_copy_id" "text", "p_to_email" "text", "p_to_name" "text", "p_params" "jsonb", "p_category" "text", "p_dedup_key" "text", "p_delay" interval) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_email"("p_copy_id" "text", "p_to_email" "text", "p_to_name" "text", "p_params" "jsonb", "p_category" "text", "p_dedup_key" "text", "p_delay" interval) TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_organization"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_organization"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_organization"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."export_my_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."export_my_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."export_my_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_my_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."feedback_campaign"("p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."feedback_campaign"("p_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."feedback_campaign"("p_ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_accountant_data"("p_token" "text", "p_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_accountant_data"("p_token" "text", "p_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_accountant_data"("p_token" "text", "p_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_checkin_context"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_checkin_context"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_checkin_context"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_portal_data"("p_token" "text", "p_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_portal_data"("p_token" "text", "p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_portal_data"("p_token" "text", "p_pin" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_referral_list"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_referral_list"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_referral_list"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_referral_overview"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_referral_overview"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_referral_overview"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_referral_social_proof"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_referral_social_proof"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_referral_social_proof"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_referral_standing"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_referral_standing"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_referral_standing"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_referral_stats"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_referral_stats"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_referral_stats"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_org_member"("p_email" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_org_member"("p_email" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_org_member"("p_email" "text", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_org_member"("p_org" "uuid", "p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_org_member"("p_org" "uuid", "p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_org_member"("p_org" "uuid", "p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_portal_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_portal_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_portal_token"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_owner"("p_org" "uuid", "p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_owner"("p_org" "uuid", "p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_owner"("p_org" "uuid", "p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_mobile_waitlist"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_mobile_waitlist"() TO "anon";
GRANT ALL ON FUNCTION "public"."join_mobile_waitlist"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_mobile_waitlist"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."leave_mobile_waitlist"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leave_mobile_waitlist"() TO "anon";
GRANT ALL ON FUNCTION "public"."leave_mobile_waitlist"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_mobile_waitlist"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lock_billing_plan"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_activity"("p_action" "text", "p_entity" "text", "p_entity_id" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_activity"("p_action" "text", "p_entity" "text", "p_entity_id" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_activity"("p_action" "text", "p_entity" "text", "p_entity_id" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_activity"("p_action" "text", "p_entity" "text", "p_entity_id" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_referral_activated"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_referral_activated"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_referral_activated"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."marketing_prefs_by_token"("p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."marketing_prefs_by_token"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."marketing_prefs_by_token"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."marketing_prefs_by_token"("p_token" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON FUNCTION "public"."my_activity"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."my_activity"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_activity"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."my_feedback_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_feedback_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_feedback_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."next_invoice_number"("p_series" "text", "p_year" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_invoice_number"("p_series" "text", "p_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."next_invoice_number"("p_series" "text", "p_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_invoice_number"("p_series" "text", "p_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."org_editor_owner_ids"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."org_editor_owner_ids"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."org_editor_owner_ids"("p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."org_owner_ids"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."org_owner_ids"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."org_owner_ids"("p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."owns_portal_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."owns_portal_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owns_portal_token"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."plan_max_properties"("p_rank" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."portal_meta"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."portal_meta"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."portal_meta"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reconcile_referral_rewards"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reconcile_referral_rewards"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconcile_referral_rewards"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."redeem_referral"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_referral"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_referral"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_email_schedule_lock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_email_schedule_lock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rename_organization"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rename_organization"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rename_organization"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_member_edit"() TO "anon";
GRANT ALL ON FUNCTION "public"."request_member_edit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_member_edit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."request_org_upgrade"() TO "anon";
GRANT ALL ON FUNCTION "public"."request_org_upgrade"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_org_upgrade"() TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_org_member"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_org_member"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_org_member"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_member_edit"("p_email" "text", "p_can" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_member_edit"("p_email" "text", "p_can" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_member_edit"("p_email" "text", "p_can" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_org_member_role"("p_email" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_org_member_role"("p_email" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_org_member_role"("p_email" "text", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_portal_pin"("p_token" "text", "p_pin" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_portal_pin"("p_token" "text", "p_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_portal_pin"("p_token" "text", "p_pin" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_checkin"("p_token" "text", "p_full_name" "text", "p_id_number" "text", "p_nationality" "text", "p_birth_date" "text", "p_phone" "text", "p_email" "text", "p_arrival_date" "text", "p_guests" integer, "p_accepts" boolean, "p_privacy_consent" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."submit_checkin"("p_token" "text", "p_full_name" "text", "p_id_number" "text", "p_nationality" "text", "p_birth_date" "text", "p_phone" "text", "p_email" "text", "p_arrival_date" "text", "p_guests" integer, "p_accepts" boolean, "p_privacy_consent" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_checkin"("p_token" "text", "p_full_name" "text", "p_id_number" "text", "p_nationality" "text", "p_birth_date" "text", "p_phone" "text", "p_email" "text", "p_arrival_date" "text", "p_guests" integer, "p_accepts" boolean, "p_privacy_consent" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_feedback"("p_body" "text", "p_target" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_feedback"("p_body" "text", "p_target" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_feedback"("p_body" "text", "p_target" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_feedback"("p_body" "text", "p_target" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_maintenance_request"("p_token" "text", "p_title" "text", "p_description" "text", "p_contact" "text", "p_photos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_maintenance_request"("p_token" "text", "p_title" "text", "p_description" "text", "p_contact" "text", "p_photos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_maintenance_request"("p_token" "text", "p_title" "text", "p_description" "text", "p_contact" "text", "p_photos" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_comp_from_referrals"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_comp_from_referrals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_comp_from_referrals"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."try_email_schedule_lock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."try_email_schedule_lock"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."unsubscribe_email"("p_token" "uuid", "p_kind" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unsubscribe_email"("p_token" "uuid", "p_kind" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unsubscribe_email"("p_token" "uuid", "p_kind" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unsubscribe_email"("p_token" "uuid", "p_kind" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_plan_rank"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_plan_rank"("p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_document"("p_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_document"("p_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_document"("p_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_document"("p_id" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."accountant_links" TO "anon";
GRANT ALL ON TABLE "public"."accountant_links" TO "authenticated";
GRANT ALL ON TABLE "public"."accountant_links" TO "service_role";



GRANT ALL ON TABLE "public"."loan_programs" TO "anon";
GRANT ALL ON TABLE "public"."loan_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."loan_programs" TO "service_role";



GRANT ALL ON TABLE "public"."active_loan_programs" TO "anon";
GRANT ALL ON TABLE "public"."active_loan_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."active_loan_programs" TO "service_role";



GRANT ALL ON TABLE "public"."airbnb_bookings" TO "anon";
GRANT ALL ON TABLE "public"."airbnb_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."airbnb_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."app_admins" TO "anon";
GRANT ALL ON TABLE "public"."app_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."app_admins" TO "service_role";



GRANT ALL ON TABLE "public"."bank_rates" TO "anon";
GRANT ALL ON TABLE "public"."bank_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_rates" TO "service_role";



GRANT ALL ON TABLE "public"."bank_transactions" TO "anon";
GRANT ALL ON TABLE "public"."bank_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."billing_profiles" TO "anon";
GRANT ALL ON TABLE "public"."billing_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."bills" TO "anon";
GRANT ALL ON TABLE "public"."bills" TO "authenticated";
GRANT ALL ON TABLE "public"."bills" TO "service_role";



GRANT ALL ON TABLE "public"."bills_history" TO "anon";
GRANT ALL ON TABLE "public"."bills_history" TO "authenticated";
GRANT ALL ON TABLE "public"."bills_history" TO "service_role";



GRANT ALL ON TABLE "public"."bills_settings" TO "anon";
GRANT ALL ON TABLE "public"."bills_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."bills_settings" TO "service_role";



GRANT ALL ON TABLE "public"."book_closings" TO "anon";
GRANT ALL ON TABLE "public"."book_closings" TO "authenticated";
GRANT ALL ON TABLE "public"."book_closings" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_feed_tokens" TO "anon";
GRANT ALL ON TABLE "public"."calendar_feed_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_feed_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."checkin_links" TO "anon";
GRANT ALL ON TABLE "public"."checkin_links" TO "authenticated";
GRANT ALL ON TABLE "public"."checkin_links" TO "service_role";



GRANT ALL ON TABLE "public"."checklist_items" TO "anon";
GRANT ALL ON TABLE "public"."checklist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."checklist_items" TO "service_role";



GRANT ALL ON TABLE "public"."client_documents" TO "anon";
GRANT ALL ON TABLE "public"."client_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."client_documents" TO "service_role";



GRANT ALL ON TABLE "public"."client_notes" TO "anon";
GRANT ALL ON TABLE "public"."client_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."client_notes" TO "service_role";



GRANT ALL ON TABLE "public"."client_stays" TO "anon";
GRANT ALL ON TABLE "public"."client_stays" TO "authenticated";
GRANT ALL ON TABLE "public"."client_stays" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."cron_secrets" TO "service_role";



GRANT ALL ON TABLE "public"."email_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."email_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."email_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."email_marketing_prefs" TO "anon";
GRANT ALL ON TABLE "public"."email_marketing_prefs" TO "authenticated";
GRANT ALL ON TABLE "public"."email_marketing_prefs" TO "service_role";



GRANT ALL ON TABLE "public"."email_outbox" TO "anon";
GRANT ALL ON TABLE "public"."email_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."email_outbox" TO "service_role";



GRANT ALL ON SEQUENCE "public"."email_outbox_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."email_outbox_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."email_outbox_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."email_recipients" TO "anon";
GRANT ALL ON TABLE "public"."email_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."email_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."energy_tariffs" TO "anon";
GRANT ALL ON TABLE "public"."energy_tariffs" TO "authenticated";
GRANT ALL ON TABLE "public"."energy_tariffs" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_campaign_winners" TO "anon";
GRANT ALL ON TABLE "public"."feedback_campaign_winners" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_campaign_winners" TO "service_role";



GRANT ALL ON TABLE "public"."guest_checkins" TO "anon";
GRANT ALL ON TABLE "public"."guest_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."guest_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."ical_feeds" TO "anon";
GRANT ALL ON TABLE "public"."ical_feeds" TO "authenticated";
GRANT ALL ON TABLE "public"."ical_feeds" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_handovers" TO "anon";
GRANT ALL ON TABLE "public"."inventory_handovers" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_handovers" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_maintenance" TO "anon";
GRANT ALL ON TABLE "public"."inventory_maintenance" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_maintenance" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_repairs" TO "anon";
GRANT ALL ON TABLE "public"."inventory_repairs" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_repairs" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_counters" TO "anon";
GRANT ALL ON TABLE "public"."invoice_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_counters" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."issued_documents" TO "anon";
GRANT ALL ON TABLE "public"."issued_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."issued_documents" TO "service_role";



GRANT ALL ON TABLE "public"."loans" TO "anon";
GRANT ALL ON TABLE "public"."loans" TO "authenticated";
GRANT ALL ON TABLE "public"."loans" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_requests" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_requests" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_tasks" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."market_rates" TO "anon";
GRANT ALL ON TABLE "public"."market_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."market_rates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."market_rates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."market_rates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."market_rates_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."messaging_prefs" TO "anon";
GRANT ALL ON TABLE "public"."messaging_prefs" TO "authenticated";
GRANT ALL ON TABLE "public"."messaging_prefs" TO "service_role";



GRANT ALL ON TABLE "public"."mobile_waitlist" TO "anon";
GRANT ALL ON TABLE "public"."mobile_waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."mobile_waitlist" TO "service_role";



GRANT ALL ON TABLE "public"."notification_log" TO "anon";
GRANT ALL ON TABLE "public"."notification_log" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_log" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_progress" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_progress" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."portal_links" TO "anon";
GRANT ALL ON TABLE "public"."portal_links" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_links" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_settings" TO "anon";
GRANT ALL ON TABLE "public"."pricing_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_settings" TO "service_role";



GRANT ALL ON TABLE "public"."product_updates" TO "anon";
GRANT ALL ON TABLE "public"."product_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."product_updates" TO "service_role";



GRANT ALL ON TABLE "public"."property_data" TO "anon";
GRANT ALL ON TABLE "public"."property_data" TO "authenticated";
GRANT ALL ON TABLE "public"."property_data" TO "service_role";



GRANT ALL ON TABLE "public"."property_documents" TO "anon";
GRANT ALL ON TABLE "public"."property_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."property_documents" TO "service_role";



GRANT ALL ON TABLE "public"."property_settings" TO "anon";
GRANT ALL ON TABLE "public"."property_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."property_settings" TO "service_role";



GRANT ALL ON TABLE "public"."push_devices" TO "anon";
GRANT ALL ON TABLE "public"."push_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."push_devices" TO "service_role";



GRANT ALL ON SEQUENCE "public"."push_devices_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."push_devices_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."push_devices_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."referral_codes" TO "anon";
GRANT ALL ON TABLE "public"."referral_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_codes" TO "service_role";



GRANT ALL ON TABLE "public"."referral_partners" TO "anon";
GRANT ALL ON TABLE "public"."referral_partners" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_partners" TO "service_role";



GRANT ALL ON TABLE "public"."referral_rewards" TO "anon";
GRANT ALL ON TABLE "public"."referral_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_rewards" TO "service_role";



GRANT ALL ON TABLE "public"."referrals" TO "anon";
GRANT ALL ON TABLE "public"."referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."referrals" TO "service_role";



GRANT ALL ON TABLE "public"."rent_comparables" TO "anon";
GRANT ALL ON TABLE "public"."rent_comparables" TO "authenticated";
GRANT ALL ON TABLE "public"."rent_comparables" TO "service_role";



GRANT ALL ON TABLE "public"."rent_config" TO "anon";
GRANT ALL ON TABLE "public"."rent_config" TO "authenticated";
GRANT ALL ON TABLE "public"."rent_config" TO "service_role";



GRANT ALL ON TABLE "public"."rent_payments" TO "anon";
GRANT ALL ON TABLE "public"."rent_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."rent_payments" TO "service_role";



GRANT ALL ON TABLE "public"."report_branding" TO "anon";
GRANT ALL ON TABLE "public"."report_branding" TO "authenticated";
GRANT ALL ON TABLE "public"."report_branding" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_comm_log" TO "anon";
GRANT ALL ON TABLE "public"."tenant_comm_log" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_comm_log" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_damages" TO "anon";
GRANT ALL ON TABLE "public"."tenant_damages" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_damages" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."user_feedback" TO "anon";
GRANT ALL ON TABLE "public"."user_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."user_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."user_properties" TO "anon";
GRANT ALL ON TABLE "public"."user_properties" TO "authenticated";
GRANT ALL ON TABLE "public"."user_properties" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































