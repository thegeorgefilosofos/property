-- ═══════════════════════════════════════════════════════════════════════════
-- Ο ΦΑΚΕΛΟΣ ΓΙΑ ΤΟΝ ΛΟΓΙΣΤΗ — «τι έχω ήδη», ανά χρήστη και ανά έτος
--
-- ΤΙ ΛΥΝΕΙ. Η οθόνη «Τι πάει στον λογιστή» δείχνει έναν κατάλογο παραστατικών
-- και ο χρήστης σημειώνει τι έχει βρει. Αν αυτό ζούσε στο localStorage, θα
-- χανόταν μόλις άνοιγε την εφαρμογή από το κινητό — και ο χρήστης θα ξανάρχιζε
-- το ψάξιμο από την αρχή, ακριβώς το άγχος που η οθόνη υπάρχει για να λύσει.
--
-- ΓΙΑΤΙ ΑΝΑ ΕΤΟΣ ΚΑΙ ΟΧΙ ΑΝΑ ΑΚΙΝΗΤΟ. Ο φάκελος πάει στον λογιστή ΜΙΑ φορά τον
-- χρόνο, για ΟΛΑ τα ακίνητα μαζί: το ΑΤΑΚ ζητιέται μία φορά, το Ε2 είναι ένα,
-- ο ΕΦΚΑ είναι ένας. Κλειδί (user_id, year) — η φορολογική χρήση είναι η
-- φυσική μονάδα αυτής της δουλειάς.
--
-- ΤΙ ΚΡΑΤΑΕΙ ΑΚΟΜΗ. Νομική μορφή και βιβλία δηλώνονται ΡΗΤΑ από τον χρήστη και
-- δεν μαντεύονται: από αυτά κρίνεται αν θα δει τη λέξη «ισολογισμός». Μια λάθος
-- μαντεψιά είτε κρύβει υποχρεωτικές καταστάσεις από μια ΙΚΕ, είτε τρομάζει έναν
-- ιδιώτη με ένα διαμέρισμα. Οι τρεις σημαίες (ανακαίνιση, δάνειο, αλλαγή
-- ιδιοκτησίας) προσθέτουν παραστατικά που αλλιώς δεν θα ζητούνταν ποτέ.
--
-- ΜΟΝΟ ΠΡΟΣΘΕΤΙΚΟ: create table if not exists. Καμία υπάρχουσα στήλη δεν
-- αγγίζεται, τίποτα δεν διαγράφεται. Η βάση είναι σε free tier χωρίς αντίγραφα
-- ασφαλείας — ό,τι δεν είναι προσθετικό δεν επανορθώνεται.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.accountant_dossier (
  user_id           uuid    not null references auth.users(id) on delete cascade,
  year              integer not null,
  -- Τα ids των απαιτήσεων (dossier.ts) που ο χρήστης δήλωσε ότι έχει.
  have_ids          text[]  not null default '{}',
  legal_form        text    not null default 'individual',
  bookkeeping       text    not null default 'none',
  has_renovation    boolean not null default false,
  has_loan          boolean not null default false,
  ownership_changed boolean not null default false,
  updated_at        timestamptz not null default now(),
  primary key (user_id, year)
);

comment on table public.accountant_dossier is
  'Ο φάκελος για τον λογιστή, ανά χρήστη και φορολογική χρήση: τι δικαιολογητικά έχει ήδη και οι παράμετροι που ορίζουν ποια ζητούνται.';
comment on column public.accountant_dossier.have_ids is
  'Ids απαιτήσεων του lib/accounting/dossier.ts που ο χρήστης έχει σημειώσει ως «το έχω».';
comment on column public.accountant_dossier.legal_form is
  'individual | sole_trader | partnership | company — δηλώνεται από τον χρήστη, δεν μαντεύεται.';
comment on column public.accountant_dossier.bookkeeping is
  'none | single_entry | double_entry — ο ισολογισμός εμφανίζεται ΜΟΝΟ στα διπλογραφικά.';

alter table public.accountant_dossier enable row level security;

-- Ίδιο μοτίβο με τα book_closings: τέσσερις πολιτικές, όλες «η γραμμή είναι δική
-- μου». Χωρίς την update, το upsert θα αποτύγχανε σιωπηλά στη δεύτερη αποθήκευση.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'accountant_dossier' and policyname = 'own dossier select') then
    create policy "own dossier select" on public.accountant_dossier for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'accountant_dossier' and policyname = 'own dossier insert') then
    create policy "own dossier insert" on public.accountant_dossier for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'accountant_dossier' and policyname = 'own dossier update') then
    create policy "own dossier update" on public.accountant_dossier for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'accountant_dossier' and policyname = 'own dossier delete') then
    create policy "own dossier delete" on public.accountant_dossier for delete using (auth.uid() = user_id);
  end if;
end $$;

grant select, insert, update, delete on table public.accountant_dossier to authenticated;
grant all on table public.accountant_dossier to service_role;
