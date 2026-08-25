-- ═══════════════════════════════════════════════════════════════════════════
-- ΤΕΣΣΕΡΙΣ ΣΥΝΑΡΤΗΣΕΙΣ ΧΩΡΙΣ ΚΛΕΙΔΩΜΕΝΟ search_path
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΑΝΕΦΕΡΕ Ο ΕΛΕΓΚΤΗΣ ΤΟΥ SUPABASE (25/08/2026): `function_search_path_mutable`
-- σε τέσσερις συναρτήσεις. Οι υπόλοιπες 68 του σχήματος το δηλώνουν ήδη· αυτές
-- οι τέσσερις γράφτηκαν αργότερα και ξέφυγαν.
--
-- ΓΙΑΤΙ ΕΧΕΙ ΣΗΜΑΣΙΑ. Οταν μια συνάρτηση δεν καθορίζει `search_path`, το
-- κληρονομεί από τον καλούντα. Οποιος μπορεί να ορίσει δικό του search_path και
-- να φτιάξει σχήμα με ομώνυμο αντικείμενο, αλλάζει το τι εκτελεί η συνάρτηση —
-- και δύο από αυτές είναι triggers που φυλάνε δεδομένα από αλλοίωση:
--
--   lock_inbound_facts   κρατά αμετάβλητο το τι έγραφε το εισερχόμενο μήνυμα
--   lock_push_delivery   κρατά στον διακομιστή το πότε στάλθηκε μια ειδοποίηση
--
-- Μια πύλη που μπορεί να αλλάξει ταυτότητα δεν είναι πύλη.
--
-- ΤΑ ΣΩΜΑΤΑ ΕΙΝΑΙ ΑΥΤΟΥΣΙΑ. Δεν αλλάζει ούτε χαρακτήρας λογικής: μόνο η ρήτρα
-- `set search_path to 'public'` προστίθεται, η ίδια που έχουν ήδη οι άλλες 68.
-- Το `auth.uid()` του lock_push_delivery είναι ήδη πλήρως προσδιορισμένο, άρα
-- το 'public' αρκεί.
--
-- ΓΙΑΤΙ ΔΕΝ ΠΕΙΡΑΖΕΙ ΤΟ INLINING. Μια συνάρτηση με ρήτρα SET δεν ενσωματώνεται
-- από τον σχεδιαστή. Οι δύο σταθερές χρησιμοποιούνται ΜΟΝΟ μέσα σε σώματα
-- plpgsql — ποτέ σε ευρετήριο ή σε παραγόμενη στήλη — οπότε δεν χάνεται τίποτα.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.trial_days()
returns int language sql immutable
set search_path to 'public'
as $$ select 30 $$;

create or replace function public.account_grace_days()
returns int language sql immutable
set search_path to 'public'
as $$ select 30 $$;

create or replace function public.lock_inbound_facts()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.provider_id  is distinct from old.provider_id
  or new.user_id      is distinct from old.user_id
  or new.received_at  is distinct from old.received_at
  or new.from_address is distinct from old.from_address
  or new.subject      is distinct from old.subject
  or new.vendor       is distinct from old.vendor
  or new.amount       is distinct from old.amount
  or new.due_date     is distinct from old.due_date
  or new.issue_date   is distinct from old.issue_date
  or new.attachments  is distinct from old.attachments then
    raise exception 'INBOUND_READONLY: το τι έγραφε το μήνυμα δεν ξαναγράφεται'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function public.lock_push_delivery()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is not null then
    new.last_sent_at := old.last_sent_at;
    new.failures     := old.failures;
    new.user_id      := old.user_id;
    new.created_at   := old.created_at;
  end if;
  return new;
end;
$$;
