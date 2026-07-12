# Backlog — εκκρεμότητες προτεραιότητας

Ζωντανή λίστα με ό,τι κρατάμε συνειδητά για μετά (ή λίγο πριν) το launch.
Ό,τι ολοκληρώνεται μεταφέρεται/διαγράφεται.

---

## 🔴 P1 — Αυτόματο bank feed (Open Banking / PSD2)

**Απόφαση launch:** να γίνει **πριν ή μετά το launch** (ανοιχτό — να αποφασιστεί).
Είναι το μεγαλύτερο λειτουργικό κενό έναντι των διεθνών (Stessa/Buildium/Baselane):
αυτόματο τράβηγμα τραπεζικών κινήσεων αντί για χειροκίνητο ανέβασμα CSV.

**Γιατί είναι εφικτό & όχι εξωτικό**
- Μέσω aggregator **GoCardless Bank Account Data (πρώην Nordigen)** — δωρεάν production
  tier για ανάγνωση κινήσεων (AIS), αδειοδοτημένος AISP (Λετονία FCMC) με passport σε
  31 χώρες ΕΕ, καλύπτει Ελλάδα (Εθνική/Πειραιώς/Alpha/Eurobank — να επιβεβαιωθεί ανά
  τράπεζα στον live κατάλογο). **Δεν χρειάζεται δική μας άδεια ΤτΕ** — καβαλάμε τη δική
  τους άδεια AISP.

**Τι έχουμε ήδη (~60-70%)**
- `bank_transactions` (πίνακας)
- `lib/accounting/bankImport.ts` — ο auto-matcher ενοίκια/έξοδα (το δύσκολο)
- `lib/accounting/ledger.ts` — συμφωνία/reconciliation
- Edge functions με scheduled refresh — το `supabase/functions/ical-sync` είναι ΤΟ ΙΔΙΟ pattern

**Τι μένει να χτιστεί**
1. `bank_connections` table (requisition id, institution, consent_expires_at, account_ids) + RLS.
2. Connect flow: κουμπί «Σύνδεση τράπεζας» → επιλογή τράπεζας → redirect συναίνεσης →
   callback αποθηκεύει τα account ids.
3. Edge function `bank-sync` που τραβά κινήσεις (GoCardless AIS) + cron (καθημερινά) →
   γράφει στο `bank_transactions` → ο υπάρχων matcher παίρνει τη σκυτάλη.
4. UI κατάστασης «συνδεδεμένο / λήξη συναίνεσης σε X ημέρες» + ομαλή επανα-σύνδεση.

**Τίμιοι περιορισμοί**
- **Επανα-συναίνεση κάθε 90 μέρες** (υποχρέωση PSD2) — όχι «σύνδεσε & ξέχνα»· θέλει
  υπενθύμιση/ροή ανανέωσης.
- Χρειάζεται δωρεάν λογαριασμό GoCardless (`secret_id/secret_key`) + deploy edge functions.
- GDPR/ασφάλεια: τραπεζικά δεδομένα = ευαίσθητα (RLS, συναίνεση, audit trail).
- Testing: μέσω του sandbox τους.

**Εκτίμηση:** σταθερό MVP ~1-2 εβδομάδες· sandbox demo πολύ γρηγορότερα.
**Πρώτο βήμα όταν ξεκινήσουμε:** scaffold sandbox-first (πίνακας + edge function +
connect/callback + UI, δεμένα με τον υπάρχοντα matcher), με mock μέχρι να μπουν credentials.

---

## Εξωτερική επικύρωση ακρίβειας (trust)
- 5-10 πραγματικά εκκαθαριστικά ΑΑΔΕ ή/και ματιά λογιστή σε 3-5 περιπτώσεις → μετατρέπει
  την «επαληθευμένη αριθμητική» (~494k έλεγχοι + 13 εκκαθαρίσεις methodology) σε
  «υπογεγραμμένη ακρίβεια». Η aade.gov.gr δεν είναι προσβάσιμη από το dev egress, οπότε
  αγκυρωθήκαμε σε δημοσιευμένα παραδείγματα + ΦΕΚ (ΕΝΦΙΑ).
