# Γνωστά ευρήματα ασφαλείας που έχουν γίνει αποδεκτά συνειδητά

Καταγραφή ευρημάτων που ΔΕΝ διορθώνονται, με τον λόγο. Ενημερώνεται σε κάθε
σάρωση ασφαλείας ώστε να μη «ξαναανακαλύπτονται» και να μη θεωρούνται παραλείψεις.

---

## 1. `pg_net` στο σχήμα `public` — ΑΠΟΔΕΚΤΟ
**Σοβαρότητα:** INFO (σύσταση, όχι ευπάθεια)
**Σύσταση Supabase:** μετακίνηση σε δικό της schema.

**Γιατί δεν εφαρμόζεται:** η επέκταση δεν το υποστηρίζει τεχνικά. Δοκιμάστηκε στο
staging και απέτυχε:

```
ERROR: extension "pg_net" does not support SET SCHEMA (SQLSTATE 0A000)
```

Ο μόνος εναλλακτικός δρόμος είναι `DROP EXTENSION pg_net` και εκ νέου δημιουργία
με `WITH SCHEMA extensions`. Αυτό θα έσβηνε τους εσωτερικούς πίνακες ουράς του
pg_net και θα έσπαγε τα cron jobs που στέλνουν email μέσω `net.http_post(...)`.
Σε λογαριασμό χωρίς αντίγραφα ασφαλείας, το ρίσκο υπερβαίνει κατά πολύ το όφελος
μιας σύστασης επιπέδου INFO.

**Αντιστάθμισμα:** το `pg_net` καλείται μόνο από cron jobs που τρέχουν ως
`service_role`. Δεν εκτίθεται σε `anon` ή `authenticated`.

**Επανεξέταση:** αν η Supabase προσθέσει υποστήριξη `SET SCHEMA`, ή σε τυχόν
μελλοντική μετακίνηση σε πληρωμένο πλάνο με αντίγραφα ασφαλείας.

---

## 2. Επτά πίνακες με RLS χωρίς πολιτικές — ΣΩΣΤΟ ΩΣ ΕΧΕΙ
`ai_usage`, `cron_secrets`, `email_outbox`, `feedback_campaign_winners`,
`invoice_counters`, `portal_pin_attempts`, `referrals`.

Ο Supabase advisor τα επισημαίνει ως «RLS enabled, no policy». Αυτό είναι το
**επιθυμητό**: κανένας από αυτούς δεν διαβάζεται ποτέ από τον client (επαληθεύτηκε
με σάρωση κώδικα — 0 αναφορές `from('<table>')`). Η πρόσβαση γίνεται αποκλειστικά
μέσω συναρτήσεων `SECURITY DEFINER` και του `service_role` στα edge functions.
Χωρίς πολιτικές, η προεπιλογή του RLS είναι «άρνηση σε όλους», που είναι ακριβώς
η σωστή στάση για πίνακες υποδομής.

---

## 3. Πενήντα συναρτήσεις `SECURITY DEFINER` εκτελέσιμες από `anon` — ΕΛΕΓΜΕΝΟ
Ο advisor τις επισημαίνει μαζικά. Ελέγχθηκαν μία προς μία:

- Οι token-based (portal, check-in, λογιστής, unsubscribe) **πρέπει** να είναι
  προσβάσιμες από ανώνυμο — αυτός είναι ο σκοπός τους — και επικυρώνουν το token.
- Οι υπόλοιπες προστατεύονται με `auth.uid()` (για ανώνυμο είναι `null`, άρα
  επιστρέφουν κενό ή δεν κάνουν τίποτα).
- Οι `rls_auto_enable` και `enforce_property_limit` είναι συναρτήσεις trigger /
  event trigger· δεν μπορούν να κληθούν απευθείας μέσω PostgREST.
- **Όλες** ορίζουν `SET search_path`, που αποκλείει την κλασική επίθεση
  παραπλάνησης search_path σε `SECURITY DEFINER`.

---

## 4. Ρυθμίσεις ταυτοποίησης — κατάσταση & περιορισμοί πλάνου

| Ρύθμιση | Διαδρομή | Τιμή | Κατάσταση |
|---|---|---|---|
| Prevent use of leaked passwords | Authentication → Attack Protection → Email | ✅ ON | ❌ **ΜΠΛΟΚΑΡΕΤΑΙ — μόνο Pro** |
| TOTP (App Authenticator) | Authentication → Multi-Factor | **Enabled** | ✅ ΕΦΑΡΜΟΣΜΕΝΟ (επιβεβαιώθηκε 27/07/2026) |
| Allow manual linking | Authentication → Sign In / Providers | ❌ OFF | ✅ εφαρμόστηκε |
| Allow anonymous sign-ins | Authentication → Sign In / Providers | ❌ OFF | ✅ ίσχυε ήδη |
| Confirm email | Authentication → Sign In / Providers | ✅ ON | ✅ ίσχυε ήδη |

