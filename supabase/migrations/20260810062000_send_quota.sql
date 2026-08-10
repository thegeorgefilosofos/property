-- ═══════════════════════════════════════════════════════════════════════════
-- ΤΟ ΟΡΙΟ ΑΠΟΣΤΟΛΩΝ ΔΕΝ ΤΟ ΚΡΑΤΑΕΙ ΑΥΤΟΣ ΠΟΥ ΜΕΤΡΙΕΤΑΙ
-- ─────────────────────────────────────────────────────────────────────────
-- Το ημερήσιο ταβάνι της `send-client-email` μετρούσε το άθροισμα του
-- `email_campaigns.recipient_count` του ίδιου του χρήστη. Η πολιτική
-- `own_email_campaigns` είναι `FOR ALL` και ο ρόλος `authenticated` έχει
-- `GRANT ALL`, άρα ο μετρούμενος έσβηνε τον μετρητή του:
--
--     delete from email_campaigns where user_id = auth.uid();   -- ταβάνι στο μηδέν
--
-- Επανάληψη ⇒ απεριόριστη μαζική αποστολή από το domain και τη φήμη αποστολής
-- του προϊόντος, με χρέωση στον λογαριασμό Resend του ιδιοκτήτη. Η
-- `send-test-notification` δεν είχε καν ταβάνι: ένα βρόχος `while(true)` σε
-- κονσόλα φυλλομετρητή χρεώνει όσο αντέχει η γραμμή.
--
-- Η ΑΡΧΗ: μετρητής ορίου δεν ζει σε γραμμή που γράφει ο μετρούμενος. Ίδιο μοτίβο
-- με το `ai_usage` (20260724093000) και τα `portal_pin_attempts`: πίνακας που δεν
-- τον αγγίζει κανένας ρόλος πελάτη, και μία μόνο συνάρτηση που τον ανεβάζει.
--
-- Ο πίνακας `email_campaigns` παραμένει ό,τι ήταν — ιστορικό για τον χρήστη, όχι
-- κλειδαριά. Το να είναι διαγράψιμο ιστορικό είναι σωστό· λάθος ήταν να κρέμεται
-- η κλειδαριά από αυτό.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.send_quota (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  kind       text        not null,
  bucket     timestamptz not null default now(),
  units      integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.send_quota enable row level security;

-- Καμία πολιτική, κανένα δικαίωμα: μόνο η συνάρτηση από κάτω τον αγγίζει.
revoke all on table public.send_quota from anon, authenticated;

comment on table public.send_quota is
  'Μετρητές ορίου αποστολών ανά χρήστη και είδος. Μόνο-υπηρεσίας: ο μετρούμενος δεν τον φτάνει.';

-- ── Ανεβάζει τον μετρητή και απαντά αν χωράει ──────────────────────────────
-- Κυλιόμενο παράθυρο ανά είδος. Όταν το παράθυρο έχει λήξει, ο μετρητής ξεκινά
-- από την αρχή· αλλιώς προστίθεται. Αν το αποτέλεσμα ξεπερνά το ταβάνι, οι
-- μονάδες αφαιρούνται πάλι, ώστε μια απορριφθείσα προσπάθεια να μη σπρώχνει το
-- παράθυρο πιο μακριά — δεν τιμωρείται όποιος χτύπησε το όριο μία φορά.
create or replace function public.bump_send_quota(
  p_kind text, p_units integer, p_max integer, p_window interval
) returns json
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_units integer; v_bucket timestamptz;
begin
  if v_uid is null then
    return json_build_object('allowed', false, 'reason', 'auth');
  end if;
  if p_units is null or p_units < 1 then
    return json_build_object('allowed', false, 'reason', 'units');
  end if;

  insert into public.send_quota (user_id, kind, bucket, units, updated_at)
       values (v_uid, p_kind, v_now, p_units, v_now)
  on conflict (user_id, kind) do update set
    units      = case when public.send_quota.bucket + p_window <= v_now then p_units
                      else public.send_quota.units + p_units end,
    bucket     = case when public.send_quota.bucket + p_window <= v_now then v_now
                      else public.send_quota.bucket end,
    updated_at = v_now
  returning units, bucket into v_units, v_bucket;

  if v_units > p_max then
    update public.send_quota set units = greatest(v_units - p_units, 0)
     where user_id = v_uid and kind = p_kind;
    return json_build_object(
      'allowed', false, 'reason', 'cap',
      'used', greatest(v_units - p_units, 0), 'max', p_max,
      'resets_at', v_bucket + p_window
    );
  end if;

  return json_build_object('allowed', true, 'used', v_units, 'max', p_max, 'resets_at', v_bucket + p_window);
end; $$;

revoke all on function public.bump_send_quota(text, integer, integer, interval) from public, anon;
grant execute on function public.bump_send_quota(text, integer, integer, interval) to authenticated, service_role;

comment on function public.bump_send_quota(text, integer, integer, interval) is
  'Ανεβάζει τον μετρητή αποστολών του καλούντος και λέει αν χωράει. Ο μετρητής ζει σε πίνακα που ο πελάτης δεν αγγίζει.';
