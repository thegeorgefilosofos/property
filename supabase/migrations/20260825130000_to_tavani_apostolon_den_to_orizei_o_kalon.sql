-- ═══════════════════════════════════════════════════════════════════════════
-- ΤΟ ΤΑΒΑΝΙ ΚΑΙ ΤΟ ΠΑΡΑΘΥΡΟ ΤΑ ΟΡΙΖΕΙ Η ΣΥΝΑΡΤΗΣΗ, ΟΧΙ Ο ΚΑΛΩΝ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ, ΜΕ ΤΑ ΛΟΓΙΑ ΤΗΣ ΕΠΙΘΕΣΗΣ. Η `bump_send_quota` έχει `grant execute`
-- στον ρόλο `authenticated`, δηλαδή κάθε συνδεδεμένος χρήστης μπορεί να την
-- καλέσει ο ίδιος από τον περιηγητή του. Το ταβάνι και το παράθυρο έρχονταν ως
-- ορίσματα και το μόνο που τα έσφιγγε ήταν «όχι κάτω από μία ώρα» και «όχι πάνω
-- από 5.000».
--
-- Ο μετρητής κρατά ΕΝΑ κουβά ανά (χρήστη, είδος) και ο κουβάς κυλά όταν
-- «bucket + παράθυρο <= τώρα». Το παράθυρο όμως το έδινε ο καλών. Αρκούσε
-- λοιπόν μία κλήση με `p_window: '1 hour'` για να θεωρηθεί ο κουβάς ληγμένος
-- και να ΜΗΔΕΝΙΣΤΕΙ: το ημερήσιο όριο των 3.000 παραληπτών γινόταν 3.000 ανά
-- ώρα, με δική μας χρέωση στον πάροχο ηλεκτρονικού ταχυδρομείου και δική μας
-- φήμη τομέα στο παιχνίδι. Με τον ίδιο τρόπο, οι πέντε προσπάθειες κωδικού
-- δοκιμαστή ανά εικοσιτετράωρο γίνονταν πέντε ανά ώρα.
--
-- ── Η ΔΙΟΡΘΩΣΗ: ΕΝΑΣ ΠΙΝΑΚΑΣ ΟΡΙΩΝ ΜΕΣΑ ΣΤΗ ΒΑΣΗ ────────────────────────
-- Τα όρια είναι πια δικά μας και όχι πρόταση του καλούντα. Τα δύο ορίσματα
-- ΜΕΝΟΥΝ στην υπογραφή: πέντε καλούντες τα περνούν σήμερα και μια αλλαγή
-- υπογραφής θα τους έσπαγε όλους ταυτόχρονα, σε λειτουργία. Αγνοούνται.
--
-- ΚΑΙ ΤΟ ΑΓΝΩΣΤΟ ΕΙΔΟΣ ΔΕΝ ΠΕΡΝΑ. Ενα προεπιλεγμένο όριο για ό,τι δεν
-- αναγνωρίζεται θα σήμαινε ότι ένας νέος καλών παίρνει σιωπηλά κάποιο νούμερο
-- που δεν διάλεξε κανείς. Καλύτερα να κλείσει η πόρτα με λόγο: ο φύλακας
-- `guard-send-quota` δεν αφήνει τέτοιον καλούντα να φτάσει ποτέ σε λειτουργία.
--
-- ΤΑ ΝΟΥΜΕΡΑ ΕΙΝΑΙ ΑΚΡΙΒΩΣ ΟΣΑ ΕΤΡΕΧΑΝ. Καμία αλλαγή συμπεριφοράς για τον
-- νόμιμο χρήστη: αντιγράφηκαν ένα προς ένα από τους πέντε καλούντες.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.send_quota_rule(p_kind text)
returns table (max_units int, window_span interval)
language sql immutable set search_path = public as $$
  select t.max_units, t.window_span
    from (values
      ('client_email',      3000, interval '24 hours'),
      ('org_invite',          20, interval '24 hours'),
      ('test_notification',   10, interval '24 hours'),
      ('tester_code',          5, interval '24 hours'),
      ('ical_preview',        60, interval  '1 hour')
    ) as t(kind, max_units, window_span)
   where t.kind = btrim(coalesce(p_kind, ''))
$$;

alter function public.send_quota_rule(text) owner to postgres;
revoke all     on function public.send_quota_rule(text) from public, anon;
grant  execute on function public.send_quota_rule(text) to authenticated, service_role;

comment on function public.send_quota_rule(text) is
  'Το ταβάνι και το παράθυρο κάθε είδους αποστολής. Μία πηγή, μέσα στη βάση: όσο τα έδινε ο καλών, κάθε συνδεδεμένος χρήστης μπορούσε να μηδενίσει τον δικό του μετρητή καλώντας με μικρότερο παράθυρο. Αγνωστο είδος δεν επιστρέφει γραμμή και ο μετρητής κλείνει την πόρτα.';

create or replace function public.bump_send_quota(
  p_kind text, p_units integer, p_max integer, p_window interval
) returns json
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_units integer; v_bucket timestamptz;
  v_window interval; v_max integer;
begin
  if v_uid is null then
    return json_build_object('allowed', false, 'reason', 'auth');
  end if;
  if p_units is null or p_units < 1 then
    return json_build_object('allowed', false, 'reason', 'units');
  end if;

  -- ΤΑ ΟΡΙΑ ΕΡΧΟΝΤΑΙ ΑΠΟ ΕΔΩ ΚΑΙ ΜΟΝΟ. Τα `p_max` και `p_window` αγνοούνται:
  -- μένουν στην υπογραφή για να μη σπάσουν οι πέντε καλούντες που τα περνούν.
  select r.max_units, r.window_span into v_max, v_window
    from public.send_quota_rule(p_kind) r;
  if v_max is null then
    return json_build_object('allowed', false, 'reason', 'unknown_kind');
  end if;

  insert into public.send_quota (user_id, kind, bucket, units, updated_at)
       values (v_uid, p_kind, v_now, p_units, v_now)
  on conflict (user_id, kind) do update set
    units      = case when public.send_quota.bucket + v_window <= v_now then p_units
                      else public.send_quota.units + p_units end,
    bucket     = case when public.send_quota.bucket + v_window <= v_now then v_now
                      else public.send_quota.bucket end,
    updated_at = v_now
  returning units, bucket into v_units, v_bucket;

  if v_units > v_max then
    update public.send_quota set units = greatest(v_units - p_units, 0)
     where user_id = v_uid and kind = p_kind;
    return json_build_object(
      'allowed', false, 'reason', 'quota', 'max', v_max,
      'retry_after', extract(epoch from (v_bucket + v_window - v_now))::bigint);
  end if;

  return json_build_object('allowed', true, 'units', v_units, 'max', v_max);
end $$;

alter function public.bump_send_quota(text, integer, integer, interval) owner to postgres;
revoke all     on function public.bump_send_quota(text, integer, integer, interval) from public, anon;
grant  execute on function public.bump_send_quota(text, integer, integer, interval) to authenticated, service_role;

comment on function public.bump_send_quota(text, integer, integer, interval) is
  'Μετρητής αποστολών ανά (χρήστη, είδος). Το ταβάνι και το παράθυρο τα ορίζει η send_quota_rule και ΟΧΙ ο καλών: τα ορίσματα p_max και p_window αγνοούνται και μένουν μόνο για συμβατότητα υπογραφής. Αγνωστο είδος κλείνει την πόρτα με reason=unknown_kind.';
