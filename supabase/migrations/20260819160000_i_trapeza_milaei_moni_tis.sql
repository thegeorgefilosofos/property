-- ═══════════════════════════════════════════════════════════════════════════
-- OPEN BANKING: Η ΣΥΝΔΕΣΗ ΖΕΙ ΣΤΗ ΒΑΣΗ, ΤΟ ΑΝΑΓΝΩΡΙΣΤΙΚΟ ΤΟΥ ΠΑΡΟΧΟΥ ΟΧΙ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΙΣΧΥΕΙ ΣΗΜΕΡΑ. Οι τραπεζικές κινήσεις μπαίνουν μόνο με CSV: ο χρήστης
-- μπαίνει στο e-banking, κατεβάζει αρχείο, το ανεβάζει. Η μηχανή ταιριάσματος
-- (lib/accounting/bankImport.ts) δουλεύει ήδη σωστά. Λείπει μόνο ο σωλήνας.
--
-- ΓΙΑΤΙ ΔΕΝ ΔΙΑΒΑΖΟΥΜΕ ΜΟΝΟΙ ΜΑΣ ΤΗΝ ΤΡΑΠΕΖΑ. Η ανάγνωση λογαριασμού τρίτου
-- κατά PSD2 απαιτεί άδεια AISP από την Τράπεζα της Ελλάδος. Δεν την έχουμε.
-- Περνάμε από αδειοδοτημένο πάροχο (GoCardless Bank Account Data, Tink, Salt
-- Edge, Enable Banking, Yapily, TrueLayer) και είμαστε πελάτης του.
--
-- ΤΟ ΚΟΣΤΟΣ ΤΟ ΣΗΚΩΝΕΙ ΟΠΟΙΟΣ ΤΟ ΑΝΑΒΕΙ. Η σύνδεση τράπεζας είναι πρόσθετο
-- (lib/billing/addons.ts → `bank_link`), χρεωμένο ανά συνδεδεμένο λογαριασμό
-- τον μήνα. Μέσα στο πακέτο, εννιά στους δέκα θα πλήρωναν λειτουργία που δεν
-- χρησιμοποιούν.
--
-- ── ΓΙΑΤΙ ΔΥΟ ΠΙΝΑΚΕΣ ΚΑΙ ΟΧΙ ΕΝΑΣ ──────────────────────────────────────
-- Ο πάροχος μας δίνει ένα αδιαφανές αναγνωριστικό σύνδεσης. Δεν είναι κωδικός
-- τράπεζας — διαπιστευτήρια δεν περνούν ποτέ από εδώ, ο χρήστης πιστοποιείται
-- ΣΤΗΝ ΤΡΑΠΕΖΑ ΤΟΥ — αλλά μαζί με το κλειδί μας στον πάροχο ανοίγει τις
-- κινήσεις. Το κλειδί ζει σε μεταβλητή περιβάλλοντος στον διακομιστή. Το
-- αναγνωριστικό δεν έχει κανέναν λόγο να φτάσει στον περιηγητή, άρα δεν
-- φτάνει: ζει σε πίνακα μόνο-υπηρεσίας, με RLS ενεργό και ΜΗΔΕΝ πολιτικές,
-- και χωρίς δικαιώματα για `anon` και `authenticated` — δύο ανεξάρτητοι
-- μηχανισμοί άρνησης, όπως και οι υπόλοιποι οκτώ τέτοιοι πίνακες.
--
-- Ο χρήστης βλέπει ό,τι τον αφορά: ποια τράπεζα, σε τι κατάσταση, πότε λήγει
-- η άδεια, πότε συγχρονίστηκε τελευταία φορά.
--
-- ── ΜΙΑ ΓΡΑΜΜΗ ΑΝΑ ΤΡΑΠΕΖΑ, ΚΑΙ ΓΙΑΤΙ ΕΧΕΙ ΣΗΜΑΣΙΑ ──────────────────────
-- Το μοναδικό ευρετήριο επιτρέπει ΜΙΑ ζωντανή σύνδεση ανά (χρήστη, τράπεζα).
-- Χωρίς αυτό, μια αποτυχημένη σύνδεση που ο χρήστης ξαναπροσπαθεί θα άφηνε
-- δεύτερη γραμμή — και το πρόσθετο χρεώνει ΑΝΑ ΣΥΝΔΕΣΗ. Θα πλήρωνε διπλά για
-- την ίδια τράπεζα εξαιτίας δικού μας σφάλματος. Η επανασύνδεση ΕΝΗΜΕΡΩΝΕΙ τη
-- γραμμή· δεν φτιάχνει καινούργια. Οι διακομμένες εξαιρούνται, ώστε παλιά
-- ιστορία να μη μπλοκάρει νέα σύνδεση στην ίδια τράπεζα.
--
-- ── ΟΙ ΚΙΝΗΣΕΙΣ ΕΠΙΖΟΥΝ ΤΗΣ ΣΥΝΔΕΣΗΣ ────────────────────────────────────
-- Το `connection_id` στις κινήσεις είναι `on delete set null`, όχι cascade. Ο
-- χρήστης που κόβει τη σύνδεση σταματά να πληρώνει το πρόσθετο — δεν σβήνει τα
-- βιβλία του. Κινήσεις που έχουν ήδη συνδεθεί με ενοίκια και δαπάνες δεν
-- επιτρέπεται να εξαφανιστούν επειδή έκλεισε ο σωλήνας που τις έφερε.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Η σύνδεση, όπως τη βλέπει ο χρήστης ───────────────────────────────────
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Ο πάροχος γράφεται ρητά: αλλαγή παρόχου δίνει άλλα αναγνωριστικά κινήσεων
  -- και δεν επιτρέπεται να περάσουν ως οι ίδιες (lib/banking/normalize.ts).
  -- Η λίστα είναι κλειστή αλλά ΟΧΙ μονή: το GoCardless Bank Account Data
  -- έκλεισε τις νέες εγγραφές και αποσύρεται, οπότε σχήμα δεμένο σε έναν
  -- πάροχο θα ζητούσε μετανάστευση τη μέρα της αλλαγής. Ο κατάλογος
  -- καθρεφτίζει το lib/banking/types.ts.
  provider text not null check (provider in ('enablebanking', 'gocardless', 'tink', 'saltedge', 'yapily', 'truelayer')),
  institution_id text not null,
  institution_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'expired', 'revoked', 'error')),
  -- Πότε λήγει η συγκατάθεση. ΤΗΝ ΔΙΝΕΙ Ο ΠΑΡΟΧΟΣ, δεν την υπολογίζουμε: η
  -- διάρκεια εξαρτάται από το ρυθμιστικό πλαίσιο και από την ίδια την τράπεζα,
  -- και έχει ήδη αλλάξει μία φορά. Αριθμός καρφωμένος εδώ θα ήταν λάθος τη
  -- μέρα που θα άλλαζε, σιωπηλά.
  consent_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bank_connections owner to postgres;