> **Η σελίδα `/trust` δηλώνει δημόσια ότι ο χρήστης μπορεί να ενεργοποιήσει σύνδεση
> δύο βημάτων — και ισχύει.** Επιβεβαιώθηκε στο dashboard: TOTP = «Enabled», που
> επιτρέπει ΚΑΙ enroll ΚΑΙ verify (η παλιά ονομασία ήταν «Enroll and Verify
> Enabled»· το UI του Supabase την απλοποίησε σε «Enabled»). Max factors ανά
> χρήστη: 10.
>
> ⚠️ Αν κάποτε γυριστεί σε «Verify Enabled», το `mfa.enroll()` απορρίπτεται,
> κανείς δεν μπορεί να ενεργοποιήσει MFA και η δημόσια δήλωση γίνεται ψευδής.
> Μην αλλάξεις αυτή τη ρύθμιση χωρίς να αφαιρέσεις και τη γραμμή από τη σελίδα.

### 4α. Leaked-password protection — ΜΗ ΔΙΑΘΕΣΙΜΟ ΣΤΟ ΔΩΡΕΑΝ ΠΛΑΝΟ
Δοκιμάστηκε στην παραγωγή· το Supabase το απορρίπτει:

```
Failed to update auth configuration: Configuring leaked password protection
via HaveIBeenPwned.org is available on Pro Plans and up.
```

**Αντισταθμιστικοί έλεγχοι που ΙΣΧΥΟΥΝ (δωρεάν):**
- Ελάχιστο μήκος κωδικού: 10 χαρακτήρες (`PASSWORD_MIN_LENGTH` στο `lib/auth/password.ts`, ρυθμισμένο και στον Supabase Auth).
- Απαίτηση πολυπλοκότητας: πεζά + κεφαλαία + ψηφία + σύμβολα.
- «Require current password when updating»: ON.
- «Confirm email»: ON.
- Rate limiting στο PIN της πύλης ενοικιαστή (migration 20260724090000).

Η υποχρεωτική πολυπλοκότητα απορρίπτει ήδη τους περισσότερους κωδικούς που θα
έπιανε το HIBP. Το HIBP καλύπτει κυρίως ΕΠΑΝΑΧΡΗΣΙΜΟΠΟΙΗΜΕΝΟΥΣ κωδικούς από
άλλες διαρροές· το κενό αυτό καλύπτεται ουσιαστικά από το MFA (4β).

**Επανεξέταση:** με την πρώτη αναβάθμιση σε Pro (που ούτως ή άλλως χρειάζεται για
τα αντίγραφα ασφαλείας / PITR).

### 4β. TOTP — η τιμή «Verify Enabled» ΣΠΑΕΙ τη λειτουργία του app
Το PROPERWISE έχει πλήρη ροή MFA στο `app/dashboard/components/SecuritySettings.tsx`
(`mfa.listFactors`, `mfa.enroll`, `mfa.challenge`, `mfa.verify`, `mfa.unenroll`).

Η τιμή **«Verify Enabled»** επιτρέπει μόνο την επαλήθευση ΥΠΑΡΧΟΝΤΩΝ factors και
απορρίπτει το `mfa.enroll()`. Πρακτικά κανένας χρήστης δεν μπορεί να ενεργοποιήσει
MFA· ο κώδικας το πιάνει και εμφανίζει «μη διαθέσιμο» (`setMfaUnavailable`).

**Σωστή τιμή: «Enroll and Verify Enabled».** Είναι δωρεάν.

---

## 5. Γιατί OFF το «Allow manual linking»
Επαληθεύτηκε με σάρωση κώδικα ότι το app δεν καλεί ποτέ `linkIdentity()` /
`unlinkIdentity()` / `getUserIdentities()`. Χρησιμοποιεί μόνο
`signInWithPassword` και `signInWithOAuth({provider:'google'})`. Ο διακόπτης
αφορά μόνο τα ΧΕΙΡΟΚΙΝΗΤΑ endpoints· η αυτόματη αντιστοίχιση «ίδιο email →
ίδιος λογαριασμός» συνεχίζει να δουλεύει κανονικά για το Google.

## 6. Γιατί OFF το «Allow anonymous sign-ins»
Αν ήταν ανοιχτό, οποιοσδήποτε θα έπαιρνε ρόλο `authenticated` χωρίς εγγραφή.
Αυτό θα ακύρωνε τις πολιτικές αποθήκευσης που απευθύνονται σε `authenticated`
(migrations 20260727060000 και 20260727070000).
