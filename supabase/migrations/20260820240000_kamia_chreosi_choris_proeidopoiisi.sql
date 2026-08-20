-- ═══════════════════════════════════════════════════════════════════════════
-- ΚΑΝΕΝΑ ΠΟΣΟ ΔΕΝ ΦΕΥΓΕΙ ΑΠΟ ΚΑΡΤΑ ΧΩΡΙΣ ΠΡΟΕΙΔΟΠΟΙΗΣΗ
-- ─────────────────────────────────────────────────────────────────────────
-- ΟΙ ΟΡΟΙ ΤΟ ΥΠΟΣΧΟΝΤΑΙ ΚΑΙ ΔΕΝ ΥΠΗΡΧΕ. «Λαμβάνεις ειδοποίηση πριν από κάθε
-- ανανέωση», «στην ετήσια στέλνουμε υπενθύμιση τουλάχιστον τριάντα ημέρες πριν
-- και στη μηνιαία τουλάχιστον τρεις». Το μόνο μήνυμα γύρω από τη χρέωση ήταν το
-- `trial_ending`, και εκείνο φεύγει ΜΟΝΟ σε όποιον έχει `plan = 'free'`, δηλαδή
-- σε όποιον ΔΕΝ πρόκειται να χρεωθεί. Οποιος έδωσε κάρτα στην εγγραφή δεν
-- άκουγε τίποτα ώς την ημέρα που έφευγαν τα χρήματα.
--
-- Μια ετήσια χρέωση 249,00 € που έρχεται δώδεκα μήνες μετά την τελευταία φορά
-- που τη σκέφτηκε κανείς δεν είναι απλώς δυσάρεστη: είναι ο νούμερο ένα λόγος
-- αμφισβήτησης χρέωσης, και η αμφισβήτηση κοστίζει και το ποσό και τη φήμη.
--
-- ── ΕΝΑΣ ΚΑΝΟΝΑΣ ΓΙΑ ΟΛΕΣ ΤΙΣ ΧΡΕΩΣΕΙΣ ──────────────────────────────────
-- Η πρώτη χρέωση μετά τη δοκιμή ΔΕΝ είναι ξεχωριστή περίπτωση: κατά τον έμπορο
-- η ημερομηνία της είναι το `renews_at` της συνδρομής, όπως και κάθε επόμενης.
-- Ενας κανόνας, ένα πρότυπο, καμία περίπτωση να καλυφθεί η μία και να ξεχαστεί
-- η άλλη. Το πρότυπο αλλάζει μόνο τον τίτλο του, από δεδομένο.
--
-- ── ΤΟ ΠΑΡΑΘΥΡΟ ΕΧΕΙ ΠΛΑΤΟΣ, ΚΑΙ ΤΟ ΚΛΕΙΔΙ ΤΟ ΚΡΑΤΑ ΜΟΝΟ ────────────────
-- Τριάντα ώς είκοσι οκτώ ημέρες πριν για την ετήσια, τρεις ώς δύο για τη
-- μηνιαία: μια χαμένη εκτέλεση του cron δεν σημαίνει χαμένο μήνυμα. Το
-- `dedup_key` κρατά ΤΗΝ ΗΜΕΡΟΜΗΝΙΑ ΑΝΑΝΕΩΣΗΣ μέσα του, οπότε φεύγει ακριβώς
-- ένα μήνυμα ανά ανανέωση — και το επόμενο έτος, με άλλη ημερομηνία, φεύγει
-- κανονικά.
--
-- ── ΚΑΙ ΓΙΑΤΙ ΟΙ ΤΙΜΕΣ ΜΠΑΙΝΟΥΝ ΣΤΗ ΒΑΣΗ ────────────────────────────────
-- Το μήνυμα πρέπει να λέει ΠΟΣΟ. Το ποσό ζει στο lib/billing/plans.ts, που η
-- βάση δεν το βλέπει, και το κείμενο του email τρέχει σε συνάρτηση άκρης, που
-- δεν βλέπει ούτε αυτή. Η τιμή γράφεται εδώ, μία φορά, και το db-replay την
-- αντιπαραβάλλει με το PLANS: ίδιο ιδίωμα με το `trial_days` και το
-- `plan_rank`. Χωρίς τον αντιπαραβολικό έλεγχο, μια αύξηση τιμής θα άφηνε
-- πίσω της emails που ανακοινώνουν λάθος ποσό — δηλαδή ψέμα με ημερομηνία.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Η ΤΙΜΗ ΕΝΟΣ ΠΑΚΕΤΟΥ ΑΝΑ ΚΥΚΛΟ ───────────────────────────────────────
create or replace function public.plan_price(p_plan text, p_cycle text)
returns numeric language sql immutable
set search_path = public
as $$
  select case
    when p_cycle = 'annual' then
      case p_plan
        when 'solo'   then 42.90
        when 'owner'  then 99.00
        when 'agency' then 249.00
        when 'office' then 799.00
        else 0
      end
    else
      case p_plan
        when 'solo'   then 3.90
        when 'owner'  then 9.90
        when 'agency' then 24.90
        when 'office' then 79.90
        else 0
      end
  end
