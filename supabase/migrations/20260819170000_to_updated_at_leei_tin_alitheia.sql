-- ═══════════════════════════════════════════════════════════════════════════
-- ΔΕΚΑΟΚΤΩ ΠΙΝΑΚΕΣ ΕΓΡΑΦΑΝ «ΠΟΤΕ ΑΛΛΑΞΕ» ΚΑΙ ΚΑΝΕΙΣ ΔΕΝ ΤΟ ΕΓΡΑΦΕ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΜΕΤΡΗΘΗΚΕ. Το σχήμα έχει τη συνάρτηση `update_updated_at_column()` από την
-- πρώτη μέρα και σκανδάλη που την καλεί έχουν ΔΥΟ πίνακες: `bills` και
-- `bills_settings`. Αλλοι είκοσι έχουν στήλη `updated_at` και καμία σκανδάλη που
-- να τη γράφει.
--
-- ΚΑΙ ΟΙ ΔΥΟ ΑΠΟ ΤΟΥΣ ΕΙΚΟΣΙ ΚΡΥΒΟΝΤΑΝ. Ο πρώτος έλεγχος ρώτησε «ποιοι πίνακες
-- δεν έχουν ΚΑΜΙΑ σκανδάλη» και έχασε δύο που έχουν άλλη: το `billing_profiles`
-- έχει το `lock_billing_plan` και το `notification_preferences` τη δική του.
-- Η σωστή ερώτηση είναι «ποιοι δεν έχουν σκανδάλη ΠΟΥ ΚΑΛΕΙ τη συνάρτηση».
--
-- ΤΙ ΣΗΜΑΙΝΕΙ ΑΥΤΟ ΣΤΗΝ ΠΡΑΞΗ. Η στήλη δεν είναι κενή: είναι ΛΑΘΟΣ. Κρατά την
-- τιμή που πήρε στην εισαγωγή (`default now()`) και δεν κουνιέται ξανά, όσες
-- φορές κι αν αλλάξει η γραμμή. Οποιος τη διαβάζει ως «πότε άλλαξε αυτό»
-- διαβάζει «πότε δημιουργήθηκε» — και το `created_at` δίπλα λέει το ίδιο.
--
-- Ο κώδικας το ήξερε και το έγραφε στο χέρι, σε τρία σημεία, με σχόλιο:
--
--     lib/data/billing.ts:17   «Το updated_at το έγραφε μία στις έξι»
--     lib/data/inventory.ts:4  «Το updated_at ήταν τυχαίο»
--     lib/data/settings.ts:16  «γραφόταν από το ρολόι του περιηγητή… το
--                               updated_at ανήκει στη βάση»
--
-- Η τελευταία διάγνωση είναι η σωστή και ισχύει και για τις άλλες δύο. Το
-- ρολόι του περιηγητή μπορεί να είναι λάθος ώρες ή μέρες και τότε η
-- ταξινόμηση «τελευταία αλλαγή πρώτη» βγάζει άλλη σειρά σε κάθε συσκευή.
--
-- ── ΓΙΑΤΙ ΣΚΑΝΔΑΛΗ ΚΑΙ ΟΧΙ ΠΕΙΘΑΡΧΙΑ ΣΤΟΝ ΚΩΔΙΚΑ ──────────────────────
-- Επειδή η πειθαρχία δοκιμάστηκε και απέτυχε τρεις φορές. Καθε νέα διαδρομή
-- εγγραφής πρέπει να θυμηθεί μια στήλη που δεν την αφορά· η σκανδάλη δεν
-- ξεχνιέται και δεν εξαρτάται από το ρολόι του πελάτη.
--
-- BEFORE UPDATE, όχι INSERT: στην εισαγωγή το `default now()` κάνει ήδη τη
-- δουλειά και μια σκανδάλη εκεί θα ήταν δεύτερη πηγή για το ίδιο πράγμα.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  -- Καθε πίνακας με στήλη `updated_at` που δεν είχε σκανδήλη, μετρημένος από
  -- το ίδιο το σχήμα σε πραγματικό Postgres.
  tables text[] := array[
    'accountant_dossier', 'ai_budget', 'ai_usage', 'bank_connections',
    'billing_profiles', 'bills_history', 'clients', 'email_marketing_prefs',
    'energy_tariffs', 'inventory_items', 'loans', 'market_rates',
    'messaging_prefs', 'notification_preferences', 'onboarding_progress',
    'pricing_settings', 'rent_config', 'report_branding', 'send_quota',
    'tenants'
  ];
