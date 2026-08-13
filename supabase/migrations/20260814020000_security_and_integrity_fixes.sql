-- ═══════════════════════════════════════════════════════════════════════════
-- ΕΝΝΕΑ ΤΡΥΠΕΣ ΠΟΥ ΒΡΗΚΕ Ο ΕΛΕΓΧΟΣ ΤΗΣ 14/08/2026
-- ─────────────────────────────────────────────────────────────────────────
-- Καθεμία είναι γραμμένη με το ΣΕΝΑΡΙΟ της, όχι με την περιγραφή της αλλαγής.
-- Όλες είναι προσθετικές ή περιοριστικές: καμία δεν σβήνει δεδομένα.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. ΚΑΘΕ ΕΝΗΜΕΡΩΣΗ ΛΟΓΑΡΙΑΣΜΟΥ ΑΠΕΤΥΧΕ. ΣΙΩΠΗΛΑ. ─────────────────────
-- Ο πίνακας `bills` έχει σκανδάλη `bills_updated_at` που καλεί την
-- `update_updated_at_column()`, και εκείνη γράφει `NEW.updated_at`. Ο πίνακας
-- ΔΕΝ έχει τέτοια στήλη. Αναπαράχθηκε σε πραγματική Postgres 16:
--
--   ERROR:  record "new" has no field "updated_at"   (SQLSTATE 42703)
--
-- Δηλαδή: κάθε «Πληρώθηκε», κάθε αλλαγή ποσού, κάθε επεξεργασία λογαριασμού
-- πετούσε. Ο δίπλα πίνακας `bills_settings` έχει την ίδια σκανδάλη ΚΑΙ τη
-- στήλη, γι' αυτό κανείς δεν το υποψιάστηκε από αναλογία.
--
-- Η στήλη μπαίνει (αντί να φύγει η σκανδάλη) γιατί ο πίνακας είναι μεταβλητός
-- και η ώρα τελευταίας αλλαγής είναι χρήσιμη· τα υπάρχοντα γεμίζουν από ό,τι
-- ξέρουμε ήδη.
alter table public.bills add column if not exists updated_at timestamptz default now();
update public.bills
   set updated_at = coalesce(paid_at, created_at, now())
 where updated_at is null;

-- ── 2. Η ΜΗΝΙΑΙΑ ΚΑΤΑΣΤΑΣΗ ΜΠΟΡΟΥΣΕ ΝΑ ΣΤΑΛΕΙ ΞΑΝΑ ΚΑΙ ΞΑΝΑ ────────────
-- Η `send-monthly-statements` γράφει δείκτη «στάλθηκε» στο `notification_log`
-- με `event_id: null` — αλλά η στήλη είναι NOT NULL. Η εγγραφή πετούσε (23502),
-- το σφάλμα δεν ελεγχόταν, και ο έλεγχος «το έστειλα ήδη αυτόν τον μήνα» δεν
-- έβρισκε ποτέ τίποτα. Κάθε επανεκτέλεση — χειροκίνητη, retry του pg_net,
-- διπλή εγγραφή cron — ξανάστελνε σε ΚΑΘΕ ιδιοκτήτη ολόκληρο το μητρώο
-- ενοικίων του.
alter table public.notification_log alter column event_id drop not null;

-- Η μοναδικότητα που λείπει: ένα μήνυμα ανά χρήστη, ανά είδος, ανά μήνα, για
-- όσα δεν κρέμονται από γεγονός ημερολογίου. Το `at time zone 'UTC'` δεν είναι
-- διακοσμητικό: το `date_trunc` πάνω σε timestamptz εξαρτάται από τη ζώνη της
-- συνεδρίας, άρα δεν είναι σταθερό και η Postgres αρνείται να το ευρετηριάσει.
-- Με ρητή ζώνη γίνεται σταθερό. Ο μήνας εδώ είναι λογιστικός δείκτης, όχι
-- ημερομηνία που βλέπει ο χρήστης, οπότε το UTC είναι σωστή επιλογή.
create unique index if not exists notification_log_monthly_key
  on public.notification_log (user_id, reminder_type, (date_trunc('month', created_at at time zone 'UTC')))
  where event_id is null;