$$;

comment on function public.plan_price(text, text) is
  'Η τιμή ενός πακέτου ανά κύκλο, σε ευρώ. Ταυτόσημη με το PLANS του lib/billing/plans.ts· το db-replay τις αντιπαραβάλλει και οι δύο πλευρές.';

-- ── Η ΠΡΟΑΝΑΓΓΕΛΙΑ ΧΡΕΩΣΗΣ ──────────────────────────────────────────────
create or replace function public.charge_upcoming_enqueue()
returns integer
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare v_before int; v_after int;
begin
  select count(*) into v_before from public.email_outbox;

  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'charge_upcoming',
         lower(trim(u.email)),
         coalesce(nullif(trim(bp.owner_name), ''), nullif(trim(bp.full_name), '')),
         jsonb_build_object(
           'name', coalesce(nullif(trim(bp.owner_name), ''), nullif(trim(bp.full_name), '')),
           'amount', public.plan_price(bp.plan, bp.billing_cycle),
           'deadlineDate', to_char(bp.mor_renews_at, 'DD/MM/YYYY')
         )
         -- Η ΠΡΩΤΗ ΧΡΕΩΣΗ ΑΝΑΓΝΩΡΙΖΕΤΑΙ ΑΠΟ ΤΗΝ ΚΑΤΑΣΤΑΣΗ, ΟΧΙ ΑΠΟ ΗΜΕΡΟΛΟΓΙΟ.
         -- Οσο η συνδρομή είναι σε δοκιμή, το `renews_at` ΕΙΝΑΙ η ημέρα που
         -- τελειώνει η δοκιμή· το πρότυπο αλλάζει τίτλο όταν δει αυτό το πεδίο.
         || case when bp.subscription_status = 'on_trial'
                 then jsonb_build_object('trialDaysLeft', greatest(1, (bp.mor_renews_at::date - current_date)))
                 else '{}'::jsonb end,
         'transactional',
         'charge_upcoming:' || u.id || ':' || to_char(bp.mor_renews_at, 'YYYY-MM-DD'),
         now()
    from public.billing_profiles bp
    join auth.users u on u.id = bp.user_id
   where u.email is not null and trim(u.email) <> ''
     and u.email_confirmed_at is not null
     and u.deleted_at is null
     -- Ζωντανή συνδρομή που ΘΑ ανανεωθεί. Η ακυρωμένη έχει ημερομηνία λήξης
     -- και δεν πρόκειται να χρεώσει: μια «υπενθύμιση ανανέωσης» εκεί θα ήταν
     -- τρομακτική και ψευδής μαζί.
     and bp.mor_subscription_id is not null
     and bp.mor_ends_at is null
     and bp.mor_renews_at is not null
     and coalesce(bp.plan, 'free') <> 'free'
     and bp.subscription_status in ('on_trial', 'active', 'past_due')
     -- Το παράθυρο, ανά κύκλο. Το πλάτος υπάρχει για τη χαμένη εκτέλεση.
     and (bp.mor_renews_at::date - current_date) between
           case when bp.billing_cycle = 'annual' then 28 else 2 end
       and case when bp.billing_cycle = 'annual' then 30 else 3 end
  on conflict (dedup_key) do nothing;

  select count(*) into v_after from public.email_outbox;
  return (v_after - v_before)::int;
