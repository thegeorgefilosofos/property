-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΚΑΤΗΓΟΡΙΑ ΜΑΘΑΙΝΕΙ ΑΠΟ ΤΙΣ ΔΙΟΡΘΩΣΕΙΣ ΤΟΥ ΙΔΙΟΚΤΗΤΗ
-- ─────────────────────────────────────────────────────────────────────────
-- Η ταξινομία (lib/expenses/taxonomy.ts) διαβάζει το κείμενο και προτείνει
-- κατηγορία. Ειναι καλή, και δεν μπορεί να είναι σωστή για όλους: το ίδιο
-- «Οικοδομικές εργασίες ΑΕ» είναι επισκευή για τον έναν και ανακαίνιση για τον
-- άλλον, και το «Ζαχαρόπουλος» δεν λέει τίποτα σε κανένα λεξικό.
--
-- ΜΕΧΡΙ ΣΗΜΕΡΑ Η ΔΙΟΡΘΩΣΗ ΧΑΝΟΤΑΝ. Ο ιδιοκτήτης άλλαζε την κατηγορία, την
-- επόμενη φορά ερχόταν πάλι λάθος, και την ξανάλλαζε. Δώδεκα φορές τον χρόνο
-- για τον ίδιο πάροχο.
--
-- ── ΤΙ ΚΡΑΤΑΕΙ ΑΥΤΟΣ Ο ΠΙΝΑΚΑΣ ──────────────────────────────────────────
-- Μία γραμμή ανά ΠΑΡΟΧΟ ΚΑΙ ΧΡΗΣΤΗ: «όταν βλέπεις αυτόν, γράψε αυτό». Το
-- `vendor_key` είναι το όνομα κανονικοποιημένο (πεζά, χωρίς τόνους), ώστε
-- «ΔΕΗ», «Δεη» και «δεη» να είναι ένα πράγμα.
--
-- ── ΓΙΑΤΙ ΑΝΑ ΧΡΗΣΤΗ ΚΑΙ ΟΧΙ ΓΙΑ ΟΛΟΥΣ ──────────────────────────────────
-- Μια «κοινή γνώση» που μαθαίνει από όλους θα μετέφερε τη λογιστική επιλογή
-- του ενός στα βιβλία του άλλου. Η κατηγορία κρίνει την ΕΚΠΕΣΙΜΟΤΗΤΑ, δηλαδή
-- φόρο: δεν είναι πράγμα που δανείζεται από αγνώστους.
--
-- ── ΤΡΕΙΣ ΣΤΗΛΕΣ, ΚΑΙ ΚΑΜΙΑ ΤΕΤΑΡΤΗ ─────────────────────────────────────
-- Δοκιμάστηκαν και δύο ακόμη: `hits` («πόσες φορές επιβεβαιώθηκε») και
-- `updated_at`. Καμία οθόνη δεν θα τις διάβαζε και καμία απόφαση δεν θα τις
-- κοίταζε: αριθμοί που γερνούν μόνοι τους. Οταν χρειαστεί ιστορικό, θα γραφτεί
-- για κάτι που κάποιος ρωτά.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.category_hints (
  user_id    uuid not null references auth.users(id) on delete cascade,
  vendor_key text not null,
  category   text not null,
  primary key (user_id, vendor_key)
);

comment on table public.category_hints is
  'Μία γραμμή ανά πάροχο και χρήστη: η κατηγορία που διόρθωσε ο ίδιος, για να μη χρειαστεί να τη διορθώσει ξανά.';

alter table public.category_hints enable row level security;

drop policy if exists category_hints_own_select on public.category_hints;
create policy category_hints_own_select on public.category_hints
  for select using ((select auth.uid()) = user_id);

drop policy if exists category_hints_own_insert on public.category_hints;
create policy category_hints_own_insert on public.category_hints
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists category_hints_own_update on public.category_hints;
create policy category_hints_own_update on public.category_hints
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ΤΟ ΣΒΗΣΙΜΟ ΕΙΝΑΙ ΜΕΡΟΣ ΤΗΣ ΜΑΘΗΣΗΣ, ΟΧΙ ΕΞΑΙΡΕΣΗ. Οταν ο ιδιοκτήτης
-- ξαναδιαλέξει αυτό που έλεγε εξαρχής η ταξινομία, ο κανόνας του δεν χρειάζεται
-- πια και φεύγει. Ενας κανόνας που δεν αλλάζει τίποτα είναι μόνο βάρος.
drop policy if exists category_hints_own_delete on public.category_hints;
create policy category_hints_own_delete on public.category_hints
  for delete using ((select auth.uid()) = user_id);