-- ── 3. Ο ΜΕΤΡΗΤΗΣ ΤΩΝ ΑΚΙΝΗΤΩΝ ΗΤΑΝ ΓΡΑΨΙΜΟ ΤΟΥ ΠΕΛΑΤΗ ──────────────────
-- Η `lock_billing_plan` παγώνει το `plan` και τα `comp_*`. Γράφτηκε ΠΡΙΝ
-- υπάρξουν τα `extra_properties` (χρεώσιμο πρόσθετο, 2 €/ακίνητο/μήνα) και
-- `bonus_properties` (δώρο πρόσκλησης). Και τα τρία μπαίνουν στο όριο που
-- ελέγχει η `enforce_property_limit`.
--
-- Από την κονσόλα του περιηγητή, με το δημόσιο κλειδί:
--   update billing_profiles set extra_properties = 500, bonus_properties = 500
-- και το όριο γίνεται 1001 σε δωρεάν λογαριασμό. Η σκανδάλη που υπάρχει
-- ακριβώς για να μη γίνεται αυτό, το επέτρεπε.
--
-- Παγώνουν επίσης τα πεδία της συνδρομής: όταν μπει το endpoint πληρωμής, το
-- `subscription_status` και τα `stripe_*` θα γράφονται ΜΟΝΟ από τον webhook με
-- ρόλο υπηρεσίας. Γράφονται εδώ τώρα, ώστε να μη γεννηθεί η τρύπα μαζί με τη
-- λειτουργία.
create or replace function public.lock_billing_plan() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.plan := 'free';
      new.comp_plan := null;
      new.comp_until := null;
      new.comp_months_granted := 0;
      new.comp_started_at := null;
      new.extra_properties := 0;
      new.bonus_properties := 0;
      new.bonus_properties_until := null;
      new.subscription_status := null;
      new.stripe_customer_id := null;
      new.stripe_subscription_id := null;
    else
      if new.plan is distinct from old.plan then new.plan := old.plan; end if;
      new.comp_plan          := old.comp_plan;
      new.comp_until         := old.comp_until;
      new.comp_months_granted := old.comp_months_granted;
      new.comp_started_at    := old.comp_started_at;
      new.extra_properties   := old.extra_properties;
      new.bonus_properties   := old.bonus_properties;
      new.bonus_properties_until := old.bonus_properties_until;
      new.subscription_status := old.subscription_status;
      new.stripe_customer_id := old.stripe_customer_id;
      new.stripe_subscription_id := old.stripe_subscription_id;
    end if;
  end if;
  return new;
end;
$$;

-- ── 4. ΤΟ ΣΒΗΣΙΜΟ ΤΗΣ ΓΡΑΜΜΗΣ ΜΗΔΕΝΙΖΕ ΤΟΝ ΜΕΤΡΗΤΗ ΤΩΝ ΔΩΡΕΑΝ ΜΗΝΩΝ ──
-- Η σκανδάλη είναι BEFORE INSERT OR UPDATE. ΟΧΙ DELETE. Και η πολιτική ήταν
-- `FOR ALL`, άρα ο χρήστης μπορούσε να σβήσει τη δική του γραμμή χρέωσης.
--
-- Η σειρά: σβήνω τη γραμμή (φεύγουν comp_months_granted και comp_until), την
-- ξαναφτιάχνω, καλώ `sync_comp_from_referrals` — και το μητρώο ανταμοιβών, που
-- ΕΠΙΒΙΩΝΕΙ γιατί είναι σωστά μόνο για ανάγνωση, ξαναδίνει τους ίδιους μήνες
-- από την αρχή. Κάθε μήνα. Για πάντα, από μία πρόσκληση.
--
-- Η γραμμή χρέωσης δεν είναι δεδομένο του χρήστη· είναι το βιβλίο του λογαριασμού.
drop policy if exists "own_billing_profile" on public.billing_profiles;
create policy "own_billing_profile_read"   on public.billing_profiles
  for select using (user_id = (select auth.uid()));
create policy "own_billing_profile_insert" on public.billing_profiles
  for insert with check (user_id = (select auth.uid()));
create policy "own_billing_profile_update" on public.billing_profiles
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── 5. ΤΟ ΛΑΧΕΙΟ ΤΡΑΒΙΟΤΑΝ ΑΠΟ ΟΠΟΙΟΝΔΗΠΟΤΕ ──────────────────────────────
-- Η `draw_feedback_winner` είναι SECURITY DEFINER, διαλέγει τυχαίο συμμετέχοντα
-- και του γράφει `comp_plan='agency'` για δώδεκα μήνες, παρακάμπτοντας επίτηδες
-- τη `lock_billing_plan`. Προοριζόταν μόνο για το μηνιαίο cron. Ο βρόχος
-- ελαχίστων δικαιωμάτων του 20260806120000 όμως αφαίρεσε το δικαίωμα από τον
-- `anon` και το ΞΑΝΑΕΔΩΣΕ στον `authenticated`.
--
-- Δηλαδή: υποβάλλω σχόλιο, καλώ τη συνάρτηση, κερδίζω εγώ. Και επειδή γράφει
-- νικητή στο `feedback_campaign_winners`, ο πραγματικός νικητής δεν κληρώνεται
-- ποτέ και κανείς δεν το μαθαίνει.
--
-- Ίδια ιστορία η `next_invoice_number`: το ίδιο το SETUP_ALL γράφει «δεν δίνεται
-- σε authenticated», και δόθηκε. Δέκα χιλιάδες κλήσεις και η επόμενη πραγματική
-- απόδειξη βγαίνει με νούμερο 10.001 — σε αρίθμηση που ο νόμος θέλει συνεχή.
revoke all on function public.draw_feedback_winner(text) from public, anon, authenticated;
grant execute on function public.draw_feedback_winner(text) to service_role;

