-- ═══════════════════════════════════════════════════════════════════════════
-- ΤΕΣΣΕΡΙΣ ΠΙΝΑΚΕΣ ΜΕ ΕΝΑ ΜΟΝΟ ΚΛΕΙΔΙ ΣΤΗΝ ΠΟΡΤΑ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΒΡΕΘΗΚΕ, ΜΕΤΡΗΜΕΝΟ ΣΤΟΝ ΚΑΤΑΛΟΓΟ ΤΗΣ ΠΑΡΑΓΩΓΗΣ. Τέσσερις πίνακες έχουν
-- RLS ενεργό και ΜΗΔΕΝ πολιτικές:
--
--     email_outbox                (ουρά εξερχόμενων: διευθύνσεις, περιεχόμενο)
--     invoice_counters            (η αρίθμηση των παραστατικών)
--     referrals                   (κωδικοί και ανταμοιβές πρόσκλησης)
--     feedback_campaign_winners   (οι νικητές της κλήρωσης)
--
-- Ταυτόχρονα, οι ρόλοι `anon` και `authenticated` κρατούν πάνω τους ΠΛΗΡΗ
-- δικαιώματα — SELECT, INSERT, UPDATE, DELETE και TRUNCATE. Είναι η προεπιλογή
-- της πλατφόρμας (`grant all on all tables to anon, authenticated`), δεν την
-- έγραψε κανείς επίτηδες.
--
-- ΔΕΝ ΕΙΝΑΙ ΕΝΕΡΓΗ ΔΙΑΡΡΟΗ, ΚΑΙ ΔΕΝ ΓΡΑΦΕΤΑΙ ΕΤΣΙ. Το RLS χωρίς πολιτικές
-- αρνείται τα πάντα, οπότε σήμερα κανένας συνδεδεμένος χρήστης δεν διαβάζει
-- ούτε γραμμή. Το πρόβλημα είναι ΔΟΜΙΚΟ: η άρνηση στηρίζεται σε ΕΝΑ μηχανισμό.
-- Την ημέρα που κάποιος προσθέσει μία πολιτική για έναν συγκεκριμένο σκοπό —
-- π.χ. «να βλέπει ο χρήστης τις δικές του προσκλήσεις» — ο πίνακας ανοίγει για
-- ΟΛΑ όσα επιτρέπουν τα δικαιώματα, όχι μόνο γι' αυτό που ήθελε η πολιτική.
-- Και η επόμενη πολιτική γράφεται πάντα υπό πίεση, όχι σε ήρεμη στιγμή.
--
-- Με δύο ανεξάρτητες κλειδαριές, η ίδια απροσεξία δεν αρκεί: χρειάζεται και
-- πολιτική ΚΑΙ δικαίωμα. Αυτό είναι όλο το περιεχόμενο αυτής της μετανάστευσης.
--
-- ΓΙΑΤΙ ΕΙΝΑΙ ΑΠΟΔΕΔΕΙΓΜΕΝΑ ΟΥΔΕΤΕΡΗ. Ελέγχθηκε, πριν γραφτεί, ότι κάθε
-- διαδρομή προς αυτούς τους πίνακες παρακάμπτει ούτως ή άλλως τα δικαιώματα
-- των δύο ρόλων:
--
--   · Δεκατέσσερις συναρτήσεις τους αγγίζουν και ΟΛΕΣ είναι SECURITY DEFINER
--     με ιδιοκτήτη `postgres` (claim_referral_bonus, next_invoice_number,
--     enqueue_email, drain_email_outbox, get_referral_* κ.λπ.). Η DEFINER τρέχει
--     με τα δικαιώματα του ιδιοκτήτη — η ανάκληση δεν την αγγίζει.
--   · Οι τρεις συναρτήσεις INVOKER (can_send_marketing, try/release_email_
--     schedule_lock) είναι εκτελέσιμες ΜΟΝΟ από `service_role`.
--   · Η edge function `schedule-email-outbox` συνδέεται με SERVICE_KEY.
--   · Καμία γραμμή του πελάτη δεν διαβάζει αυτούς τους πίνακες: μηδέν αναφορές
--     σε .tsx και .ts εκτός των edge functions.
--
-- ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν αγγίζει τους τέσσερις υπόλοιπους πίνακες χωρίς πολιτική
-- (ai_budget, ai_usage, cron_secrets, portal_pin_attempts): εκεί τα δικαιώματα
-- έχουν ήδη ανακληθεί και η κατάσταση είναι η επιθυμητή. Δεν αγγίζει κανέναν
-- πίνακα ΜΕ πολιτικές: εκεί η πολιτική είναι ο πραγματικός έλεγχος και η
-- ανάκληση δικαιωμάτων θα έσπαγε την εφαρμογή.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  leftover int;
begin
  foreach t in array array[
    'email_outbox', 'invoice_counters', 'referrals', 'feedback_campaign_winners'
  ] loop
    -- ΑΣΦΑΛΙΣΤΙΚΗ ΔΙΚΛΕΙΔΑ, ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΔΙΑΚΟΣΜΗΤΙΚΗ. Αν κάποια στιγμή
    -- προστεθεί πολιτική σε έναν από αυτούς τους πίνακες, σημαίνει ότι κάποιος
    -- ΘΕΛΗΣΕ να τον διαβάζει ρόλος πελάτη. Τότε η ανάκληση θα έσπαγε λειτουργία,
    -- και η μετανάστευση σταματά αντί να το κάνει σιωπηλά.
    select count(*) into leftover
      from pg_policies where schemaname = 'public' and tablename = t;
    if leftover > 0 then
      raise exception
        'Ο πίνακας %.% απέκτησε % πολιτικές. Η ανάκληση δικαιωμάτων θα τις ακύρωνε στην πράξη — έλεγξέ το με το χέρι.',
        'public', t, leftover;
    end if;

    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── Η ΑΠΟΔΕΙΞΗ, ΜΕΣΑ ΣΤΗΝ ΙΔΙΑ ΣΥΝΑΛΛΑΓΗ ─────────────────────────────────
-- Μια μετανάστευση ασφαλείας που «έτρεξε χωρίς σφάλμα» δεν έχει αποδείξει
-- τίποτα: το `revoke` σε δικαίωμα που δεν υπάρχει είναι επίσης επιτυχία. Εδώ
-- επιβεβαιώνεται το ΑΠΟΤΕΛΕΣΜΑ και αν δεν ισχύει, η συναλλαγή γυρίζει πίσω.
do $$
declare
  remaining int;
begin
  select count(*) into remaining
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('email_outbox', 'invoice_counters', 'referrals', 'feedback_campaign_winners')
     and grantee in ('anon', 'authenticated');

  if remaining <> 0 then
    raise exception 'Απέμειναν % δικαιώματα για anon/authenticated στους πίνακες μόνο-υπηρεσίας.', remaining;
  end if;

  -- Και ο ρόλος που ΠΡΕΠΕΙ να τους φτάνει, τους φτάνει ακόμη.
  select count(*) into remaining
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('email_outbox', 'invoice_counters', 'referrals', 'feedback_campaign_winners')
     and grantee = 'service_role'
     and privilege_type = 'SELECT';

  if remaining <> 4 then
    raise exception 'Ο service_role έχασε πρόσβαση: % από 4 πίνακες με SELECT.', remaining;
  end if;
end $$;
