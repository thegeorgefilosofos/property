-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΑΥΤΟΣΥΣΤΑΣΗ ΜΕ ΤΟ ΙΔΙΟ ΤΗΛΕΦΩΝΟ ΔΕΝ ΠΕΡΝΑ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ: Ο ΚΑΝΟΝΑΣ ΗΤΑΝ ΓΡΑΜΜΕΝΟΣ ΚΑΙ ΔΕΝ ΤΟΝ ΕΤΡΕΧΕ ΚΑΝΕΙΣ.
--
-- Στο `lib/referral/referral.ts` ζει η `isSelfOrDuplicate`, με τεστ και με
-- προσεγμένο σχόλιο για το κατώφλι των εννιά ψηφίων. Κόβει τη σύσταση όταν ο
-- συστήνων και ο συστηνόμενος έχουν ίδιο αναγνωριστικό, ίδιο email, ίδιο
-- τηλέφωνο ή ίδια συσκευή.
--
-- ΚΑΜΙΑ ΟΘΟΝΗ ΚΑΙ ΚΑΜΙΑ ΣΥΝΑΡΤΗΣΗ ΔΕΝ ΤΗΝ ΚΑΛΟΥΣΕ. Την ανακάλυψε ο φύλακας
-- νεκρών εξαγωγών: εμφανιζόταν ΜΟΝΟ στο δικό της τεστ. Η μόνη πραγματική
-- φύλαξη ήταν εδώ, στη `redeem_referral`· έλεγχε δύο πράγματα: ότι ο
-- κάτοχος του κωδικού δεν είναι ο ίδιος ο χρήστης· και ότι ο λογαριασμός είναι
-- νεότερος των δεκατεσσάρων ημερών.
--
-- ΤΙ ΣΗΜΑΙΝΕΙ ΠΡΑΚΤΙΚΑ: δεύτερος λογαριασμός με άλλο email αλλά ΤΟ ΙΔΙΟ
-- τηλέφωνο περνούσε καθαρός και μετρούσε κανονικά για μπόνους. Το μπόνους
-- σύστασης είναι το ένα από τα δύο μόνο δωρεάν πράγματα του προϊόντος, οπότε
-- ένας κανόνας anti-abuse που δεν τρέχει δεν είναι απλώς νεκρός κώδικας:
-- διαβάζεται ως προστασία που δεν υπάρχει.
--
-- ═══ ΤΙ ΕΠΙΒΑΛΛΕΤΑΙ ΕΔΩ, ΚΑΙ ΤΙ ΔΕΝ ΜΠΟΡΕΙ ═══════════════════════════════
--
-- ΤΟ ΤΗΛΕΦΩΝΟ, ΝΑΙ. Το `billing_profiles.phone` υπάρχει και για τους δύο και η
-- συνάρτηση είναι `security definer`, οπότε τα βλέπει και τα δύο χωρίς να
-- εκτεθεί τίποτα στον πελάτη. Το κατώφλι των εννιά ψηφίων μεταφέρεται αυτούσιο
-- από την TypeScript: δύο μισοσυμπληρωμένα τηλέφωνα («694», «694») δεν είναι
-- απόδειξη ότι πρόκειται για το ίδιο πρόσωπο και θα έκοβαν άδικα μια αληθινή
-- παραπομπή.
--
-- ΤΟ EMAIL, ΔΕΝ ΧΡΕΙΑΖΕΤΑΙ. Το `auth.users.email` είναι μοναδικό: δύο
-- λογαριασμοί ΔΕΝ γίνεται να έχουν το ίδιο. Ο έλεγχος ισότητας δεν θα έπιανε
-- ποτέ τίποτα. Ο,τι θα έπιανε κάτι είναι η κανονικοποίηση ψευδωνύμων (τελείες
-- και «+1» του Gmail) και αυτό ΔΕΝ μπαίνει: κόβει και αληθινούς ανθρώπους που
-- τυχαίνει να μοιράζονται πάροχο· ούτε είναι γραμμένος κανόνας του
-- προϊόντος για να τον επιβάλω μόνος μου.
--
-- Η ΣΥΣΚΕΥΗ, ΔΕΝ ΓΙΝΕΤΑΙ ΑΠΟ ΕΔΩ. Η βάση δεν έχει σήμα συσκευής και δεν
-- πρόκειται να το εφεύρω: θα ήθελε αποτύπωμα από τον πελάτη, που είναι και
-- παρακάμψιμο και βαρύ σε προσωπικά δεδομένα. Μένει άλυτο και γραμμένο.
--
-- ΤΟ «ΝΕΟΣ ΧΡΗΣΤΗΣ» ΚΑΙ ΤΟ «ΑΛΛΟΣ ΑΠΟ ΤΟΝ ΕΑΥΤΟ ΤΟΥ» τα φύλαγε ήδη αυτή η
-- συνάρτηση σωστά. Η `isValidReferral` της TypeScript δεν έλεγε τίποτα
-- παραπάνω: ήταν δεύτερο αντίγραφο του ίδιου κανόνα, σε γλώσσα που δεν τρέχει
-- στον διακομιστή. Και τα δύο αντίγραφα φεύγουν από την TypeScript στο ίδιο
-- commit· ο κανόνας μένει εδώ, όπου επιβάλλεται.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.redeem_referral(p_code text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_owner uuid;
  v_created timestamptz;
  v_ref_phone text;
  v_new_phone text;
begin
  if p_code is null or length(trim(p_code)) = 0 then return; end if;

  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner = auth.uid() then return; end if;

  select created_at into v_created from auth.users where id = auth.uid();
  if v_created is null or v_created < now() - interval '14 days' then return; end if;

  -- ΙΔΙΟ ΤΗΛΕΦΩΝΟ ΣΗΜΑΙΝΕΙ ΙΔΙΟ ΠΡΟΣΩΠΟ, ΟΤΑΝ ΕΙΝΑΙ ΟΛΟΚΛΗΡΟ.
  -- Ιδια κανονικοποίηση με τη `normalizePhone`: κρατά μόνο ψηφία, βγάζει το
  -- διεθνές πρόθεμα «0030» και το «30» όταν το σύνολο είναι δώδεκα ψηφία.
  select nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')
    into v_ref_phone from billing_profiles where user_id = v_owner;
  select nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')
    into v_new_phone from billing_profiles where user_id = auth.uid();

  v_ref_phone := case
    when v_ref_phone like '0030%' then substr(v_ref_phone, 5)
    when v_ref_phone like '30%' and length(v_ref_phone) = 12 then substr(v_ref_phone, 3)
    else v_ref_phone end;
  v_new_phone := case
    when v_new_phone like '0030%' then substr(v_new_phone, 5)
    when v_new_phone like '30%' and length(v_new_phone) = 12 then substr(v_new_phone, 3)
    else v_new_phone end;

  if v_ref_phone is not null and length(v_ref_phone) >= 9 and v_ref_phone = v_new_phone then
    return;
  end if;

  insert into referrals (code, referred_user_id, referrer_user_id)
       values (p_code, auth.uid(), v_owner)
  on conflict (referred_user_id) do nothing;
end; $$;

comment on function public.redeem_referral(text) is
  'Καταγράφει σύσταση. Κόβει: ίδιος χρήστης, λογαριασμός άνω των 14 ημερών, ίδιο πλήρες τηλέφωνο με τον συστήνοντα.';
