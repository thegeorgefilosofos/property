-- ═══════════════════════════════════════════════════════════════════════════
-- ΔΥΟ ΕΥΡΗΜΑΤΑ ΤΟΥ ΕΛΕΓΚΤΗ ΤΗΣ SUPABASE, ΜΕΤΑ ΤΗΝ ΕΦΑΡΜΟΓΗ ΤΩΝ ΜΕΤΑΝΑΣΤΕΥΣΕΩΝ
-- ─────────────────────────────────────────────────────────────────────────
-- 1) `plan_max_properties` ΧΩΡΙΣ ΚΑΡΦΩΜΕΝΟ search_path
--
-- Το `20260804090000_pin_function_search_path` έκλεισε ακριβώς αυτό για τις
-- συναρτήσεις του PIN και έθεσε τον κανόνα του έργου: κάθε συνάρτηση καρφώνει
-- το search_path της. Η `plan_max_properties`, που γεννήθηκε στο
-- `20260805090000_solo_plan`, τον παρέλειψε.
--
-- Εδώ ο κίνδυνος είναι μικρότερος από ό,τι στις άλλες — η συνάρτηση είναι
-- SECURITY INVOKER και δεν αγγίζει κανέναν πίνακα, μόνο ένα `case`. Δεν είναι
-- όμως λόγος να μείνει η μόνη εξαίρεση σε έναν κανόνα: ο κανόνας που έχει μία
-- εξαίρεση παύει να διαβάζεται ως κανόνας και η επόμενη συνάρτηση που θα τον
-- παραβεί ΘΑ αγγίζει πίνακες.
--
-- 2) ΔΕΥΤΕΡΗ ΥΠΟΓΡΑΦΗ `bump_ai_usage(integer, integer)` — ΝΕΚΡΗ
--
-- Η παλιά εκδοχή δύο ορισμάτων επιβίωσε δίπλα στη νέα των τεσσάρων. Καμία από
-- τις δύο κλήσεις της εφαρμογής δεν τη χρησιμοποιεί:
--
--     app/api/anthropic/route.tsx            → p_max_min, p_day, p_month, p_pool
--     supabase/functions/smart-suggestions   → p_max_min, p_day, p_month, p_pool
--
-- Δεν είναι αβλαβής. Είναι SECURITY DEFINER, εκτελέσιμη από `authenticated`,
-- και επιβάλλει ΜΟΝΟ ημερήσιο όριο — χωρίς μηνιαίο, χωρίς κοινόχρηστο ταβάνι,
-- χωρίς διάκριση πλάνου. Όποιος την καλέσει, κατά λάθος ή επίτηδες, περνά από
-- τα μισά όρια. Ένα ξεχασμένο μονοπάτι γύρω από τον περιορισμό κόστους δεν
-- είναι νεκρός κώδικας· είναι ανοιχτή πόρτα.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.plan_max_properties(p_rank int)
returns int language sql immutable
set search_path = public
as $$
  select case p_rank
           when 4 then 2147483647   -- Γραφείο: απεριόριστα
           when 3 then 15           -- Επαγγελματίας
           when 2 then 3            -- Ιδιοκτήτης
           when 1 then 1            -- Ένα ακίνητο (solo)
           else 1                   -- Δωρεάν
         end;
$$;

drop function if exists public.bump_ai_usage(integer, integer);

do $$
declare v_n int;
begin
  if (select coalesce(array_to_string(proconfig, ','), '') not like '%search_path%'
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'plan_max_properties') then
    raise exception 'η plan_max_properties δεν έχει καρφωμένο search_path';
  end if;

  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'bump_ai_usage';
  if v_n <> 1 then
    raise exception 'η bump_ai_usage πρέπει να έχει ΜΙΑ υπογραφή, βρέθηκαν %', v_n;
  end if;
end $$;
