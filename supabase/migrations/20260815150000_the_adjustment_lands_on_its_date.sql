-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΑΝΑΠΡΟΣΑΡΜΟΓΗ ΜΕ ΜΕΛΛΟΝΤΙΚΗ ΙΣΧΥ ΕΦΑΡΜΟΖΟΤΑΝ ΣΗΜΕΡΑ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ. Το RentAdjustmentModal εκδίδει υπογεγραμμένη ειδοποίηση με πεδίο
-- «Ισχύς από» και, μόλις κατέβει το PDF, γράφει `tenants.monthly_rent` με το
-- ΝΕΟ ποσό. Χωρίς εξαίρεση για την ημερομηνία. Ειδοποίηση υπογεγραμμένη τον
-- Αύγουστο με ισχύ 01/01/2027 ανέβαζε το μίσθωμα του Αυγούστου.
--
-- ΤΙ ΚΟΣΤΙΖΕ. Το `monthly_rent` δεν είναι πεδίο οθόνης: γεννά τις δόσεις της
-- καρτέλας Χρήματα, γεμίζει το αίτημα πληρωμής, φαίνεται στην πύλη του
-- μισθωτή και αθροίζεται στο Ε2. Ο μισθωτής έβλεπε στην πύλη του αυξημένο
-- ποσό πέντε μήνες πριν την ημερομηνία που του κοινοποιήθηκε εγγράφως — και ο
-- ίδιος κρατούσε το PDF που έγραφε την πραγματική ημερομηνία.
--
-- ΓΙΑΤΙ ΔΕΝ ΑΡΚΕΙ ΝΑ ΜΗ ΓΡΑΦΕΤΑΙ. Η προηγούμενη κατάσταση —έγγραφο χωρίς
-- εγγραφή— είναι το σφάλμα που διορθώθηκε χθες: το μίσθωμα έμενε για πάντα το
-- παλιό και ο ιδιοκτήτης το ανακάλυπτε τον Μάρτιο. Η μελλοντική ισχύς θέλει
-- ΡΑΝΤΕΒΟΥ, όχι σιωπή.
--
-- ΤΙ ΓΙΝΕΤΑΙ ΑΝΤΙ ΓΙ' ΑΥΤΟ. Δύο στήλες κρατούν το ραντεβού και μία εργασία το
-- τηρεί:
--
--   pending_rent       το ποσό που θα ισχύσει
--   pending_rent_from  η ημερομηνία που το ενεργοποιεί
--
-- Κάθε νύχτα η `apply_due_rent_adjustments()` μεταφέρει όσα ωρίμασαν στο
-- `monthly_rent` και αδειάζει το ραντεβού. Η οθόνη του μισθωτή δείχνει το
-- εκκρεμές ποσό με την ημερομηνία του, ώστε τίποτα να μη συμβαίνει κρυφά.
--
-- ΓΙΑΤΙ ΟΧΙ ΥΠΟΛΟΓΙΣΜΟΣ ΚΑΤΑ ΤΗΝ ΑΝΑΓΝΩΣΗ. Το `monthly_rent` διαβάζεται σε 83
-- σημεία. Μια συνάρτηση «ποιο είναι το μίσθωμα σήμερα» θα έπρεπε να μπει και
-- στα 83, και το πρώτο που θα ξεχνιόταν θα ήταν πάλι λάθος νούμερο σε
-- έγγραφο. Η στήλη μένει Η ΑΛΗΘΕΙΑ ΤΗΣ ΗΜΕΡΑΣ και ενημερώνεται στην ώρα της.
--
-- ΙΔΙΟΤΗΤΕΣ ΠΟΥ ΧΡΕΙΑΖΟΝΤΑΙ ΡΗΤΗ ΑΝΑΦΟΡΑ:
--   · Η εργασία είναι ΑΘΩΑ ΣΤΗΝ ΕΠΑΝΑΛΗΨΗ. Αδειάζει το ραντεβού μαζί με τη
--     μεταφορά, οπότε δεύτερο τρέξιμο δεν βρίσκει τίποτα.
--   · Πιάνει και τα ΞΕΧΑΣΜΕΝΑ. Η συνθήκη είναι `<= current_date`, όχι
--     `= current_date`: αν η εργασία δεν τρέξει για τρεις μέρες, την τέταρτη
--     εφαρμόζονται όλα όσα ωρίμασαν στο μεταξύ.
--   · ΜΟΝΟ ΕΝΕΡΓΕΣ ΜΙΣΘΩΣΕΙΣ. Μίσθωση που έληξε πριν την ημερομηνία ισχύος
--     δεν παίρνει το νέο μίσθωμα· το ραντεβού απλώς ακυρώνεται.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.tenants add column if not exists pending_rent numeric;
alter table public.tenants add column if not exists pending_rent_from date;