begin
  foreach t in array tables loop
    -- Ο πίνακας μπορεί να μην υπάρχει σε παλιότερο στιγμιότυπο: η μετανάστευση
    -- δεν σκάει γι' αυτό, το προσπερνά.
    if to_regclass('public.' || quote_ident(t)) is null then continue; end if;
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.update_updated_at_column()',
      t || '_updated_at', t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ΤΡΙΑ ΞΕΝΑ ΚΛΕΙΔΙΑ ΧΩΡΙΣ ΕΥΡΕΤΗΡΙΟ, ΚΑΙ ΔΥΟ ΣΤΗΛΕΣ user_id ΧΩΡΙΣ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΞΕΝΟ ΚΛΕΙΔΙ ΔΕΝ ΦΤΙΑΧΝΕΙ ΕΥΡΕΤΗΡΙΟ ΜΟΝΟ ΤΟΥ. Το Postgres ευρετηριάζει
-- αυτόματα το ΠΡΩΤΕΥΟΝ κλειδί, όχι το ξένο. Καθε φορά που σβήνει γονική γραμμή,
-- πρέπει να σαρώσει ΟΛΟΚΛΗΡΟ τον πίνακα-παιδί για να επιβεβαιώσει τον
-- περιορισμό: η διαγραφή ενός ακινήτου σάρωνε ολόκληρο το `guest_checkins`.
--
-- ΚΑΙ Η RLS ΦΙΛΤΡΑΡΕΙ ΣΕ ΚΑΘΕ ΕΡΩΤΗΜΑ. Η πολιτική κάθε πίνακα λέει
-- `user_id = auth.uid()`. Χωρίς ευρετήριο στο `user_id`, ΚΑΘΕ ανάγνωση είναι
-- σειριακή σάρωση — όχι μόνο η αργή, όλες. Δύο πίνακες ήταν έτσι.
-- ═══════════════════════════════════════════════════════════════════════════
create index if not exists idx_client_stays_damage_item on public.client_stays (damage_item_id) where damage_item_id is not null;
create index if not exists idx_guest_checkins_property on public.guest_checkins (property_id);
create index if not exists idx_inventory_maintenance_user on public.inventory_maintenance (user_id);
create index if not exists idx_property_documents_user on public.property_documents (user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ΚΑΙ ΤΟ `property_documents.user_id` ΔΕΝ ΔΕΙΧΝΕ ΠΟΥΘΕΝΑ
-- ─────────────────────────────────────────────────────────────────────────
-- Ολοι οι άλλοι πίνακες με `user_id` έχουν ξένο κλειδί προς το `auth.users`.
-- Αυτός όχι: μία στήλη uuid, χωρίς εγγύηση ότι ο χρήστης υπάρχει.
--
-- ΓΙΑΤΙ Η ΚΑΘΑΡΙΟΤΗΤΑ ΠΡΩΤΑ ΕΙΝΑΙ ΑΣΦΑΛΗΣ. Μια γραμμή που δείχνει σε
-- ανύπαρκτο χρήστη είναι ΗΔΗ αόρατη: η πολιτική RLS ζητά
-- `user_id = auth.uid()` και κανένας δεν μπορεί να πιστοποιηθεί ως χρήστης
-- που δεν υπάρχει. Δεν σβήνουμε δεδομένα κάποιου· σβήνουμε γραμμές που κανείς
-- δεν μπορεί να διαβάσει, για να μπει ο περιορισμός που τις εμποδίζει στο εξής.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare n int;
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'property_documents_user_id_fkey'
      and conrelid = 'public.property_documents'::regclass
  ) then return; end if;

  delete from public.property_documents d
   where d.user_id is not null
     and not exists (select 1 from auth.users u where u.id = d.user_id);
  get diagnostics n = row_count;
  if n > 0 then
    raise notice 'Σβήστηκαν % γραμμές property_documents που έδειχναν σε ανύπαρκτο χρήστη', n;
  end if;

  alter table public.property_documents
    add constraint property_documents_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
end $$;