end;
$$;

revoke all on function public.charge_upcoming_enqueue() from public, anon, authenticated;
grant execute on function public.charge_upcoming_enqueue() to service_role;

comment on function public.charge_upcoming_enqueue() is
  'Προαναγγέλλει κάθε χρέωση συνδρομής: 30 ημέρες πριν στην ετήσια, 3 στη μηνιαία, μία φορά ανά ανανέωση. Καλύπτει και την πρώτη χρέωση μετά τη δοκιμή, γιατί για τον έμπορο είναι κι εκείνη ανανέωση.';

-- ── ΚΑΙ ΤΟ ΤΡΙΤΟ ΧΡΟΝΟΜΕΤΡΟ ΤΩΝ ΤΡΙΑΝΤΑ ΗΜΕΡΩΝ ΓΙΝΕΤΑΙ ΕΝΑ ΜΕ ΤΑ ΑΛΛΑ ──
-- Το `trial_ending_enqueue` έγραφε το «30» τρεις φορές με το χέρι: στο ποσό
-- των ημερών που απομένουν και στα δύο άκρα του παραθύρου. Δύο χρονόμετρα
-- έγιναν ένα στο 20260820220000· αυτό ήταν το τρίτο, και κανείς δεν το είδε
-- γιατί ζει μέσα σε συνάρτηση ουράς email.
create or replace function public.trial_ending_enqueue()
returns integer
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare v_before int; v_after int;
begin
  select count(*) into v_before from public.email_outbox;

  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'trial_ending',
         lower(trim(u.email)),
         coalesce(nullif(trim(bp.owner_name), ''), nullif(trim(bp.full_name), '')),
         jsonb_build_object(
           'name', coalesce(nullif(trim(bp.owner_name), ''), nullif(trim(bp.full_name), '')),
           'trialDaysLeft', public.trial_days() - (current_date - u.created_at::date)
         ),
         'transactional',
         'trial_ending:'||u.id,
         now()
    from auth.users u
    left join public.billing_profiles bp on bp.user_id = u.id
   where u.email is not null and trim(u.email) <> ''
     and u.email_confirmed_at is not null
     and u.deleted_at is null
     -- Το παράθυρο: οι τρεις τελευταίες ημέρες της δοκιμής. Τρεις ημέρες
     -- πλάτος, ώστε μια χαμένη εκτέλεση του cron να μη σημαίνει χαμένο μήνυμα·
     -- το dedup_key εξασφαλίζει ότι φεύγει μία μόνο φορά.
     and (current_date - u.created_at::date)
           between public.trial_days() - 3 and public.trial_days() - 1
     -- ΜΟΝΟ ΟΠΟΙΟΣ ΔΕΝ ΘΑ ΧΡΕΩΘΕΙ. Οποιος έδωσε κάρτα έχει πακέτο και παίρνει
     -- το `charge_upcoming`, που λέει ποσό και ημερομηνία· δύο μηνύματα για το
     -- ίδιο γεγονός, με αντικρουόμενο νόημα, είναι χειρότερα από κανένα.
     and coalesce(bp.plan, 'free') = 'free'
     and (bp.comp_until is null or bp.comp_until <= now())
  on conflict (dedup_key) do nothing;

  select count(*) into v_after from public.email_outbox;
  return (v_after - v_before)::int;
end;
$$;

revoke all on function public.trial_ending_enqueue() from public, anon, authenticated;
grant execute on function public.trial_ending_enqueue() to service_role;

comment on function public.trial_ending_enqueue() is
  'Στέλνει το trial_ending τις τρεις τελευταίες ημέρες της δοκιμής, μία φορά ανά λογαριασμό, ΜΟΝΟ σε όποιον δεν έχει δηλώσει μέσο πληρωμής. Το μήκος της δοκιμής βγαίνει από το public.trial_days().';

-- ── Η ΩΡΑ ΤΗΣ ΕΚΤΕΛΕΣΗΣ ─────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'charge-upcoming-daily') then
    perform cron.unschedule('charge-upcoming-daily');
  end if;
  perform cron.schedule('charge-upcoming-daily', '20 7 * * *',
    $cron$ select public.charge_upcoming_enqueue(); $cron$);
end $$;