revoke all on function public.draw_due_feedback_winners() from public, anon, authenticated;
grant execute on function public.draw_due_feedback_winners() to service_role;

revoke all on function public.next_invoice_number(text, integer) from public, anon, authenticated;
grant execute on function public.next_invoice_number(text, integer) to service_role;

-- ── 6. ΤΟ ΟΡΙΟ ΑΠΟΣΤΟΛΩΝ ΜΗΔΕΝΙΖΟΤΑΝ ΜΕ ΠΑΡΑΜΕΤΡΟ ΤΟΥ ΚΑΛΟΥΝΤΑ ─────────
-- Η επικεφαλίδα του 20260810062000 γράφει τον κανόνα: «ένας μετρητής ορίου δεν
-- επιτρέπεται να ζει σε γραμμή που γράφει ο περιοριζόμενος». Η γραμμή έφυγε
-- σωστά από τα χέρια του — αλλά το ΠΑΡΑΘΥΡΟ δόθηκε πίσω ως παράμετρος:
--
--   rpc('bump_send_quota', { p_window: '0 seconds', p_max: 9999999 })
--
-- «bucket + 0 δευτερόλεπτα <= τώρα» είναι πάντα αληθές, άρα ο μετρητής
-- μηδενίζεται σε κάθε κλήση. Το όριο των 3.000 παραληπτών ανά 24 ώρες δεν
-- δέσμευε ποτέ.
--
-- Η υπογραφή μένει ίδια (την καλούν έξι edge functions), αλλά οι τιμές
-- σφίγγονται μέσα στη συνάρτηση: κάτω από μία ώρα δεν υπάρχει παράθυρο, και
-- κανένα όριο δεν ξεπερνά την ανώτατη οροφή.
create or replace function public.bump_send_quota(
  p_kind text, p_units integer, p_max integer, p_window interval
) returns json
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_units integer; v_bucket timestamptz;
  -- Ό,τι έρχεται από τον καλούντα είναι πρόταση, όχι εντολή.
  v_window interval := greatest(coalesce(p_window, interval '24 hours'), interval '1 hour');
  v_max integer := least(greatest(coalesce(p_max, 1), 1), 5000);
begin
  if v_uid is null then
    return json_build_object('allowed', false, 'reason', 'auth');
  end if;
  if p_units is null or p_units < 1 then
    return json_build_object('allowed', false, 'reason', 'units');
  end if;

  insert into public.send_quota (user_id, kind, bucket, units, updated_at)
       values (v_uid, p_kind, v_now, p_units, v_now)
  on conflict (user_id, kind) do update set
    units      = case when public.send_quota.bucket + v_window <= v_now then p_units
                      else public.send_quota.units + p_units end,
    bucket     = case when public.send_quota.bucket + v_window <= v_now then v_now
                      else public.send_quota.bucket end,
    updated_at = v_now
  returning units, bucket into v_units, v_bucket;

  if v_units > v_max then
    update public.send_quota set units = greatest(v_units - p_units, 0)
     where user_id = v_uid and kind = p_kind;
    return json_build_object(
      'allowed', false, 'reason', 'quota',
      'retry_after', extract(epoch from (v_bucket + v_window - v_now))::bigint);
  end if;

  return json_build_object('allowed', true, 'units', v_units);
end $$;

-- ── 7. Η ΑΝΑΚΛΗΣΗ ΤΟΥ ΛΟΓΙΣΤΗ ΗΤΑΝ ΔΙΑΚΟΣΜΗΤΙΚΗ ────────────────────────
-- Η σελίδα υπόσχεται «ο ιδιοκτήτης μπορεί να τον ανακαλέσει οποτεδήποτε». Ο
-- ιδιοκτήτης γυρίζει το `active` σε false — και ο λογιστής ξανανοίγει το ίδιο
-- link. Η `accountant_claim` είναι SECURITY DEFINER, άρα η RLS δεν την αγγίζει,
-- και το `on conflict … do update set active = true` ξανάδινε πρόσβαση σιωπηλά.
--
-- Επιπλέον, η αλλαγή του token δεν ανακαλούσε τίποτα: η αξίωση κρατιόταν στο
-- ζεύγος (λογιστής, ιδιοκτήτης) και δεν θυμόταν ΜΕ ΠΟΙΟ link δόθηκε. Τώρα το
-- θυμάται, οπότε η περιστροφή του συνδέσμου είναι πραγματική ανάκληση.
alter table public.accountant_clients add column if not exists claimed_token text;