alter table public.bank_connections enable row level security;

create index if not exists idx_bank_connections_user on public.bank_connections (user_id);

-- Μία ζωντανή σύνδεση ανά τράπεζα. Το πρόσθετο χρεώνει ανά σύνδεση.
create unique index if not exists uq_bank_connection_live
  on public.bank_connections (user_id, institution_id)
  where status <> 'revoked';

drop policy if exists "own bank connection select" on public.bank_connections;
create policy "own bank connection select" on public.bank_connections
  for select using ((select auth.uid()) = user_id);

drop policy if exists "own bank connection insert" on public.bank_connections;
create policy "own bank connection insert" on public.bank_connections
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "own bank connection update" on public.bank_connections;
create policy "own bank connection update" on public.bank_connections
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own bank connection delete" on public.bank_connections;
create policy "own bank connection delete" on public.bank_connections
  for delete using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.bank_connections to authenticated;
grant all on table public.bank_connections to service_role;

comment on table public.bank_connections is
  'Σύνδεση με τράπεζα μέσω αδειοδοτημένου παρόχου AISP. Ο,τι επιτρέπεται να δει ο χρήστης· το αναγνωριστικό του παρόχου ζει στον bank_connection_refs.';

-- ── Το αναγνωριστικό του παρόχου: μόνο-υπηρεσίας ─────────────────────────
-- RLS ενεργό, ΚΑΜΙΑ πολιτική, κανένα δικαίωμα σε ρόλο πελάτη. Το γράφει και
-- το διαβάζει μόνο ο διακομιστής, εκεί όπου ζει και το κλειδί του παρόχου.
create table if not exists public.bank_connection_refs (
  connection_id uuid primary key references public.bank_connections(id) on delete cascade,
  external_ref text not null unique,
  created_at timestamptz not null default now()
);

alter table public.bank_connection_refs owner to postgres;
alter table public.bank_connection_refs enable row level security;

revoke all on table public.bank_connection_refs from public, anon, authenticated;
grant all on table public.bank_connection_refs to service_role;

comment on table public.bank_connection_refs is
  'Το αδιαφανές αναγνωριστικό σύνδεσης του παρόχου. Δεν φτάνει ποτέ στον περιηγητή: μαζί με το κλειδί μας ανοίγει τις κινήσεις.';

-- ── Ποια σύνδεση έφερε την κίνηση ────────────────────────────────────────
-- Κενό για ό,τι ήρθε από CSV. Η προέλευση δεν γράφεται δεύτερη φορά ως στήλη
-- «source»: το αποτύπωμα την ήδη δηλώνει στο πρόθεμά του.
alter table public.bank_transactions
  add column if not exists connection_id uuid references public.bank_connections(id) on delete set null;

create index if not exists idx_bank_txn_connection
  on public.bank_transactions (connection_id)
  where connection_id is not null;
