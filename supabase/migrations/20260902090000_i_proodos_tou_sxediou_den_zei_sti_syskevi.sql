-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΠΡΟΟΔΟΣ ΤΟΥ ΣΧΕΔΙΟΥ ΔΕΝ ΖΕΙ ΣΕ ΜΙΑ ΣΥΣΚΕΥΗ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΗΤΑΝ. Ολη η Αξιοποίηση κρατούσε την κατάστασή της στο `localStorage` του
-- περιηγητή: ποια βήματα έχουν γίνει, τι είδους εκκρεμότητα είναι, τι κοστίζει
-- ο κενός μήνας. Δηλαδή ο ιδιοκτήτης που τσέκαρε οκτώ βήματα στο κινητό του
-- τα έβρισκε ΑΤΣΕΚΑΡΙΣΤΑ στον υπολογιστή· και τα έχανε ολότελα με ένα καθάρισμα
-- ιστορικού ή με αλλαγή συσκευής. Για μια εφαρμογή που χρεώνει συνδρομή, μια
-- λίστα υποχρεώσεων που ξεχνιέται δεν είναι λειτουργία· είναι υπόσχεση που δεν
-- τηρείται.
--
-- ── ΓΙΑΤΙ ΜΙΑ ΓΡΑΜΜΗ ΑΝΑ ΑΚΙΝΗΤΟ ΚΑΙ ΟΧΙ ΑΝΑ ΧΡΗΣΤΗ ──────────────────────
-- Το σχέδιο είναι του ΑΚΙΝΗΤΟΥ, όχι του ματιού που το κοιτά. Με κλειδί
-- (ακίνητο, χρήστης) ο ιδιοκτήτης και ο συνεργάτης του θα τσέκαραν ο καθένας
-- τη δική του αντιγραφή της ίδιας λίστας, θα έβλεπαν άλλη πρόοδο και θα
-- έκαναν δύο φορές την ίδια δουλειά. Ενα ακίνητο, ένας φάκελος.
--
-- Η στήλη `user_id` μένει, αλλά ΔΕΝ είναι κλειδί: λέει ποιος έγραψε τελευταίος.
-- Η πρόσβαση κρίνεται από το ίδιο το ακίνητο, όπως σε κάθε άλλον πίνακα.
--
-- ── ΓΙΑΤΙ ΧΑΡΤΗΣ ΚΑΙ ΟΧΙ ΓΡΑΜΜΗ ΑΝΑ ΒΗΜΑ ────────────────────────────────
-- Τα βήματα δεν είναι δεδομένα του χρήστη: είναι κλειστός κατάλογος γραμμένος
-- στο `lib/property/plan.ts`, με σταθερά αναγνωριστικά. Μια γραμμή ανά βήμα θα
-- σήμαινε μια εγγραφή ΚΑΙ μια διαγραφή σε κάθε πάτημα, με αγώνα δρόμου όταν ο
-- χρήστης τσεκάρει τρία γρήγορα. Ενα `jsonb` γράφεται ατομικά, μία φορά.
--
-- ΚΑΙ Ο ΧΑΡΤΗΣ ΕΧΕΙ ΚΛΕΙΔΙ ΤΗΝ ΚΑΤΑΣΤΑΣΗ. Το ίδιο ακίνητο περνά από «κενό» σε
-- «ανακαίνιση» και ξανά σε «κενό»: κάθε κατάσταση έχει τη δική της σειρά
-- βημάτων, οπότε {"vacant": [...], "renovating": [...]}. Χωρίς αυτό, η
-- επιστροφή σε προηγούμενη κατάσταση θα έσβηνε ό,τι είχε γίνει τότε.
--
-- ── ΤΙ ΔΕΝ ΜΠΑΙΝΕΙ ──────────────────────────────────────────────────────
-- Καμία στήλη «πόσα βήματα έγιναν» και καμία «ποσοστό». Βγαίνουν και τα δύο
-- από τον χάρτη με μια μέτρηση· και μια αποθηκευμένη σύνοψη είναι απλώς ένα
-- δεύτερο πράγμα που μπορεί να διαφωνήσει με το πρώτο.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.property_plan (
  property_id   uuid primary key references public.user_properties(id) on delete cascade,
  -- Ποιος έγραψε τελευταίος. Δεν είναι κλειδί: η πρόσβαση κρίνεται από το ακίνητο.
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- {"vacant": ["title_clear", …], "renovating": [...]} — ανά κατάσταση ακινήτου.
  done_steps    jsonb not null default '{}'::jsonb,
  -- Τι είδους εκκρεμότητα, όταν η κατάσταση είναι «σε διαφορά». Κλειστός κατάλογος.
  dispute_kind  text,
  -- {"enfiaYear": 210, "commonMonthly": 45, …} — τα τέσσερα πάγια του κενού μήνα.
  vacancy_costs jsonb not null default '{}'::jsonb,
  -- Με μεσίτη ή μόνος του: αλλάζει το καθαρό ποσό που δείχνει η οθόνη.
  use_agent     boolean not null default true,
  updated_at    timestamptz not null default now()
);

