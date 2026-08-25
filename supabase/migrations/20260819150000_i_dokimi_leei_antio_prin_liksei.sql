-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΜΟΝΑΔΙΚΗ ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΗ ΣΤΙΓΜΗ ΑΠΟΦΑΣΗΣ ΔΕΝ ΕΙΧΕ ΜΗΝΥΜΑ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΙΣΧΥΕ. Η δοκιμή μετρά τριάντα ημέρες από τη δημιουργία του λογαριασμού
-- (user_plan_rank· lib/billing/entitlements.ts trialState). Κανείς δεν την
-- ξεκινά και κανείς δεν την ανακοινώνει: την 31η ημέρα ο χρήστης απλώς
-- ανακαλύπτει ότι έχασε την εξαγωγή Ε2 και την είσπραξη ενοικίου.
--
-- Το πρότυπο `trial_ending` υπάρχει γραμμένο (emailCopy.ts:584), έχει βαθμό
-- προτεραιότητας στην πολιτική (emailPolicy.ts) και τεκμηριωμένο χρόνο «δύο
-- ημέρες πριν τη λήξη». Το `lifecycle_enqueue` δεν το ανέφερε ΠΟΥΘΕΝΑ: μηδέν
-- εμφανίσεις της λέξης «trial» σε ολόκληρη τη συνάρτηση.
--
-- ΓΙΑΤΙ ΕΙΝΑΙ ΤΟ ΠΙΟ ΑΚΡΙΒΟ ΜΗΝΥΜΑ ΠΟΥ ΔΕΝ ΣΤΑΛΘΗΚΕ. Είναι το μόνο σημείο
-- όπου ο χρήστης έχει ήδη στήσει τα ακίνητά του, έχει δει τι κάνει το
-- προϊόν και ΠΡΕΠΕΙ να αποφασίσει. Σιωπή εκεί δεν σημαίνει «δεν ενόχλησα»·
-- σημαίνει «δεν ρώτησα».
--
-- ΠΟΤΕ ΦΕΥΓΕΙ. Τρεις ημέρες πριν τη λήξη, δηλαδή την 27η ημέρα. Το πρότυπο
-- δέχεται `trialDaysLeft` και γράφει μόνο του «Σε 3 μέρες».
--
-- ΚΑΤΗΓΟΡΙΑ. `transactional`, ΟΧΙ `marketing` και ο λόγος είναι ουσιαστικός:
-- ανακοινώνει αλλαγή στους όρους της υπηρεσίας που ήδη χρησιμοποιεί ο
-- χρήστης — τι θα πάψει να δουλεύει και πότε. Ως `marketing` θα κρατιόταν
-- πίσω από τον κεντρικό διακόπτη `emails_live` και θα έληγε μετά από δύο
-- ημέρες αστάλτο, δηλαδή ακριβώς όταν χρειάζεται.
--
-- ΜΙΑ ΦΟΡΑ ΑΝΑ ΛΟΓΑΡΙΑΣΜΟ. Το `dedup_key` δεν έχει ημερομηνία μέσα του: η
-- δοκιμή είναι μοναδικό γεγονός στη ζωή του λογαριασμού και το μήνυμα δεν
-- επαναλαμβάνεται αν η συνάρτηση τρέξει δεύτερη φορά την ίδια ημέρα.
--
-- ΔΕΝ ΣΤΕΛΝΕΤΑΙ ΣΕ ΟΠΟΙΟΝ ΗΔΗ ΠΛΗΡΩΝΕΙ. Οποιος έχει πακέτο ή δωρεάν μήνες
-- δεν έχει τίποτα να χάσει την 31η ημέρα και το μήνυμα θα ήταν λάθος.
-- ═══════════════════════════════════════════════════════════════════════════

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
           'trialDaysLeft', 30 - (current_date - u.created_at::date)
         ),
         'transactional',
         'trial_ending:'||u.id,
         now()
    from auth.users u
    left join public.billing_profiles bp on bp.user_id = u.id
   where u.email is not null and trim(u.email) <> ''
     and u.email_confirmed_at is not null
     and u.deleted_at is null
     -- Το παράθυρο: ημέρες 27 ώς 29. Τρεις ημέρες πλάτος, ώστε μια χαμένη
     -- εκτέλεση του cron να μη σημαίνει χαμένο μήνυμα· το dedup_key
     -- εξασφαλίζει ότι φεύγει μία μόνο φορά.
     and (current_date - u.created_at::date) between 27 and 29
     -- Μόνο όποιος δεν πληρώνει και δεν έχει δωρεάν μήνες: για τους
     -- υπόλοιπους δεν λήγει τίποτα.
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
  'Στέλνει το trial_ending τρεις ημέρες πριν λήξει η δοκιμή, μία φορά ανά λογαριασμό, μόνο σε όποιον δεν πληρώνει ήδη.';

-- ── Το πρόγραμμα, με το ίδιο ιδίωμα με το lifecycle-enqueue-daily ─────────
-- Στις 07:10 UTC, πέντε λεπτά μετά τη μηχανή κύκλου ζωής: η ουρά είναι ήδη
-- γεμάτη και το drain_email_outbox που ακολουθεί τα παίρνει όλα μαζί.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'trial-ending-daily') then
    perform cron.unschedule('trial-ending-daily');
  end if;
  perform cron.schedule('trial-ending-daily', '10 7 * * *', $cron$ select public.trial_ending_enqueue(); $cron$);
end $$;