comment on column public.tenants.pending_rent is
  'Μίσθωμα αναπροσαρμογής με μελλοντική ισχύ. Δεν είναι το τρέχον μίσθωμα.';
comment on column public.tenants.pending_rent_from is
  'Ημερομηνία από την οποία το pending_rent γίνεται monthly_rent.';

-- Το ραντεβού είναι ΖΕΥΓΟΣ. Ποσό χωρίς ημερομηνία δεν εφαρμόζεται ποτέ και
-- ημερομηνία χωρίς ποσό είναι εγγραφή που δεν λέει τίποτα· και τα δύο θα
-- έμεναν σιωπηλά στη γραμμή για πάντα.
alter table public.tenants drop constraint if exists tenants_pending_rent_pair;
alter table public.tenants add constraint tenants_pending_rent_pair
  check ((pending_rent is null) = (pending_rent_from is null));

-- Αρνητικό ή μηδενικό μίσθωμα δεν υπάρχει. Το πεδίο της οθόνης το φιλτράρει
-- ήδη, αλλά η στήλη γράφεται και από αλλού.
alter table public.tenants drop constraint if exists tenants_pending_rent_positive;
alter table public.tenants add constraint tenants_pending_rent_positive
  check (pending_rent is null or pending_rent > 0);

-- Μερικό ευρετήριο: οι γραμμές με ραντεβού είναι ελάχιστες μπροστά στο σύνολο,
-- και η νυχτερινή εργασία δεν έχει λόγο να διαβάζει ολόκληρο τον πίνακα.
create index if not exists tenants_pending_rent_due_idx
  on public.tenants (pending_rent_from)
  where pending_rent is not null;

create or replace function public.apply_due_rent_adjustments()
returns integer
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  applied integer;
begin
  with due as (
    update public.tenants
       set monthly_rent      = pending_rent,
           pending_rent      = null,
           pending_rent_from = null,
           updated_at        = now()
     where pending_rent is not null
       and pending_rent_from <= current_date
       -- Μίσθωση που έχει ήδη λήξει δεν αναπροσαρμόζεται. Το ραντεβού
       -- ακυρώνεται παρακάτω, ώστε να μη μένει να κοιτάζει το κενό.
       and (lease_end is null or lease_end >= pending_rent_from)
    returning 1
  )
  select count(*) into applied from due;

  update public.tenants
     set pending_rent      = null,
         pending_rent_from = null,
         updated_at        = now()
   where pending_rent is not null
     and pending_rent_from <= current_date
     and lease_end is not null
     and lease_end < pending_rent_from;

  return applied;
end;
$$;

-- Την καλεί ο χρονοδρομολογητής, κανείς άλλος. Ενας πελάτης που θα μπορούσε να
-- την τρέξει, θα μπορούσε να επισπεύσει την αύξηση κατά πέντε μήνες.
revoke all on function public.apply_due_rent_adjustments() from public;
revoke all on function public.apply_due_rent_adjustments() from anon;
revoke all on function public.apply_due_rent_adjustments() from authenticated;
grant execute on function public.apply_due_rent_adjustments() to service_role;

comment on function public.apply_due_rent_adjustments() is
  'Μεταφέρει στο monthly_rent τις αναπροσαρμογές που ωρίμασαν. Ιδιοδύναμη: '
  'αδειάζει το ραντεβού μαζί με τη μεταφορά.';

-- ΩΡΑ: 03:10, πριν τις υπενθυμίσεις των 06:00 και πριν ανοίξει οθόνη κανείς.
-- Ετσι η πρώτη ανάγνωση της ημέρας βλέπει ήδη το νέο ποσό.
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('rent-adjustments-daily')
      where exists (select 1 from cron.job where jobname = 'rent-adjustments-daily');
    perform cron.schedule('rent-adjustments-daily', '10 3 * * *',
      $cron$ select public.apply_due_rent_adjustments(); $cron$);
  end if;
end
$do$;