comment on table public.property_plan is
  'Το σχέδιο αξιοποίησης ενός ακινήτου: ποια βήματα έγιναν ανά κατάσταση· και οι παραδοχές που το συνοδεύουν. Μία γραμμή ανά ακίνητο, όχι ανά χρήστη.';

create index if not exists idx_property_plan_user_id on public.property_plan (user_id);

alter table public.property_plan enable row level security;

-- ── Ο ΙΔΙΟΚΤΗΤΗΣ ────────────────────────────────────────────────────────
-- Ιδιο σχήμα με το `own_checklist_items`: η πρόσβαση περνά από το ακίνητο.
drop policy if exists own_property_plan on public.property_plan;
create policy own_property_plan on public.property_plan
  using (exists (
    select 1 from public.user_properties p
     where p.id = property_plan.property_id and p.user_id = (select auth.uid())))
  with check (exists (
    select 1 from public.user_properties p
     where p.id = property_plan.property_id and p.user_id = (select auth.uid())));

-- ── ΤΑ ΜΕΛΗ ΤΟΥ ΟΡΓΑΝΙΣΜΟΥ ──────────────────────────────────────────────
-- Διαβάζουν και γράφουν το ίδιο σχέδιο. Ενας συνεργάτης που βλέπει το ακίνητο
-- και ΔΕΝ μπορεί να τσεκάρει βήμα θα κρατούσε τη δική του λίστα αλλού.
drop policy if exists org_read_property_plan on public.property_plan;
create policy org_read_property_plan on public.property_plan for select
  using (exists (
    select 1 from public.user_properties p
     where p.id = property_plan.property_id
       and p.user_id in (select public.org_owner_ids((select auth.uid())))));

drop policy if exists org_write_property_plan on public.property_plan;
create policy org_write_property_plan on public.property_plan for insert
  with check (exists (
    select 1 from public.user_properties p
     where p.id = property_plan.property_id
       and p.user_id in (select public.org_owner_ids((select auth.uid())))));

drop policy if exists org_edit_property_plan on public.property_plan;
create policy org_edit_property_plan on public.property_plan for update
  using (exists (
    select 1 from public.user_properties p
     where p.id = property_plan.property_id
       and p.user_id in (select public.org_owner_ids((select auth.uid())))))
  with check (exists (
    select 1 from public.user_properties p
     where p.id = property_plan.property_id
       and p.user_id in (select public.org_owner_ids((select auth.uid())))));

-- ── ΤΟ ΕΥΡΟΣ ΑΚΙΝΗΤΩΝ ΤΟΥ ΜΕΛΟΥΣ ────────────────────────────────────────
-- Περιοριστική πολιτική, ίδια με τους τριάντα πίνακες του
-- 20260726080000_member_property_scope: μέλος με ορισμένο εύρος δεν φτάνει σε
-- ακίνητο εκτός του. Γράφεται ρητά εδώ, γιατί ο πίνακας δεν υπήρχε τότε.
drop policy if exists scope_property_property_plan on public.property_plan;
create policy scope_property_property_plan on public.property_plan as restrictive for all
  using (public.member_sees_property(property_id))
  with check (public.member_sees_property(property_id));

-- ── ΚΑΜΙΑ ΓΡΑΜΜΗ ΣΕ ΞΕΝΟ ΑΚΙΝΗΤΟ ────────────────────────────────────────
-- Ο ίδιος κανόνας με τους τριάντα πίνακες του 20260810060000: οι πολιτικές
-- ανάγνωσης ταιριάζουν ανά ακίνητο, οπότε αν η εγγραφή έδενε μόνο τον χρήστη,
-- κάποιος θα έγραφε γραμμή με ΤΟ ΔΙΚΟ του `user_id` και ΞΕΝΟ `property_id` και
-- το θύμα θα την έβλεπε μέσα στα δικά του. Εδώ θα ήταν ένα σχέδιο με
-- τσεκαρισμένα βήματα που δεν έκανε ποτέ.
--
-- Ο πίνακας δεν υπήρχε όταν γράφτηκε εκείνη η λίστα, οπότε φέρνει μόνος του τις
-- δύο πολιτικές του. Ο φύλακας `rls-parent-scope` δέχεται και τους δύο τρόπους.
--
-- ΜΟΝΟ ΣΤΗΝ ΕΓΓΡΑΦΗ, ΟΠΩΣ ΚΑΙ ΕΚΕΙ: ένα restrictive `using` θα έκρυβε ορφανή
-- γραμμή από τον ίδιο τον ιδιοκτήτη της. Η τρύπα είναι στην είσοδο.
drop policy if exists parent_ins_property_plan on public.property_plan;
create policy parent_ins_property_plan on public.property_plan as restrictive for insert
  with check (public.owns_parent_property(property_id));

drop policy if exists parent_upd_property_plan on public.property_plan;
create policy parent_upd_property_plan on public.property_plan as restrictive for update
  with check (public.owns_parent_property(property_id));

-- Ο χρόνος ενημέρωσης δεν τον γράφει η οθόνη: τον βάζει η βάση.
create or replace function public.touch_property_plan()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_property_plan_touch on public.property_plan;
create trigger trg_property_plan_touch before update on public.property_plan
  for each row execute function public.touch_property_plan();