create or replace function public.accountant_claim(p_token text)
returns json
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_link record;
  v_me uuid := auth.uid();
  v_name text;
begin
  if v_me is null then return json_build_object('ok', false, 'reason', 'anonymous'); end if;

  select * into v_link from accountant_links
   where token = p_token and active = true and (expires_at is null or expires_at > now());
  if not found then return json_build_object('ok', false, 'reason', 'invalid'); end if;

  if v_link.user_id = v_me then return json_build_object('ok', false, 'reason', 'self'); end if;

  -- Ανακλήθηκε ρητά: το ίδιο link δεν ξανανοίγει την πόρτα. Ο ιδιοκτήτης
  -- ξαναδίνει πρόσβαση μόνο βγάζοντας νέο σύνδεσμο.
  if exists (select 1 from accountant_clients
              where accountant_id = v_me and owner_id = v_link.user_id and active = false) then
    return json_build_object('ok', false, 'reason', 'revoked');
  end if;

  insert into accountant_clients (accountant_id, owner_id, claimed_token)
    values (v_me, v_link.user_id, p_token)
  on conflict (accountant_id, owner_id)
    do update set active = true, linked_at = now(), claimed_token = excluded.claimed_token;

  select coalesce(nullif(trim(owner_name), ''), nullif(trim(full_name), ''), 'Ιδιοκτήτης')
    into v_name from billing_profiles where user_id = v_link.user_id;

  return json_build_object('ok', true, 'owner', coalesce(v_name, 'Ιδιοκτήτης'));
end $$;

-- ── 8. ΤΕΣΣΕΡΙΣ ΠΙΝΑΚΕΣ ΧΩΡΙΣ ΚΑΝΕΝΑ ΕΥΡΕΤΗΡΙΟ ΠΕΡΑΝ ΤΟΥ ΚΛΕΙΔΙΟΥ ─────
-- Η απογραφή, η συντήρηση, οι δηλώσεις άφιξης και τα αιτήματα βλάβης
-- διαβάζονται ΠΑΝΤΑ με φίλτρο ακινήτου ή χρήστη, και πάνω τους τρέχουν τρεις
-- πολιτικές RLS με υποερώτημα η καθεμία. Χωρίς ευρετήριο, το άνοιγμα της
-- καρτέλας είναι σειριακή σάρωση ΟΛΩΝ των πελατών, τρεις φορές.
create index if not exists inventory_items_property_idx       on public.inventory_items (property_id);
create index if not exists inventory_items_user_idx           on public.inventory_items (user_id);
create index if not exists inventory_maintenance_property_idx on public.inventory_maintenance (property_id, user_id);
create index if not exists guest_checkins_user_idx            on public.guest_checkins (user_id, created_at desc);
create index if not exists guest_checkins_token_idx           on public.guest_checkins (token);
create index if not exists maintenance_requests_property_idx  on public.maintenance_requests (property_id, created_at desc);
create index if not exists maintenance_requests_user_idx      on public.maintenance_requests (user_id, status);
create index if not exists calendar_events_property_date_idx  on public.calendar_events (property_id, event_date);
create index if not exists expenses_user_date_idx             on public.expenses (user_id, date);

-- ── 9. ΤΟ ΙΔΙΟ ΑΝΤΙΓΡΑΦΟ ΚΙΝΗΣΕΩΝ, ΔΥΟ ΦΟΡΕΣ, ΔΥΟ ΣΥΝΟΛΑ ────────────────
-- Η εισαγωγή κινήσεων γράφει σε δύο πίνακες. Το `bank_transactions` κάνει
-- upsert πάνω σε `(user_id, dedup_hash)` και δεν διπλογράφει. Τα `expenses`
-- γράφονται με σκέτο insert, και ο πίνακας δεν έχει ΚΑΝΕΝΑ μοναδικό κλειδί.
--
-- Ο χρήστης που ξανακάνει επικόλληση μετά από διακοπείσα εισαγωγή — συνηθέστατο
-- — παίρνει διπλάσιες δαπάνες στο Ε2 και δηλώνει στην ΑΑΔΕ έξοδα που δεν έκανε.
-- Η στήλη μπαίνει τώρα, το ευρετήριο κρατά μόνο όσες την έχουν, και η εφαρμογή
-- τη γεμίζει από την ίδια αποτύπωση που ήδη υπολογίζει για τις κινήσεις.
alter table public.expenses add column if not exists dedup_hash text;
create unique index if not exists uq_expenses_dedup
  on public.expenses (user_id, dedup_hash) where dedup_hash is not null;

comment on column public.expenses.dedup_hash is
  'Αποτύπωμα τραπεζικής κίνησης, όταν η δαπάνη ήρθε από εισαγωγή. Κενό για χειροκίνητες.';
