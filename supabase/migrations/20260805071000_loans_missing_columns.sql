-- ═══════════════════════════════════════════════════════════════════════════
-- Ο ΠΙΝΑΚΑΣ `loans` ΚΑΙ Η ΕΦΑΡΜΟΓΗ ΜΙΛΟΥΣΑΝ ΔΙΑΦΟΡΕΤΙΚΗ ΓΛΩΣΣΑ
-- ─────────────────────────────────────────────────────────────────────────
-- Οκτώ αρχεία ζητούσαν έξι στήλες που δεν υπήρχαν:
--   amount · rate · status · loan_type · property_value · created_at
-- Οι πραγματικές είναι: loan_amount, rate_type, fixed_rate, euribor, spread,
-- years, start_date, down_payment, bank. Το PostgREST απορρίπτει ΟΛΟΚΛΗΡΟ το
-- ερώτημα σε άγνωστη στήλη, οπότε κάθε ένα από αυτά τα ερωτήματα επέστρεφε
-- `null` — και ο κώδικας έγραφε `setLoans(data || [])`, δηλαδή κενό πίνακα.
--
-- ΤΙ ΕΣΠΑΓΕ ΣΤΗΝ ΠΡΑΞΗ
--   • Λογιστική: οι εκπιπτόμενοι ΤΟΚΟΙ ΔΑΝΕΙΟΥ εμφανίζονταν 0 € και το άρθρο
--     δανείου δεν έμπαινε καθόλου στο ημερολόγιο ΕΛΠ. Ιδιοκτήτης σε καθεστώς
--     επιχείρησης δήλωνε υπερβολικά υψηλό κέρδος και πλήρωνε παραπάνω φόρο.
--   • Καρτέλα Δάνειο: το insert απορριπτόταν και ο χρήστης έβλεπε
--     «Το δάνειο αποθηκεύτηκε». Δεν αποθηκευόταν τίποτα, ποτέ.
--   • Επισκόπηση, ROI, Προϋπολογισμός, Ασφάλιση: μηδέν δάνεια παντού.
--
-- ΤΙ ΠΡΟΣΤΙΘΕΤΑΙ ΕΔΩ ΚΑΙ ΤΙ ΟΧΙ — Η ΔΙΑΚΡΙΣΗ ΕΧΕΙ ΣΗΜΑΣΙΑ
--
-- ΠΡΟΣΤΙΘΕΝΤΑΙ οι πέντε στήλες που εκφράζουν κάτι που η φόρμα ΟΝΤΩΣ συλλέγει
-- και δεν υπάρχει πουθενά αλλού: κατάσταση, είδος δανείου, αξία ακινήτου,
-- σημειώσεις, ημερομηνία καταχώρησης.
--
-- ΔΕΝ προστίθενται τα `amount` και `rate`. Θα ήταν ΔΕΥΤΕΡΗ ΠΗΓΗ ΑΛΗΘΕΙΑΣ για
-- κάτι που ήδη υπάρχει: το ποσό είναι το `loan_amount` και το επιτόκιο
-- προκύπτει από `rate_type` (σταθερό → fixed_rate, κυμαινόμενο → euribor +
-- spread). Δύο στήλες που μπορούν να διαφωνήσουν με τις υπάρχουσες είναι
-- ακριβώς το είδος του σφάλματος που έφερε εδώ. Η εφαρμογή διορθώνεται ώστε
-- να διαβάζει τις πραγματικές, μέσω ΜΙΑΣ συνάρτησης (effectiveRate).
--
-- Το `created_at` γεμίζει από το `updated_at` και όχι από το `now()`: με now()
-- όλα τα υπάρχοντα δάνεια θα έπαιρναν την ίδια στιγμή και η ταξινόμηση «πιο
-- πρόσφατο πρώτο» θα γινόταν τυχαία. Ίδιο σκεπτικό με το tenants.created_at.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.loans
  add column if not exists status         text,
  add column if not exists loan_type      text,
  add column if not exists property_value numeric(12,2),
  add column if not exists notes          text,
  add column if not exists created_at     timestamptz;

update public.loans set created_at = coalesce(updated_at, now()) where created_at is null;
alter table public.loans alter column created_at set default now();

-- Τα υπάρχοντα δάνεια είναι ενεργά: κανένα δεν έχει σημανθεί ως εξοφλημένο,
-- γιατί μέχρι σήμερα δεν υπήρχε στήλη για να σημανθεί.
update public.loans set status = 'active' where status is null;
alter table public.loans alter column status set default 'active';

comment on column public.loans.status is
  'active | paid_off | pending. Καθορίζει αν το δάνειο μετράει σε δόση, LTV και εκπιπτόμενους τόκους.';
comment on column public.loans.loan_type is
  'purchase | first_home | renovation | energy | investment | auction | construction | commercial | land | refinance (TabLoanData.ts → LoanType).';
comment on column public.loans.property_value is
  'Αξία ακινήτου κατά τη σύναψη — για τον δείκτη δανείου προς αξία. ΔΕΝ είναι η τρέχουσα αξία του user_properties.';

create index if not exists loans_property_created_idx on public.loans (property_id, created_at desc);
