-- ═══════════════════════════════════════════════════════════════════════════
-- Ο WEBHOOK ΕΓΡΑΦΕ ΣΕ ΓΡΑΜΜΗ ΠΟΥ ΜΠΟΡΕΙ ΝΑ ΜΗΝ ΥΠΑΡΧΕΙ — ΚΑΙ ΑΠΑΝΤΟΥΣΕ 200
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ, ΚΑΙ ΓΙΑΤΙ ΕΙΝΑΙ ΤΟ ΧΕΙΡΟΤΕΡΟ ΕΙΔΟΥΣ. Ο χειριστής πληρωμών κάνει
-- `update billing_profiles … where user_id = …`. Η γραμμή όμως δεν γεννιέται
-- με τον λογαριασμό: γεννιέται ΤΕΜΠΕΛΙΚΑ, την πρώτη φορά που ο χρήστης θα
-- αποθηκεύσει κάτι από την οθόνη υποδοχής — μια οθόνη που παρακάμπτεται.
--
-- Το PostgREST δεν θεωρεί σφάλμα το «ταίριαξαν μηδέν γραμμές». Ο χειριστής
-- έγραφε «εφαρμόστηκε» στα αρχεία καταγραφής και απαντούσε 200 στον έμπορο.
-- Δηλαδή: ΠΕΛΑΤΗΣ ΧΡΕΩΜΕΝΟΣ, ΧΩΡΙΣ ΠΑΚΕΤΟ, ΧΩΡΙΣ ΚΑΝΕΝΑ ΙΧΝΟΣ. Ο έμπορος
-- βλέπει επιτυχία και δεν ξαναστέλνει ποτέ το γεγονός.
--
-- ΣΗΜΕΡΑ ΕΙΝΑΙ ΣΠΑΝΙΟ. ΑΥΡΙΟ ΕΙΝΑΙ Ο ΚΑΝΟΝΑΣ. Με το μοντέλο όπου η κάρτα
-- δίνεται ΣΤΗΝ ΕΓΓΡΑΦΗ, η πληρωμή προηγείται κάθε οθόνης της εφαρμογής: η
-- γραμμή δεν θα υπάρχει ΠΟΤΕ την ώρα που φτάνει το πρώτο γεγονός.
--
-- ── Η ΘΕΡΑΠΕΙΑ ΕΙΝΑΙ ΣΤΗ ΒΑΣΗ, ΟΧΙ ΣΤΟΝ ΧΕΙΡΙΣΤΗ ──────────────────────────
-- Θα μπορούσε ο χειριστής να κάνει `upsert`. Δεν αρκεί: τη γραμμή τη ζητούν
-- και το ταμείο (για τον τύπο προφίλ), και η πύλη διαχείρισης, και η οθόνη
-- τιμολόγησης. Οποιος τη γεννά τεμπέλικα, τη γεννά και λάθος κάποια στιγμή.
-- Γεννιέται μία φορά, μαζί με τον λογαριασμό, όπως ήδη γίνεται με τη γραμμή
-- των ειδοποιήσεων (20260819140000).
--
-- ΜΟΝΟ ΤΟ `user_id`. Καθε άλλη στήλη παίρνει την προεπιλογή του πίνακα· αν
-- αύριο αλλάξει εκεί, αλλάζει και εδώ χωρίς να το θυμηθεί κανείς.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.ensure_billing_profile()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  insert into public.billing_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_billing_profile() from public, anon, authenticated;

drop trigger if exists trg_ensure_billing_profile on auth.users;
create trigger trg_ensure_billing_profile
  after insert on auth.users
  for each row execute function public.ensure_billing_profile();

comment on function public.ensure_billing_profile() is
  'Γεννά τη γραμμή χρέωσης μαζί με τον λογαριασμό. Χωρίς αυτήν, ο webhook του εμπόρου ενημερώνει μηδέν γραμμές και απαντά επιτυχία: πληρωμένος πελάτης χωρίς πακέτο.';

-- ── Αναδρομικά, για όσους λογαριασμούς υπάρχουν ήδη ───────────────────────
-- Ιδιοδύναμο: όποιος έχει ήδη γραμμή δεν αγγίζεται.
insert into public.billing_profiles (user_id)
select u.id from auth.users u
 where u.deleted_at is null
   and not exists (select 1 from public.billing_profiles b where b.user_id = u.id)
on conflict (user_id) do nothing;

-- ── ΚΑΙ Η ΠΡΟΕΠΙΛΟΓΗ ΤΗΣ ΣΤΗΛΗΣ ΛΕΕΙ ΟΝΟΜΑ ΠΑΚΕΤΟΥ ΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ ───────
-- Η `plan` γεννιόταν ως 'trial'. Κανένα πακέτο δεν λέγεται έτσι: η
-- `normalizePlan` (lib/billing/plans.ts:244) δέχεται μόνο solo/owner/agency/
-- office και ό,τι άλλο το γυρίζει σε 'free'. Δηλαδή κάθε νέα γραμμή γεννιόταν
-- με τιμή που ο κώδικας αναγκάζεται να διορθώσει σε κάθε ανάγνωση, και που σε
-- ένα ερώτημα SQL —αναφορά, υποστήριξη, έλεγχος— διαβάζεται ως «σε δοκιμή»
-- ενώ η δοκιμή δεν κρίνεται από εδώ.
--
-- Η προεπιλογή γίνεται 'free', που είναι υπαρκτό πακέτο και σημαίνει ακριβώς
-- αυτό που ισχύει: κανένα πληρωμένο πακέτο ακόμη.
alter table public.billing_profiles alter column plan set default 'free';
-- Οι υπάρχουσες γραμμές με το φάντασμα γίνονται κι αυτές 'free': ο κώδικας
-- ήδη τις διαβάζει έτσι, οπότε καμία πρόσβαση δεν αλλάζει — μόνο η βάση
-- σταματά να λέει κάτι διαφορετικό από την εφαρμογή.
update public.billing_profiles set plan = 'free' where plan = 'trial';

-- Ομοίως η `subscription_status`: γεννιόταν 'trialing', όνομα του παρόχου που
-- δεν επιλέχθηκε ποτέ. Οι καταστάσεις του εμπόρου είναι on_trial/active/
-- paused/past_due/unpaid/cancelled/expired (lib/billing/lemon.ts). Κενό
-- σημαίνει «καμία συνδρομή», που είναι η αλήθεια για κάθε νέο λογαριασμό.
alter table public.billing_profiles alter column subscription_status set default null;
update public.billing_profiles set subscription_status = null where subscription_status = 'trialing';
