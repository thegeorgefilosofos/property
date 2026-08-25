-- ═══════════════════════════════════════════════════════════════════════════
-- ΟΣΟ Ο ΕΜΠΟΡΟΣ ΚΡΑΤΑ ΤΗ ΣΥΝΔΡΟΜΗ, Ο ΛΟΓΑΡΙΑΣΜΟΣ ΔΕΝ ΣΒΗΝΕΤΑΙ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΣΥΝΕΒΑΙΝΕ. Ο πελάτης πατά «παύση» στην πύλη του εμπόρου. Ο webhook
-- γράφει `subscription_status = 'paused'` και, επειδή η παύση δεν δίνει
-- πρόσβαση, ρίχνει το `plan` σε «free». Η `user_plan_rank` βλέπει μηδέν, ο
-- σαρωτής ξεκινά το ρολόι των τριάντα ημερών και την τριακοστή πρώτη η
-- `erase_account` σβήνει μισθωτήρια, ΑΦΜ ενοικιαστών, παραστατικά και αρχεία.
--
-- Ο ΑΝΘΡΩΠΟΣ ΔΕΝ ΕΦΥΓΕ ΠΟΤΕ. Πάτησε παύση, δηλαδή «γυρνάω». Η κάρτα του μένει
-- δηλωμένη στον έμπορο και η συνδρομή του υπαρκτή· εμείς σβήνουμε ταυτόχρονα
-- και τα δεδομένα του και τη ΜΟΝΗ γραμμή που κρατά το `mor_subscription_id`,
-- δηλαδή το μοναδικό αναγνωριστικό με το οποίο θα μπορούσαμε να ακυρώσουμε.
-- Μένει πελάτης χωρίς λογαριασμό και λογαριασμός χωρίς πελάτη.
--
-- Το ίδιο ισχύει και για το `unpaid`: τέσσερις αποτυχημένες προσπάθειες
-- είσπραξης δεν είναι εγκατάλειψη, είναι κάρτα που έληξε. Ο έμπορος θα το πει
-- ο ίδιος όταν τελειώσει, γράφοντας `expired`.
--
-- ── Η ΑΛΛΑΓΗ ΜΠΑΙΝΕΙ ΣΤΟΝ ΜΕΝΤΕΣΕ, ΟΧΙ ΣΕ ΤΡΙΑ ΣΗΜΕΙΑ ───────────────────
-- Η `account_is_exempt` τη ρωτούν και οι τρεις διαδρομές: πού ξεκινά το
-- ρολόι, πού μηδενίζεται και η ίδια η διαγραφή τη στιγμή της πράξης. Αρκεί να
-- μάθει ότι μια ζωντανή συνδρομή στον έμπορο είναι λόγος να μην αγγιχτεί
-- τίποτα. Ενα έκτο φρένο γραμμένο μόνο μέσα στην `purge_lapsed_account` θα
-- σταματούσε τη διαγραφή αλλά θα άφηνε το ρολόι να τρέχει, δηλαδή θα έστελνε
-- στον άνθρωπο δύο ειδοποιήσεις ότι σβήνεται σε επτά και σε μία ημέρα.
--
-- ΠΟΙΕΣ ΚΑΤΑΣΤΑΣΕΙΣ ΔΕΝ ΠΡΟΣΤΑΤΕΥΟΥΝ. Το `cancelled` και το `expired` είναι οι
-- δύο που λένε ότι τελείωσε: εκεί ο έμπορος δεν κρατά τίποτα και ο λογαριασμός
-- ακολουθεί κανονικά τον κύκλο των τριάντα ημερών. Η λίστα δεν επεκτείνεται
-- από εικασία, είναι η ίδια με το `ALREADY_OVER` του lib/billing/lemonPlanChange.ts.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.account_is_exempt(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_admins a
     join auth.users u on lower(btrim(u.email)) = lower(btrim(a.email))
    where u.id = p_uid
  ) or exists (
    select 1 from public.billing_profiles bp
     where bp.user_id = p_uid and bp.tester_since is not null
  ) or exists (
    select 1 from public.billing_profiles bp
     where bp.user_id = p_uid
       and nullif(btrim(coalesce(bp.mor_subscription_id, '')), '') is not null
       and coalesce(bp.subscription_status, '') not in ('cancelled', 'expired')
  )
$$;

alter function public.account_is_exempt(uuid) owner to postgres;
revoke all     on function public.account_is_exempt(uuid) from public, anon, authenticated;
grant  execute on function public.account_is_exempt(uuid) to service_role;

comment on function public.account_is_exempt(uuid) is
  'Λογαριασμοί που δεν χρονομετρούνται ποτέ για διαγραφή: οι διαχειριστές, οι δοκιμαστές και όποιος έχει ακόμη ζωντανή συνδρομή στον έμπορο. Η παύση και η αποτυχημένη είσπραξη ρίχνουν το επίπεδο στο μηδέν χωρίς ο άνθρωπος να έχει φύγει· μόνο το cancelled και το expired λένε ότι τελείωσε. Κάθε άλλη περίπτωση (συνεργάτης, δωρεάν μήνες, κράτηση) έχει ήδη επίπεδο στην user_plan_rank.';

-- ── ΚΑΙ ΤΑ ΡΟΛΟΓΙΑ ΠΟΥ ΤΡΕΧΟΥΝ ΗΔΗ, ΣΤΑΜΑΤΟΥΝ ΤΩΡΑ ──────────────────────
-- Ο σαρωτής θα τα μηδένιζε μόνος του στην επόμενη εκτέλεση, αύριο στις 04:40.
-- Ως τότε μια προειδοποίηση διαγραφής μπορεί να φύγει σε άνθρωπο που πάτησε
-- παύση χθες.
update public.billing_profiles
   set lapsed_at = null
 where lapsed_at is not null
   and nullif(btrim(coalesce(mor_subscription_id, '')), '') is not null
   and coalesce(subscription_status, '') not in ('cancelled', 'expired');
